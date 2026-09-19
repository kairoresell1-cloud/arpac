import 'server-only';
import Groq from 'groq-sdk';
import { ARPAC_SYSTEM, ARPAC_STRUCTURED_ADDON } from './prompts';
import { admin } from './supabase';
import { decrypt } from './crypto';
import { addRecord } from './store';
import type { Item } from './types';
import { z } from 'zod';
import { item, isStandalone, localEncryptionKey, readLocalAi } from './demo';
import { localEmbedding } from './embed';
export const structuredReply = z.object({
  text: z
    .string()
    .max(18000)
    .nullable()
    .optional()
    .transform((v) => v ?? ''),
  // I modelli, specialmente in JSON mode, scrivono spessissimo `null`
  // esplicito per "questo campo non serve ora" invece di ometterlo o usare
  // un array vuoto. z.optional()/z.default() in zod scattano SOLO su
  // `undefined`, mai su `null` esplicito — quindi ogni risposta con
  // `"research_query": null` (comunissima) falliva la validazione anche
  // dopo una chiamata API perfettamente riuscita. .nullable() prima di
  // .optional()/.transform() copre entrambi i casi.
  research_query: z
    .string()
    .max(160)
    .nullable()
    .optional()
    .transform((v) => v || undefined),
  proposals: z
    .array(
      z.object({
        type: z.enum(['project', 'task', 'expense']),
        title: z.string().min(1).max(200),
        body: z.string().max(4000),
        amount: z.number().min(0).max(1000000).nullable().optional().transform((v) => v ?? undefined),
        assignee: z.string().nullable().optional().transform((v) => v ?? undefined),
        due: z.string().nullable().optional().transform((v) => v ?? undefined),
        minutes: z.number().min(1).max(10000).nullable().optional().transform((v) => v ?? undefined),
      }),
    )
    .max(4)
    .nullable()
    .optional()
    .transform((v) => v ?? []),
  memories: z
    .array(z.object({ title: z.string().max(200), body: z.string().max(3000) }))
    .max(3)
    .nullable()
    .optional()
    .transform((v) => v ?? []),
});
export async function provider() {
  if (isStandalone()) {
    const data = await readLocalAi();
    const key = data
      ? decrypt(data.ciphertext, process.env.APP_ENCRYPTION_KEY || (await localEncryptionKey()))
      : undefined;
    if (!key) throw new Error('Chiave AI assente. Configurala da Impostazioni.');
    return { key, model: data?.model || 'gemini-3.8-flash' };
  }
  const { data } = await admin().from('ai_provider_settings').select('*').eq('id', 1).maybeSingle();
  const key = data
    ? decrypt(data.ciphertext, process.env.APP_ENCRYPTION_KEY || '')
    : process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Chiave AI assente. L’owner può configurarla in Impostazioni.');
  return { key, model: data?.model || process.env.GEMINI_MODEL || 'gemini-3.8-flash' };
}


