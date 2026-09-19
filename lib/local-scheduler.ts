import 'server-only';
import { z } from 'zod';
import { mutateStandalone, item } from './demo';
import { provider, generate, structuredReply } from './ai';
import type { Item, LocalWorkspace } from './types';

const researchResults = z.object({
  results: z.array(z.object({ title: z.string(), url: z.url(), content: z.string() })),
});

// Stesso intervallo minimo tra due cicli usato in modalità Supabase (lib/ai.ts schedule()).
const MIN_INTERVAL_MS = 55 * 60000;

type PendingJob = { conversationId: string; projectId: string | null; reasonForCheck: string };

/**
 * Equivalente di schedule()+processJob() (lib/ai.ts) per chi NON collega Supabase.
 *
 * IMPORTANTE: mutateStandalone() serializza TUTTE le scritture sul file locale
 * (workspace.json) — comprese quelle di ogni azione utente reale: mandare un
 * messaggio, approvare una proposta, salvare un task. Prima, l'intero ciclo
 * dello scheduler (incluse le chiamate di rete al provider AI, fino a 45s
 * l'una, per ogni conversazione attiva) girava dentro un'unica mutateStandalone:
 * finché lo scheduler lavorava, QUALSIASI azione dell'utente restava in coda e
 * bloccata, anche per un minuto o più. Ora il lock viene preso solo per le
 * letture/scritture istantanee; le chiamate di rete restano fuori dal lock.
 */
export async function runLocalScheduler(): Promise<{ processed: number; reason: string }> {
  let processed = 0;

  // Fase 1 (lock breve): il cancello dei 55 minuti. Se è il turno giusto,
  // riserviamo subito lo slot per evitare doppie esecuzioni concorrenti.
  const gate = await mutateStandalone((s: LocalWorkspace) => {
    const now = new Date();
    const last = s.schedulerLastRun ? new Date(s.schedulerLastRun) : null;
    if (last && now.getTime() - last.getTime() < MIN_INTERVAL_MS) return null;
    s.schedulerLastRun = now.toISOString();
    return { now, last };
  });
  if (!gate) return { processed: 0, reason: 'nessun controllo dovuto' };
  const { now, last } = gate;

  const hour = Number(
    new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  );
  const scheduledReason =
    hour === 8
      ? `BRIEFING MATTUTINO — Analizza la situazione attuale del progetto e scrivi un briefing concreto per il team. 
Struttura: (1) Stato rapido: cosa è in corso, cosa è bloccato, cosa è in ritardo. 
(2) Focus di oggi: 1-2 cose su cui concentrarsi, con motivazione basata sui dati disponibili. 
(3) Se vedi rischi o opportunità che il team potrebbe non aver considerato, segnalali ora. 
(4) Proponi task specifici solo se sono realistici e assegnabili a qualcuno disponibile. 
Sii diretto e utile — non ripetere cose già dette ieri se non sono cambiate.`
      : hour === 20
        ? `REPORT SERALE — Scrivi il report di fine giornata per il team.
Struttura: (1) Cosa è stato fatto oggi (solo fatti concreti dal contesto, non inventare). 
(2) Chi ha avanzato e su cosa. (3) Blocchi aperti e cosa serve per sbloccarli. 
(4) Risultati misurabili se presenti (views, vendite, completamenti, ecc). 
(5) Piano di domani: 1-3 priorità concrete con motivazione. 
Se la giornata è stata ferma o non hai dati sufficienti, dillo chiaramente invece di inventare attività.`
        : null;

  let key: string, model: string;
  try {
    ({ key, model } = await provider());
  } catch {
    return { processed: 0, reason: 'nessuna chiave AI configurata' };
  }

  // Fase 2 (lock breve): calcola SOLO quali conversazioni/promemoria vanno
  // processati, senza fare rete. Nessuna chiamata AI qui dentro.
  const { jobs, reminderJobs } = await mutateStandalone((s: LocalWorkspace) => {
    // Solo chat di gruppo: ARPAC non scrive spontaneamente nelle chat private.
    const conversations = s.items.filter((i) => i.kind === 'conversation' && !i.owner_id);
    const jobs: PendingJob[] = [];
    for (const c of conversations) {
      const changedSince = s.items.some(
        (r) =>
          r.updated_at > (last?.toISOString() || '1970-01-01T00:00:00.000Z') &&
          ['task', 'financial_entry', 'ai_proposal', 'task_update'].includes(r.kind) &&
          r.project_id === c.project_id,
      );
      if (!scheduledReason && !changedSince) continue;
      jobs.push({
        conversationId: c.id,
        projectId: c.project_id,
        reasonForCheck:
          scheduledReason ||
          `AGGIORNAMENTO — Ci sono stati cambiamenti nel progetto dall'ultimo controllo. 
Analizza cosa è cambiato, valuta l'impatto sul piano complessivo e scrivi solo se hai qualcosa di concreto da aggiungere: 
un rischio che emerge, un'opportunità da cogliere, una proposta specifica, o un dato rilevante. 
Se i cambiamenti non richiedono nessuna azione o commento utile, rispondi SILENZIO.`,
      });
    }

    const reminderJobs: PendingJob[] = [];
    const tasks = s.items.filter(
      (i) => i.kind === 'task' && ['approvato', 'in corso'].includes(i.status),
    );
    for (const task of tasks) {
      const due = new Date(String(task.data.due)).getTime();
      if (Number.isFinite(due) && due >= now.getTime() && due < now.getTime() + 3600000) {
        const c = conversations.find((cv) => cv.project_id === task.project_id);
        if (c)
          reminderJobs.push({
            conversationId: c.id,
            projectId: c.project_id,
            reasonForCheck: `PROMEMORIA SCADENZA — Il task "${task.title}" scade entro un'ora (${String(task.data.due)}).
Scrivi un promemoria utile per ${s.profiles.find((u: { id: string }) => u.id === String(task.data?.assignee ?? task.owner_id ?? ''))?.name ?? 'il membro assegnato'}: 
verifica se è ancora fattibile nei tempi, se serve aiuto o se la scadenza va spostata. 
Non imporre nulla — proponi e chiedi. Se la scadenza è già stata discussa di recente, sii molto breve.`,
          });
      }
    }
    return { jobs, reminderJobs };
  });

  // Fase 3 (FUORI dal lock): tutte le chiamate di rete. Nel frattempo l'app
  // resta reattiva per l'utente — nessuna azione reale viene bloccata.
  for (const job of [...jobs, ...reminderJobs]) {
    try {
      processed += await replyInConversation(job, key, model);
    } catch {
      await mutateStandalone((s: LocalWorkspace) => {
        s.items.push(
          item(
            'ai_activity_log',
            'AI in attesa',
            'Provider non disponibile o quota esaurita. Riprovo al prossimo controllo utile.',
            { project_id: job.projectId, data: { error: true } },
          ),
        );
      });
    }
  }

  const reason = scheduledReason || (processed > 0 ? 'cambiamenti rilevati' : 'nessun cambiamento rilevante');
  return { processed, reason };
}

