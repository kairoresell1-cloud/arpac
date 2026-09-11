import 'server-only';
import { z } from 'zod';
import { mutateStandalone, item } from './demo';
import { provider, generate, structuredReply, tavilyKey, indexLocalRecord, localSemanticSearch } from './ai';
import type { Item, LocalWorkspace } from './types';

const researchResults = z.object({
  results: z.array(z.object({ title: z.string(), url: z.url(), content: z.string() })),
});

// Stesso intervallo minimo tra due cicli usato in modalità Supabase (lib/ai.ts schedule()).
const MIN_INTERVAL_MS = 55 * 60000;

/**
 * Equivalente di schedule()+processJob() (lib/ai.ts) per chi NON collega Supabase.
 * Non esiste una coda Postgres in locale, quindi qui il ciclo è sincrono: legge lo
 * stato, decide cosa scrivere, chiama Gemini e salva — tutto dentro un'unica
 * mutateStandalone() (che serializza già gli accessi al file, quindi resta sicuro
 * anche se /api/cron viene chiamato in parallelo).
 *
 * Limiti onesti rispetto alla versione Supabase: nessun recupero semantico
 * (pgvector) e nessuna ricerca online (Tavily) — usa solo i dati recenti/pertinenti
 * per parola chiave. Nessun retry con backoff: se un ciclo fallisce (es. quota
 * Gemini esaurita), riprova al ciclo utile successivo.
 */
export async function runLocalScheduler(): Promise<{ processed: number; reason: string }> {
  let processed = 0;
  let reason = 'nessun controllo dovuto';

  await mutateStandalone(async (s: LocalWorkspace) => {
    const now = new Date();
    const last = s.schedulerLastRun ? new Date(s.schedulerLastRun) : null;
    if (last && now.getTime() - last.getTime() < MIN_INTERVAL_MS) return;

    const hour = Number(
      new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(now),
    );
    const scheduledReason =
      hour === 8
        ? 'Briefing mattutino'
        : hour === 20
          ? 'Report giornaliero: fatto, avanzamenti, blocchi, risultati, piano di domani'
          : null;

    let key: string, model: string;
    try {
      ({ key, model } = await provider());
    } catch {
      reason = 'nessuna chiave Gemini configurata';
      s.schedulerLastRun = now.toISOString();
      return;
    }

    // Solo chat di gruppo: ARPAC non scrive spontaneamente nelle chat private.
    const conversations = s.items.filter((i) => i.kind === 'conversation' && !i.owner_id);

    for (const c of conversations) {
      const changedSince = s.items.some(
        (r) =>
          r.updated_at > (last?.toISOString() || '1970-01-01T00:00:00.000Z') &&
          ['task', 'financial_entry', 'ai_proposal', 'task_update'].includes(r.kind) &&
          r.project_id === c.project_id,
      );
      if (!scheduledReason && !changedSince) continue;
      try {
        processed += await replyInConversation(
          s,
          c,
          scheduledReason || 'Controlla solo i cambiamenti rilevanti. Evita ripetizioni.',
          key,
          model,
        );
      } catch {
        s.items.push(
          item(
            'ai_activity_log',
            'AI in attesa',
            'Provider non disponibile o quota esaurita. Riprovo al prossimo controllo utile.',
            { project_id: c.project_id, data: { error: true } },
          ),
        );
      }
    }

    // Promemoria: task in scadenza entro un'ora.
    const tasks = s.items.filter(
      (i) => i.kind === 'task' && ['approvato', 'in corso'].includes(i.status),
    );
    for (const task of tasks) {
      const due = new Date(String(task.data.due)).getTime();
      if (Number.isFinite(due) && due >= now.getTime() && due < now.getTime() + 3600000) {
        const c = conversations.find((cv) => cv.project_id === task.project_id);
        if (c) {
          try {
            processed += await replyInConversation(
              s,
              c,
              `Promemoria: ${task.title} entro ${String(task.data.due)}. Verifica disponibilità, senza imporre nuovi impegni.`,
              key,
              model,
            );
          } catch {
            /* vedi log sopra: un promemoria saltato non blocca gli altri */
          }
        }
      }
    }

    reason = scheduledReason || (processed > 0 ? 'cambiamenti rilevati' : 'nessun cambiamento rilevante');
    s.schedulerLastRun = now.toISOString();
  });

  return { processed, reason };
}