export async function generate(
  key: string,
  model: string,
  prompt: string,
  structured = false,
  media: { inlineData: { mimeType: string; data: string } }[] = [],
  effort: 'low' | 'medium' = 'low',
) {
  const systemText = ARPAC_SYSTEM + (structured ? ' ' + ARPAC_STRUCTURED_ADDON : '');

  if (key.startsWith('gsk_')) {
    const groq = new Groq({ apiKey: key });
    const groqModel = (model && !model.startsWith('gemini')) ? model : 'openai/gpt-oss-120b';
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemText },
      { role: 'user', content: prompt + (media.length > 0 ? '\n[Allegati non supportati con Groq]' : '') },
    ];
    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: groqModel,
        messages,
        max_tokens: 6000,
        temperature: structured ? 0.4 : 0.7,
        // openai/gpt-oss-120b (e altri modelli "reasoning" su Groq) pensano
        // prima di rispondere: senza queste due opzioni, il ragionamento
        // interno può (a) finire mescolato nel testo della risposta e
        // rompere il JSON, oppure (b) consumare così tanti token da tagliare
        // a metà la risposta finale prima ancora che venga scritta.
        // 'hidden' garantisce che message.content contenga SOLO la risposta
        // finale; 'low' tiene il ragionamento breve, riducendo sia il
        // rischio di troncamento sia la latenza (utile per una chat diretta).
        reasoning_format: 'hidden',
        reasoning_effort: effort,
        // Forza JSON valido quando serve una risposta strutturata (proposte,
        // idee, memorie): senza questo Groq può anteporre testo libero al
        // JSON e rompere il parsing a valle.
        ...(structured ? { response_format: { type: 'json_object' as const } } : {}),
      });
    } catch (e) {
      const status = (e as { status?: number })?.status;
      console.error('[ARPAC/groq] errore chiamata:', status, e instanceof Error ? e.message : e);
      throw new Error(
        status === 401 ? 'Chiave Groq non autorizzata: controlla che sia valida.' :
        status === 429 ? 'Quota Groq esaurita: riprova più tardi.' :
        status === 400 ? `Il modello Groq "${groqModel}" non è valido o non è più disponibile.` :
        'Provider Groq non disponibile al momento.',
      );
    }
    let text = completion.choices[0]?.message?.content || '';
    if (!text) throw new Error('Il provider non ha restituito una risposta.');
    if (structured) {
      text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      // Rete di sicurezza: se nonostante reasoning_format:'hidden' il modello
      // aggiunge comunque testo prima/dopo il JSON, ne isoliamo solo il
      // blocco { ... } più esterno invece di far fallire il parsing a valle.
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);
    }
    console.log('[ARPAC/groq] risposta ok, modello:', groqModel, 'token:', completion.usage?.total_tokens);
    return { text, tokens: completion.usage?.total_tokens || 0 };
  }

  const modelCandidates: Record<string, string[]> = {
    'gemini-3.8-flash': ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    'gemini-2.5-flash': ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
  };
  const candidates = modelCandidates[model] ?? [model];
  const buildBody = () => ({
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: 'user', parts: [{ text: prompt }, ...media] }],
    generationConfig: { maxOutputTokens: 3000, ...(structured ? { responseMimeType: 'application/json' } : {}) },
  });

  let lastStatus = 0;
  for (const candidate of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(buildBody()),
        signal: AbortSignal.timeout(45000),
      });
    } catch (e) {
      console.error('[ARPAC/gemini] fetch error su', candidate, e instanceof Error ? e.message : e);
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
      if (!text) throw new Error('Il provider non ha restituito una risposta.');
      console.log('[ARPAC/gemini] risposta ok con modello:', candidate);
      return { text, tokens: Number(data.usageMetadata?.totalTokenCount || 0) };
    }
    lastStatus = res.status;
    const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
    console.error('[ARPAC/gemini]', candidate, res.status, JSON.stringify(errBody).slice(0, 300));
    if (res.status === 401 || res.status === 403 || res.status === 429) break;
  }
  throw new Error(
    lastStatus === 401 ? 'Chiave Gemini non autorizzata: controlla che sia valida.' :
    lastStatus === 403 ? 'Google ha rifiutato la chiave: abilita Gemini API nel progetto Google AI Studio.' :
    lastStatus === 429 ? 'Quota AI esaurita: riprova piu tardi.' :
    lastStatus === 400 ? 'Nessun modello Gemini disponibile con questa chiave.' :
    `Provider AI non disponibile (status: ${lastStatus}).`,
  );
}
export function embedding(text: string): number[] {
  return localEmbedding(text);
}