async function replyInConversation(
  job: PendingJob,
  key: string,
  model: string,
): Promise<number> {
  const { conversationId, projectId, reasonForCheck } = job;

  // Lettura breve (con lock) dello stato attuale, il più vicino possibile
  // alla chiamata AI: solo lavoro sincrono, nessuna rete qui dentro.
  const { payload, already } = await mutateStandalone((s: LocalWorkspace) => {
    const already = s.items.some(
      (r) =>
        r.kind === 'ai_activity_log' &&
        r.data?.reason === reasonForCheck &&
        r.project_id === projectId &&
        r.created_at > new Date(Date.now() - 5 * 60000).toISOString(),
    );
    if (already) return { payload: null, already: true };

    const recent = s.items
      .filter((i) => i.kind === 'message' && i.conversation_id === conversationId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 16);

    const context = s.items
      .filter(
        (r) =>
          ['memory', 'task', 'financial_entry', 'project', 'ai_proposal', 'financial_proposal'].includes(
            r.kind,
          ) &&
          !['obsoleto', 'archiviato', 'eliminato'].includes(r.status) &&
          (!r.project_id || r.project_id === projectId),
      )
      .slice(0, 60);

    const last = recent
      .slice()
      .reverse()
      .map((r) => `${r.title}: ${r.body}`)
      .join('\n');

    return {
      already: false,
      payload: {
        istruzione: reasonForCheck,
        chat_type: 'gruppo',
        avviso: 'Scrivi solo se hai qualcosa di concreto e utile. Se non hai nulla di rilevante rispondi SILENZIO.',
        contesto_progetto: context.filter((r) => ['project', 'memory', 'financial_entry', 'financial_proposal'].includes(r.kind)).slice(0, 25),
        task_attivi: context.filter((r) => r.kind === 'task' && !['completato', 'annullato'].includes(r.status)).slice(0, 12),
        proposte_pendenti: context.filter((r) => ['ai_proposal', 'financial_proposal'].includes(r.kind) && r.status === 'proposto').slice(0, 5),
        risultati_recenti: context.filter((r) => r.kind === 'task' && r.status === 'completato').slice(0, 5),
        membri: s.profiles,
        ultimi_messaggi: last,
        memorie_esistenti: context.filter((r) => r.kind === 'memory').map((r) => r.title),
      },
    };
  });
  if (already || !payload) return 0;

  // Chiamata AI FUORI dal lock: può durare secondi senza bloccare nessuno.
  const answer = await generate(key, model, JSON.stringify(payload), true);

  let reply: z.infer<typeof structuredReply>;
  try {
    reply = structuredReply.parse(JSON.parse(answer.text));
  } catch {
    return 0; // risposta non valida: meglio tacere che scrivere spazzatura
  }

  // Ricerca online FUORI dal lock: anch'essa una chiamata di rete.
  let researchNote = '';
  let researchItem: Item | null = null;
  if (reply.research_query) {
    const searchedToday = await mutateStandalone((s: LocalWorkspace) =>
      s.items.some(
        (r) =>
          r.kind === 'research_item' &&
          r.project_id === projectId &&
          Date.now() - new Date(r.created_at).getTime() < 86400000,
      ),
    );
    if (!process.env.TAVILY_API_KEY) {
      researchNote = '\n\nLa ricerca online richiede TAVILY_API_KEY: non ho verificato fonti esterne.';
    } else if (!searchedToday) {
      try {
        const result = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query: reply.research_query,
            max_results: 4,
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!result.ok) throw new Error();
        const parsed = researchResults.parse(await result.json());
        researchItem = item(
          'research_item',
          reply.research_query,
          'Fonti recuperate dal provider di ricerca; contenuti da valutare.',
          { project_id: projectId, data: { sources: parsed.results } },
        );
        researchNote =
          '\n\nHo recuperato queste fonti, consultabili anche in Memoria:\n' +
          parsed.results.map((source) => source.title + ' — ' + source.url).join('\n');
      } catch {
        researchNote = '\n\nLa ricerca online non è riuscita. Non considero verificati i dati esterni.';
      }
    }
  }
  const finalText = reply.text + researchNote;

  // Fase finale (lock breve): scrive tutto in un colpo solo, rileggendo lo
  // stato fresco per il dedup sulle memorie (potrebbe essere cambiato nel
  // frattempo, ma il rischio è un duplicato occasionale, non un blocco).
  return mutateStandalone((s: LocalWorkspace) => {
    let added = 0;
    if (researchItem) {
      s.items.push(researchItem);
      added++;
    }
    for (const proposal of reply.proposals) {
      if (proposal.type === 'task' && !s.profiles.some((u) => u.id === proposal.assignee)) continue;
      if (proposal.type === 'expense' && !proposal.amount) continue;
      s.items.push(
        item(
          proposal.type === 'project' ? 'ai_proposal' : proposal.type === 'expense' ? 'financial_proposal' : 'task',
          proposal.title,
          proposal.body,
          { project_id: projectId, status: 'proposto', data: { ...proposal } },
        ),
      );
      added++;
    }
    for (const memory of reply.memories) {
      if (s.items.some((r) => r.kind === 'memory' && r.project_id === projectId && r.title === memory.title))
        continue;
      s.items.push(item('memory', memory.title, memory.body, { project_id: projectId }));
      added++;
    }
    if (finalText.trim() !== 'SILENZIO') {
      s.items.push(
        item('message', 'ARPAC', finalText, {
          conversation_id: conversationId,
          project_id: projectId,
          data: { author: 'ARPAC', tokens: answer.tokens },
        }),
      );
      added++;
    }
    s.items.push(
      item('ai_activity_log', 'Attività ARPAC', reasonForCheck, {
        project_id: projectId,
        data: { reason: reasonForCheck, tokens: answer.tokens },
      }),
    );
    return added;
  });
}