async function replyInConversation(
  s: LocalWorkspace,
  c: Item,
  reasonForCheck: string,
  key: string,
  model: string,
): Promise<number> {
  const recent = s.items
    .filter((i) => i.kind === 'message' && i.conversation_id === c.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 16);

  const context = s.items
    .filter(
      (r) =>
        ['memory', 'task', 'financial_entry', 'project', 'ai_proposal', 'financial_proposal'].includes(
          r.kind,
        ) &&
        !['obsoleto', 'archiviato', 'eliminato'].includes(r.status) &&
        (!r.project_id || r.project_id === c.project_id),
    )
    .slice(0, 60);

  const last = recent
    .slice()
    .reverse()
    .map((r) => `${r.title}: ${r.body}`)
    .join('\n');

  // Ricerca semantica locale (embedding Gemini su disco).
  const semantic = await localSemanticSearch(
    last.slice(-3000) || c.title,
    key,
    { project_id: c.project_id, owner_id: c.owner_id ?? null, conversation_id: c.id },
  );

  const answer = await generate(
    key,
    model,
    JSON.stringify({
      controllo: reasonForCheck,
      contesto: context,
      membri: s.profiles,
      ricordi: semantic,
      messaggi: last,
    }),
    true,
  );

  let reply: z.infer<typeof structuredReply>;
  try {
    reply = structuredReply.parse(JSON.parse(answer.text));
  } catch {
    return 0; // risposta non valida: meglio tacere che scrivere spazzatura
  }

  const already = s.items.some(
    (r) =>
      r.kind === 'ai_activity_log' &&
      r.data?.reason === reasonForCheck &&
      r.project_id === c.project_id &&
      r.created_at > new Date(Date.now() - 5 * 60000).toISOString(),
  );
  if (already) return 0;

  let added = 0;

  // Ricerca online: massimo una al giorno per progetto/HQ, e solo in chat di gruppo
  // (replyInConversation viene chiamata solo per conversazioni senza owner_id, vedi sopra).
  if (reply.research_query) {
    const searchedToday = s.items.some(
      (r) =>
        r.kind === 'research_item' &&
        r.project_id === c.project_id &&
        Date.now() - new Date(r.created_at).getTime() < 86400000,
    );
    const tKey = await tavilyKey();
    if (!tKey) {
      reply.text += '\n\nLa ricerca online richiede una Tavily API key: configurala in Impostazioni → Ricerca online.';
    } else if (!searchedToday) {
      try {
        const result = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tKey,
            query: reply.research_query,
            max_results: 4,
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!result.ok) throw new Error();
        const parsed = researchResults.parse(await result.json());
        s.items.push(
          item(
            'research_item',
            reply.research_query,
            'Fonti recuperate dal provider di ricerca; contenuti da valutare.',
            { project_id: c.project_id, data: { sources: parsed.results } },
          ),
        );
        added++;
        reply.text +=
          '\n\nHo recuperato queste fonti, consultabili anche in Memoria:\n' +
          parsed.results.map((source) => source.title + ' — ' + source.url).join('\n');
      } catch {
        reply.text += '\n\nLa ricerca online non è riuscita. Non considero verificati i dati esterni.';
      }
    }
  }

  for (const proposal of reply.proposals) {
    if (proposal.type === 'task' && !s.profiles.some((u) => u.id === proposal.assignee)) continue;
    if (proposal.type === 'expense' && !proposal.amount) continue;
    s.items.push(
      item(
        proposal.type === 'project' ? 'ai_proposal' : proposal.type === 'expense' ? 'financial_proposal' : 'task',
        proposal.title,
        proposal.body,
        { project_id: c.project_id, status: 'proposto', data: { ...proposal } },
      ),
    );
    added++;
  }

  for (const memory of reply.memories) {
    if (context.some((r) => r.kind === 'memory' && r.title === memory.title)) continue;
    s.items.push(item('memory', memory.title, memory.body, { project_id: c.project_id }));
    added++;
  }

  if (reply.text.trim() !== 'SILENZIO') {
    s.items.push(
      item('message', 'ARPAC', reply.text, {
        conversation_id: c.id,
        project_id: c.project_id,
        data: { author: 'ARPAC', tokens: answer.tokens },
      }),
    );
    added++;
  }

  s.items.push(
    item('ai_activity_log', 'Attività ARPAC', reasonForCheck, {
      project_id: c.project_id,
      data: { reason: reasonForCheck, tokens: answer.tokens },
    }),
  );

  // Indicizza in background le memorie appena aggiunte e i messaggi recenti.
  // È best-effort: non blocca la risposta in caso di errore.
  const toIndex = s.items.filter(
    (r) =>
      ['memory', 'message'].includes(r.kind) &&
      r.project_id === c.project_id &&
      r.updated_at > new Date(Date.now() - 10 * 60000).toISOString(),
  );
  for (const r of toIndex) {
    void indexLocalRecord(
      r.id,
      r.title + '\n' + r.body,
      { project_id: r.project_id, conversation_id: r.conversation_id, owner_id: r.owner_id },
      key,
      r.updated_at,
    );
  }

  return added;
}
