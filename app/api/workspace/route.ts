import { NextResponse } from 'next/server';
import { z } from 'zod';
import { snapshot } from '@/lib/store';
import { isDemo, isStandalone, mutateDemo, mutateStandalone, item, seed } from '@/lib/demo';
import { AuthRequiredError, LocalStorageError, errorStatus } from '@/lib/errors';
import { requireSameOrigin } from '@/lib/request-origin';
import { actor, admin } from '@/lib/supabase';
import { canTransition, requireOwner, canEditMemory } from '@/lib/rules';
import { enqueue, provider, generate } from '@/lib/ai';
import type { Item } from '@/lib/types';
const schema = z.object({
  action: z.enum([
    'create',
    'approve',
    'reject',
    'transition',
    'memory',
    'profile',
    'role',
    'reset',
    'retry',
    'plan',
    'event',
    'project_status',
  ]),
  id: z.string().max(100).optional(),
  kind: z
    .enum([
      'message',
      'task',
      'ai_proposal',
      'financial_proposal',
      'financial_entry',
      'conversation',
      'memory',
      'research_item',
    ])
    .optional(),
  title: z.string().max(200).default(''),
  body: z.string().max(20000).default(''),
  project_id: z.string().nullable().optional(),
  conversation_id: z.string().nullable().optional(),
  status: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export async function GET() {
  try {
    return NextResponse.json(await snapshot());
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AuthRequiredError || e instanceof LocalStorageError
            ? e.message
            : 'Workspace non disponibile. Riprova tra poco.',
      },
      { status: errorStatus(e) },
    );
  }
}
export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    const p = schema.parse(await req.json());
    const state = await snapshot();
    if (state.role === 'viewer') throw new Error('Il ruolo viewer consente la sola lettura.');
    const a = isDemo() || isStandalone() ? null : await actor();
    if (a) {
      const { data } = await admin().rpc('consume_rate', { p_actor: a.id });
      if (!data) throw new Error('Troppe richieste. Riprova tra un minuto.');
    }
    const existing = p.id ? state.items.find((i) => i.id === p.id) : undefined;
    async function insert(r: Item) {
      if (isDemo()) await mutateDemo((s) => s.items.push(r));
      else if (isStandalone()) await mutateStandalone((s) => s.items.push(r));
      else {
        const { error } = await admin().from('records').insert(r);
        if (error) throw new Error('Salvataggio non riuscito.');
      }
      return r;
    }
    async function update(r: Item, changes: Partial<Item>) {
      if (isDemo() || isStandalone())
        await (isDemo() ? mutateDemo : mutateStandalone)((s) => {
          Object.assign(
            s.items.find((i) => i.id === r.id)!,
            changes,
            { updated_at: new Date().toISOString() },
          );
        });
      else {
        const { error } = await admin()
          .from('records')
          .update({ ...changes, updated_at: new Date().toISOString() })
          .eq('id', r.id)
          .eq('kind', r.kind)
          .eq('updated_at', r.updated_at)
          .select('id')
          .single();
        if (error) throw new Error('Il dato è cambiato. Aggiorna e riprova.');
      }
    }
    if (p.action === 'reset') {
      if (isDemo()) await mutateDemo((s) => Object.assign(s, seed()));
      else throw new Error('Il ripristino è disponibile solo nella demo.');
    } else if (p.action === 'approve' || p.action === 'reject') {
      requireOwner(state.role);
      if (
        !existing ||
        !['ai_proposal', 'financial_proposal', 'task', 'skill_change_request'].includes(
          existing.kind,
        ) ||
        existing.status !== 'proposto'
      )
        throw new Error('Proposta non disponibile.');
      if (a) {
        const { error } = await admin().rpc('approve_record', {
          p_id: existing.id,
          p_actor: a.id,
          p_approve: p.action === 'approve',
        });
        if (error) throw new Error('Proposta già elaborata o non valida.');
      } else
        await (isDemo() ? mutateDemo : mutateStandalone)((s) => {
          const r = s.items.find((x) => x.id === p.id)!;
          if (r.status !== 'proposto') throw new Error('Proposta già elaborata.');
          r.status = p.action === 'approve' ? 'approvato' : 'annullato';
          if (r.status === 'approvato') {
            if (r.kind === 'ai_proposal' && r.data.type === 'project') {
              const project = item('project', r.title, r.body, { data: r.data });
              s.items.push(
                project,
                item('conversation', 'Generale', 'Canale principale del progetto.', {
                  project_id: project.id,
                  data: { channel: 'generale', kind: 'text' },
                }),
                item('conversation', 'Decisioni', 'Decisioni approvate e priorità.', {
                  project_id: project.id,
                  data: { channel: 'decisioni', kind: 'text' },
                }),
                item('conversation', 'Operatività', 'Coordinamento del lavoro quotidiano.', {
                  project_id: project.id,
                  data: { channel: 'operativita', kind: 'text' },
                }),
              );
            }
            if (r.kind === 'ai_proposal' && r.data.type === 'plan')
              Object.assign(s.items.find((i) => i.id === r.project_id)!.data, r.data);
            if (r.kind === 'ai_proposal' && r.data.type === 'event')
              s.items.push(
                item('calendar_event', r.title, r.body, { project_id: r.project_id, data: r.data }),
              );
            if (r.kind === 'task')
              s.items.push(
                item('calendar_event', r.title, r.body, { project_id: r.project_id, data: r.data }),
              );
            if (r.kind === 'skill_change_request') {
              const user = s.profiles.find((u) => u.id === r.owner_id)!;
              user.skills = String(r.data.skills);
              user.availability = String(r.data.availability);
              s.user = s.profiles.find((u) => u.id === s.user.id)!;
            }
            s.items.push(
              item('memory', 'Decisione: ' + r.title, r.body, { project_id: r.project_id }),
            );
          }
          s.items.push(item('approval', r.status, r.title, { data: { actor: s.user.id } }));
        });
    } else if (p.action === 'transition') {
      if (
        !existing ||
        existing.kind !== 'task' ||
        !canTransition(
          existing.status,
          p.status || '',
          state.role,
          existing.data.assignee === state.user.id,
        )
      )
        throw new Error('Passaggio di stato non consentito.');
      await update(existing, { status: p.status });
      await insert(
        item('task_update', existing.title, p.body, {
          project_id: existing.project_id,
          data: { task_id: existing.id, status: p.status, actor: state.user.id },
        }),
      );
    } else if (p.action === 'memory') {
      if (!canEditMemory(state.role) || existing?.kind !== 'memory')
        throw new Error('Solo owner e admin possono correggere le memorie.');
      if (!['attivo', 'obsoleto', 'archiviato', 'eliminato'].includes(p.status || ''))
        throw new Error('Stato non valido.');
      await update(existing, { body: p.status === 'eliminato' ? '' : p.body, status: p.status });
      if (a) {
        await admin().from('embeddings').delete().eq('record_id', existing.id);
        if (p.status === 'attivo') await enqueue('index', { record_id: existing.id });
      }
    } else if (p.action === 'profile') {
      const d = z
        .object({
          name: z.string().min(1).max(80),
          avatar: z.string().max(4),
          bio: z.string().max(500),
          skills: z.string().max(1000),
          availability: z.string().max(500),
        })
        .parse(p.data);
      if (!state.user.onboarded || state.role === 'owner') {
        if (a) {
          const { error } = await admin()
            .from('profiles')
            .update({ ...d, onboarded: true })
            .eq('id', a.id);
          if (error) throw new Error('Profilo non salvato.');
        } else
          await (isDemo() ? mutateDemo : mutateStandalone)((s) => {
            Object.assign(s.user, d, { onboarded: true });
            Object.assign(
              s.profiles.find((u) => u.id === s.user.id)!,
              s.user,
            );
          });
      } else {
        await insert(
          item(
            'skill_change_request',
            'Aggiornamento profilo · ' + state.user.name,
            'Modifica competenze e disponibilità',
            { owner_id: state.user.id, status: 'proposto', data: d },
          ),
        );
      }
    } else if (p.action === 'plan' || p.action === 'event') {
      if (existing?.kind !== 'project') throw new Error('Progetto non accessibile.');
      const d =
        p.action === 'plan'
          ? z
              .object({
                goal: z.string().min(1).max(1000),
                budget: z.coerce.number().min(0).max(1000000),
                launch: z.iso.datetime(),
                audience: z.string().max(1000),
                expected_revenue: z.coerce.number().min(0).max(1000000),
                risks: z.string().max(2000),
              })
              .parse(p.data)
          : z
              .object({
                due: z.iso.datetime(),
                type: z.enum([
                  'sessione',
                  'pubblicazione',
                  'milestone',
                  'beta',
                  'lancio',
                  'promemoria',
                ]),
              })
              .parse(p.data);
      await insert(
        item('ai_proposal', p.title || 'Piano · ' + existing.title, p.body, {
          project_id: existing.id,
          status: 'proposto',
          data: { ...d, event_type: p.data.type, type: p.action },
        }),
      );
    } else if (p.action === 'project_status') {
      requireOwner(state.role);
      if (existing?.kind !== 'project' || !['attivo', 'chiuso'].includes(p.status || ''))
        throw new Error('Progetto non valido.');
      await update(existing, { status: p.status });
      await insert(
        item(
          'memory',
          'Progetto ' + p.status + ': ' + existing.title,
          p.body || 'Le decisioni e i risultati precedenti restano conservati.',
          { project_id: existing.id },
        ),
      );
    } else if (p.action === 'role') {
      requireOwner(state.role);
      const d = z
        .object({ user_id: z.string(), role: z.enum(['admin', 'membro', 'viewer']) })
        .parse(p.data);
      if (d.user_id === state.user.id) throw new Error('Non puoi cambiare il ruolo owner.');
      await insert(
        item('ai_proposal', 'Modifica ruolo', 'Conferma il nuovo ruolo del membro.', {
          status: 'proposto',
          data: { ...d, type: 'role' },
        }),
      );
    } else if (p.action === 'retry') {
      requireOwner(state.role);
      if (a) {
        const { error } = await admin()
          .from('ai_jobs')
          .update({ status: 'pending', attempts: 0, available_at: new Date().toISOString() })
          .eq('status', 'failed');
        if (error) throw new Error('Riprova non riuscita.');
      }
    } else {
      if (!p.kind) throw new Error('Tipo mancante.');
      let project = p.project_id || null;
      let conversation: Item | undefined;
      let owner: string | null = null;
      if (project && !state.items.some((r) => r.kind === 'project' && r.id === project))
        throw new Error('Progetto non accessibile.');
      if (p.kind === 'message') {
        conversation = state.items.find(
          (r) => r.kind === 'conversation' && r.id === p.conversation_id,
        );
        if (!conversation) throw new Error('Conversazione non accessibile.');
        project = conversation.project_id;
        owner = conversation.owner_id;
        if (!p.body.trim()) throw new Error('Scrivi un messaggio.');
      }
      if (p.kind === 'conversation') {
        const isPrivate = p.data.private === true;
        owner = isPrivate ? state.user.id : null;
        if (!isPrivate && !project) throw new Error('Seleziona un progetto.');
      }
      if (p.kind === 'financial_entry') requireOwner(state.role);
      if (p.kind === 'memory' && !canEditMemory(state.role))
        throw new Error('Non puoi creare memorie manuali.');
      let data: Record<string, unknown> = {};
      if (p.kind === 'task') {
        data = z
          .object({
            assignee: z.string(),
            due: z.iso.datetime(),
            minutes: z.coerce.number().min(1).max(10000),
          })
          .parse(p.data);
        if (!project) throw new Error('Seleziona un progetto.');
        if (!state.profiles.some((u) => u.id === data.assignee))
          throw new Error('Assegnatario non valido.');
        if (a) {
          const { data: m } = await admin()
            .from('project_members')
            .select('user_id')
            .eq('project_id', project)
            .eq('user_id', String(data.assignee))
            .maybeSingle();
          if (!m) throw new Error('Il membro non partecipa al progetto.');
        }
      }
      if (['financial_entry', 'financial_proposal'].includes(p.kind)) {
        data = z
          .object({ amount: z.coerce.number().finite().min(-1000000).max(1000000) })
          .parse(p.data);
        if (p.kind === 'financial_proposal' && Number(data.amount) <= 0)
          throw new Error('Inserisci un importo positivo.');
      }
      if (p.kind === 'ai_proposal')
        data = {
          type: 'project',
          budget: z.coerce
            .number()
            .min(0)
            .max(1000000)
            .parse(p.data.budget || 0),
        };
      if (p.kind === 'message') data = { author: state.user.name, author_id: state.user.id };
      if (p.kind === 'conversation') {
        data = {
          channel: String(p.data.channel || 'generale'),
          kind: 'text',
          private: p.data.private === true,
        };
        if (p.data.private === true) {
          if (project) throw new Error('Una chat privata non può essere assegnata a un progetto.');
        } else if (!project) throw new Error('Un canale deve appartenere a un progetto.');
      }
      if (p.kind === 'research_item') {
        if (!process.env.TAVILY_API_KEY || isDemo() || isStandalone())
          throw new Error('Ricerca online non configurata. Imposta TAVILY_API_KEY lato server.');
        const r = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query: p.title,
            max_results: 5,
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) throw new Error('Ricerca temporaneamente non disponibile.');
        const result = await r.json();
        data = {
          sources: result.results.map((s: { title: string; url: string; content: string }) => ({
            title: s.title,
            url: s.url,
            content: s.content,
          })),
        };
      }
      const r = await insert(
        item(p.kind, p.kind === 'message' ? state.user.name : p.title, p.body, {
          project_id: project,
          conversation_id: conversation?.id || null,
          owner_id: owner,
          status: ['task', 'ai_proposal', 'financial_proposal'].includes(p.kind)
            ? 'proposto'
            : 'attivo',
          data,
        }),
      );
      if (p.kind === 'message') {
        if (isDemo())
          await insert(
            item(
              'message',
              'ARPAC',
              'Messaggio salvato. In questa demo non uso Gemini: puoi provare task, approvazioni e calendario. Per risposte reali collega Supabase e configura la chiave AI.',
              {
                conversation_id: conversation!.id,
                project_id: project,
                owner_id: owner,
                data: { author: 'ARPAC', simulated: true },
              },
            ),
          );
        else if (isStandalone()) {
          try {
            const ai = await provider();
            const answer = await generate(ai.key, ai.model, p.body);
            await insert(
              item('message', 'ARPAC', answer.text, {
                conversation_id: conversation!.id,
                project_id: project,
                owner_id: owner,
                data: { author: 'ARPAC', tokens: answer.tokens },
              }),
            );
          } catch {
            await insert(
              item(
                'message',
                'ARPAC',
                'Messaggio salvato. Configura Gemini da Impostazioni per ricevere una risposta AI.',
                {
                  conversation_id: conversation!.id,
                  project_id: project,
                  owner_id: owner,
                  data: { author: 'ARPAC', simulated: true },
                },
              ),
            );
          }
        } else {
          await enqueue('reply', { conversation_id: conversation!.id, owner_id: owner });
          await enqueue('index', { record_id: r.id });
        }
      }
      if (p.kind === 'memory' && a) await enqueue('index', { record_id: r.id });
    }
    return NextResponse.json(await snapshot());
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? 'Controlla i campi del modulo.'
            : (e as Error).message || 'Operazione non riuscita.',
      },
      { status: errorStatus(e) },
    );
  }
}