export async function enqueue(kind: string, payload: Record<string, unknown>, dedup?: string) {
  const { error } = await admin()
    .from('ai_jobs')
    .upsert(
      { kind, payload, dedup_key: dedup || crypto.randomUUID() },
      { onConflict: 'dedup_key', ignoreDuplicates: true },
    );
  if (error) throw new Error('Impossibile accodare la richiesta.');
}
export async function processJob() {
  const db = admin();
  const { data: jobs, error } = await db.rpc('claim_job');
  if (error) throw new Error('Coda non disponibile.');
  const job = jobs?.[0];
  if (!job) return false;
  try {
    const { key, model } = await provider();
    const p = job.payload;
    if (job.kind === 'index') {
      const { data: r } = await db
        .from('records')
        .select('*')
        .eq('id', String(p.record_id))
        .single();
      if (r && !['obsoleto', 'archiviato', 'eliminato'].includes(r.status)) {
        const vector = embedding(r.title + '\n' + r.body);
        const { error } = await db.from('embeddings').upsert({
          record_id: r.id,
          content: r.title + '\n' + r.body,
          project_id: r.project_id,
          owner_id: r.owner_id,
          conversation_id: r.conversation_id,
          embedding: vector,
        });
        if (error) throw new Error('Indicizzazione non riuscita.');
      }
    } else {
      const { data: c } = await db
        .from('records')
        .select('*')
        .eq('kind', 'conversation')
        .eq('id', String(p.conversation_id))
        .single();
      if (!c) throw new Error('Conversazione non disponibile.');
      const { data: prior } = await db
        .from('records')
        .select('id')
        .eq('kind', 'message')
        .contains('data', { job_id: job.id })
        .maybeSingle();
      if (prior) {
        await db.from('ai_jobs').update({ status: 'done' }).eq('id', job.id);
        return true;
      }
      const { data: recent } = await db
        .from('records')
        .select('*')
        .in('kind', ['message', 'attachment'])
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(16);
      const [{ data: allProfiles }, { data: members }] = await Promise.all([
        db.from('profiles').select('*'),
        db.from('project_members').select('*'),
      ]);
      const people = (allProfiles || []).filter(
        (u) =>
          !c.project_id ||
          (members || []).some((m) => m.project_id === c.project_id && m.user_id === u.id),
      );
      const { data: raw } = await db
        .from('records')
        .select('*')
        .in('kind', [
          'memory',
          'task',
          'financial_entry',
          'project',
          'research_item',
          'ai_proposal',
          'financial_proposal',
        ])
        .not('status', 'in', '(obsoleto,archiviato,eliminato)')
        .order('updated_at', { ascending: false })
        .limit(200);
      // HQ non divulga progetti riservati a un sottoinsieme del team.
      const common = (pid: string) =>
        people.every((u) =>
          (members || []).some((m) => m.project_id === pid && m.user_id === u.id),
        );
      const context = (raw || [])
        .filter(
          (r) =>
            (!r.owner_id || r.owner_id === c.owner_id) &&
            (!r.conversation_id || r.conversation_id === c.id) &&
            (c.project_id
              ? r.kind === 'project'
                ? r.id === c.project_id
                : !r.project_id || r.project_id === c.project_id
              : r.project_id
                ? common(r.project_id)
                : r.kind !== 'project' || common(r.id)),
        )
        .slice(0, 45);
      const last = (recent || [])
        .slice()
        .reverse()
        .map((r: Item) => `${r.title}: ${r.body}`)
        .join('\n');
      let semantic: unknown = [];
      // Su una conversazione appena creata (nessun messaggio ancora) non c'è
      // un argomento reale da cercare: interrogare la memoria con solo il
      // titolo del canale (spesso generico, es. "Generale") restituiva
      // comunque i "6 più vicini" anche quando nessuno era pertinente, e il
      // modello finiva per raccontare come fatti presenti ricordi di
      // progetti/conversazioni completamente diversi. Meglio nessun ricordo
      // che un ricordo sbagliato spacciato per contesto.
      if (last.trim().length > 0) {
        try {
          const vector = embedding(last.slice(-4000));
          const { data } = await db.rpc('match_memories', {
            query_embedding: vector,
            p_project: c.project_id,
            p_owner: c.owner_id,
            p_conversation: c.id,
          });
          // Rete di sicurezza lato app: se il database non ha ancora la
          // soglia minima di somiglianza (vedi migrazione 005), la applichiamo
          // comunque qui prima di passare i ricordi al modello.
          semantic = Array.isArray(data)
            ? data.filter((row: { similarity?: number }) => (row.similarity ?? 1) > 0.12)
            : data;
        } catch {
          semantic = 'Recupero semantico indisponibile; usa solo i dati forniti.';
        }
      }
      const media: { inlineData: { mimeType: string; data: string } }[] = [];
      for (const attachment of (recent || [])
        .filter(
          (r) =>
            r.kind === 'attachment' &&
            nSize(r.data.size) <= 5 * 1024 * 1024 &&
            ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(
              String(r.data.type),
            ),
        )
        .slice(0, 2)) {
        const { data: file } = await db.storage
          .from('team-files')
          .download(String(attachment.data.path));
        if (file)
          media.push({
            inlineData: {
              mimeType: String(attachment.data.type),
              data: Buffer.from(await file.arrayBuffer()).toString('base64'),
            },
          });
      }
      const answer = await generate(
        key,
        model,
        JSON.stringify({
          istruzione:
            p.reason ||
            "MESSAGGIO DIRETTO DI UNA PERSONA VERA — non è un controllo automatico: rispondi sempre, in modo utile e concreto. Non usare mai SILENZIO qui.",
          chat_type: c.owner_id ? 'privata_con_membro' : 'gruppo',
          avviso: c.owner_id
            ? 'Chat privata: non condividere info personali nel gruppo senza consenso esplicito.'
            : 'Chat di gruppo: tutti i membri vedono i tuoi messaggi.',
          contesto_progetto: context.filter((r) => ['project','memory','financial_entry','financial_proposal'].includes(r.kind)).slice(0, 30),
          task_attivi: context.filter((r) => r.kind === 'task' && !['completato','annullato'].includes(r.status)).slice(0, 15),
          proposte_pendenti: context.filter((r) => ['ai_proposal','financial_proposal'].includes(r.kind) && r.status === 'proposto').slice(0, 5),
          membri: people,
          ricordi_pertinenti: semantic,
          ultimi_messaggi: last,
        }),
        true,
        media,
        job.kind === 'automatic' ? 'medium' : 'low',
      );
      const reply = structuredReply.parse(JSON.parse(answer.text));
      // Una chat privata non pubblica proposte al gruppo senza una scelta esplicita del membro.
      const output: Item[] = [];
      if (reply.research_query && !c.owner_id) {
        const searchedToday = context.some(
          (r) =>
            r.kind === 'research_item' && Date.now() - new Date(r.created_at).getTime() < 86400000,
        );
        if (!process.env.TAVILY_API_KEY)
          reply.text +=
            '\n\nLa ricerca online richiede TAVILY_API_KEY: non ho verificato fonti esterne.';
        else if (!searchedToday) {
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
            const parsed = z
              .object({
                results: z.array(
                  z.object({ title: z.string(), url: z.url(), content: z.string() }),
                ),
              })
              .parse(await result.json());
            output.push(
              item(
                'research_item',
                reply.research_query,
                'Fonti recuperate dal provider di ricerca; contenuti da valutare.',
                { project_id: c.project_id, data: { sources: parsed.results, source_job: job.id } },
              ),
            );
            reply.text +=
              '\n\nHo recuperato queste fonti, consultabili anche in Memoria:\n' +
              parsed.results.map((source) => source.title + ' — ' + source.url).join('\n');
          } catch {
            reply.text +=
              '\n\nLa ricerca online non è riuscita. Non considero verificati i dati esterni.';
          }
        }
      }
      if (!c.owner_id)
        for (const proposal of reply.proposals) {
          if (
            proposal.type === 'task' &&
            (!c.project_id ||
              !people.some((u) => u.id === proposal.assignee) ||
              !z.iso.datetime().safeParse(proposal.due).success)
          )
            continue;
          if (proposal.type === 'expense' && !proposal.amount) continue;
          output.push(
            item(
              proposal.type === 'project'
                ? 'ai_proposal'
                : proposal.type === 'expense'
                  ? 'financial_proposal'
                  : 'task',
              proposal.title,
              proposal.body,
              {
                project_id: c.project_id,
                status: 'proposto',
                data: {
                  ...proposal,
                  type: proposal.type === 'project' ? 'project' : proposal.type,
                  source_job: job.id,
                },
              },
            ),
          );
        }
      for (const memory of reply.memories) {
        if (context.some((r) => r.kind === 'memory' && r.title === memory.title)) continue;
        const m = item('memory', memory.title, memory.body, {
          project_id: c.project_id,
          owner_id: c.owner_id,
          conversation_id: c.owner_id ? c.id : null,
          data: { source_job: job.id, source: 'estrazione AI · verificabile' },
        });
        output.push(
          m,
          item('memory_source', memory.title, 'Messaggi sorgente', {
            project_id: c.project_id,
            owner_id: c.owner_id,
            conversation_id: c.id,
            data: { memory_id: m.id, message_ids: (recent || []).map((r) => r.id) },
          }),
        );
      }
      if (reply.text.trim() === 'SILENZIO' && job.kind !== 'automatic') {
        reply.text = 'Dimmi pure di cosa hai bisogno.';
      }
      if (reply.text.trim() !== 'SILENZIO')
        output.push(
          item('message', 'ARPAC', reply.text, {
            conversation_id: c.id,
            project_id: c.project_id,
            owner_id: c.owner_id,
            data: { author: 'ARPAC', job_id: job.id },
          }),
        );
      output.push(
        item(
          'ai_activity_log',
          'Risposta ARPAC',
          String(p.reason || 'Risposta alla conversazione'),
          {
            project_id: c.project_id,
            owner_id: c.owner_id,
            data: { tokens: answer.tokens, job_id: job.id, automation: job.kind === 'automatic' },
          },
        ),
      );
      const { error: commit } = await db.rpc('commit_ai_reply', {
        p_job: job.id,
        p_records: output,
      });
      if (commit) throw new Error('Risposta non salvata.');
    }
    await db.from('ai_jobs').update({ status: 'done' }).eq('id', job.id);
  } catch {
    const terminal = job.attempts >= 5;
    await db
      .from('ai_jobs')
      .update({
        status: terminal ? 'failed' : 'pending',
        available_at: new Date(
          Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts),
        ).toISOString(),
      })
      .eq('id', job.id);
    await addRecord(
      'ai_activity_log',
      terminal ? 'Richiesta AI da riprovare' : 'AI in attesa',
      'Provider non disponibile o quota esaurita. I dati sono al sicuro.',
      {
        owner_id: job.payload.owner_id ? String(job.payload.owner_id) : null,
        data: { error: true, job_id: job.id },
      },
    );
  }
  return true;
}
export async function schedule() {
  const db = admin();
  const { data: state } = await db.from('scheduler_state').select('*').eq('id', 1).single();
  const now = new Date();
  if (state && now.getTime() - new Date(state.last_run).getTime() < 55 * 60000) return;
  const { data: changed } = await db
    .from('records')
    .select('id,project_id,kind,owner_id,data')
    .gt('updated_at', state?.last_run || now.toISOString())
    .in('kind', ['task', 'financial_entry', 'ai_proposal', 'task_update']);
  const hour = Number(
    new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  );
  const reason =
    hour === 8
      ? 'Briefing mattutino'
      : hour === 20
        ? 'Report giornaliero: fatto, avanzamenti, blocchi, risultati, piano di domani'
        : 'Controlla solo i cambiamenti rilevanti. Evita ripetizioni.';
  const { data: conversations } = await db
    .from('records')
    .select('*')
    .eq('kind', 'conversation')
    .is('owner_id', null);
  for (const c of conversations || []) {
    if (
      [8, 20].includes(hour) ||
      (changed || []).some(
        (r) => !r.owner_id && !r.data.source_job && r.project_id === c.project_id,
      )
    )
      await enqueue(
        'automatic',
        { conversation_id: c.id, reason },
        `${c.id}:${now.toISOString().slice(0, 13)}`,
      );
  }
  const { data: tasks } = await db
    .from('records')
    .select('*')
    .eq('kind', 'task')
    .in('status', ['approvato', 'in corso']);
  for (const task of tasks || []) {
    const due = new Date(String(task.data.due)).getTime();
    if (due >= now.getTime() && due < now.getTime() + 3600000) {
      const c = conversations?.find((c) => c.project_id === task.project_id);
      if (c)
        await enqueue(
          'automatic',
          {
            conversation_id: c.id,
            reason: `Promemoria: ${task.title} entro ${String(task.data.due)}. Verifica disponibilità, senza imporre nuovi impegni.`,
          },
          `reminder:${task.id}:${String(task.data.due)}`,
        );
    }
  }
  await db.from('scheduler_state').update({ last_run: now.toISOString() }).eq('id', 1);
}
function nSize(value: unknown) {
  return Number(value) || 0;
}
