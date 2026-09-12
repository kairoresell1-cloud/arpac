import { randomUUID, randomBytes } from 'node:crypto';
import { createIfMissing, readOptional, readJson, writeJson, removeFile } from './local-files';
import { LocalStorageError } from './errors';
import type { Item, Snapshot, LocalWorkspace } from './types';
export const isDemo = () =>
  process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_SUPABASE_URL;
export const isStandalone = () =>
  process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SUPABASE_URL;
export function item(kind: string, title: string, body = '', extra: Partial<Item> = {}): Item {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    kind,
    title,
    body,
    project_id: null,
    conversation_id: null,
    owner_id: null,
    status: 'attivo',
    data: {},
    created_at: now,
    updated_at: now,
    ...extra,
  };
}
export function seed(): Snapshot {
  const user = {
    id: 'owner',
    name: 'Owner',
    avatar: 'OW',
    skills: 'Strategia e coordinamento',
    bio: 'Tengo insieme il team.',
    availability: '15 ore / settimana',
    onboarded: true,
  };
  const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
  return {
    user,
    role: 'owner',
    demo: true,
    storage: 'demo',
    ai: { configured: false, last4: '', model: 'gemini-2.5-flash' },
    profiles: [
      user,
      {
        id: 'luigi',
        name: 'Luigi',
        avatar: 'LU',
        skills: 'Programmazione, script, plugin',
        bio: 'Costruisco sistemi che funzionano.',
        availability: '12 ore / settimana',
        onboarded: true,
      },
      {
        id: 'jamal',
        name: 'Jamal',
        avatar: 'JA',
        skills: 'Video, montaggio, storytelling',
        bio: 'Dall’idea al video.',
        availability: '8 ore / settimana',
        onboarded: true,
      },
    ],
    items: [
      item(
        'project',
        'Server Minecraft',
        'Un survival curato, con economia sostenibile e una community che torna.',
        {
          id: 'minecraft',
          data: {
            budget: 300,
            goal: '30 giocatori attivi nella beta',
            launch: day(14),
            color: '#a78bfa',
          },
        },
      ),
      item('conversation', 'HQ · Chat del team', '', { id: 'hq' }),
      item('conversation', 'Generale', 'Canale principale del progetto.', {
        id: 'mc-chat',
        project_id: 'minecraft',
        data: { channel: 'generale', kind: 'text' },
      }),
      item('conversation', 'Decisioni', 'Decisioni approvate e priorità.', {
        id: 'mc-decisions',
        project_id: 'minecraft',
        data: { channel: 'decisioni', kind: 'text' },
      }),
      item('conversation', 'Operatività', 'Coordinamento del lavoro quotidiano.', {
        id: 'mc-ops',
        project_id: 'minecraft',
        data: { channel: 'operativita', kind: 'text' },
      }),
      item(
        'message',
        'ARPAC',
        'Buongiorno, team. Oggi concentriamoci sulla beta: prima il sistema casse, poi il video. Aprire altri fronti adesso ci rallenterebbe.',
        { conversation_id: 'hq', data: { author: 'ARPAC' } },
      ),
      item(
        'message',
        'Luigi',
        'Questo pomeriggio ho 90 minuti per gli script. Parto dal sistema casse.',
        { conversation_id: 'hq', data: { author: 'Luigi' } },
      ),
      item(
        'message',
        'ARPAC',
        'Perfetto. Ho preparato una proposta per il test del trailer: 40 € al massimo, dopo aver verificato l’hook. La decisione resta all’owner.',
        { conversation_id: 'hq', data: { author: 'ARPAC' } },
      ),
      item(
        'task',
        'Sistema casse e ricompense',
        'Testare probabilità, permessi e registro delle ricompense.',
        {
          project_id: 'minecraft',
          status: 'in corso',
          data: { assignee: 'luigi', due: day(0), minutes: 90 },
        },
      ),
      item(
        'task',
        'Montare il trailer della beta',
        'Hook nei primi 3 secondi. Allegare il link per la revisione.',
        {
          project_id: 'minecraft',
          status: 'approvato',
          data: { assignee: 'jamal', due: day(1), minutes: 60 },
        },
      ),
      item(
        'task',
        'Test carico del server',
        'Simulare 30 giocatori e documentare i tempi di risposta.',
        {
          project_id: 'minecraft',
          status: 'bloccato',
          data: { assignee: 'luigi', due: day(-1), minutes: 45 },
        },
      ),
      item('task', 'Definire regole community', 'Una pagina chiara, leggibile e condivisa.', {
        project_id: 'minecraft',
        status: 'completato',
        data: { assignee: 'owner', due: day(-2) },
      }),
      item('financial_entry', 'Hosting · settembre', 'Server per il test beta.', {
        project_id: 'minecraft',
        data: { amount: -35 },
      }),
      item('financial_entry', 'Contributi del team', 'Fondo iniziale approvato.', {
        project_id: 'minecraft',
        data: { amount: 150 },
      }),
      item(
        'financial_proposal',
        'Test trailer · budget massimo 40 €',
        'Motivo: misurare interesse reale. Alternativa: distribuzione organica gratuita. Rischio: zero conversioni. Impatto atteso: dati utili, nessuna garanzia.',
        { project_id: 'minecraft', status: 'proposto', data: { amount: 40 } },
      ),
      item('calendar_event', 'Revisione trailer', 'Con Jamal · 30 minuti', {
        project_id: 'minecraft',
        data: { due: day(1), type: 'sessione' },
      }),
      item('calendar_event', 'Apertura beta privata', 'Obiettivo: 30 giocatori', {
        project_id: 'minecraft',
        data: { due: day(14), type: 'beta' },
      }),
      item(
        'memory',
        'La beta prima della monetizzazione',
        'Decisione approvata: validare stabilità e retention prima di proporre acquisti. Nessuna previsione di ricavi è garantita.',
        { project_id: 'minecraft' },
      ),
      item(
        'ai_activity_log',
        'Briefing mattutino',
        'Simulazione demo: priorità aggiornate, nessuna chiamata AI effettuata.',
        { data: { simulated: true } },
      ),
      item(
        'notification',
        'Un blocco da risolvere',
        'Il test di carico aspetta una configurazione stabile.',
      ),
      item(
        'research_item',
        'Ricerca non configurata',
        'Configura TAVILY_API_KEY per ottenere fonti verificate. Nessuna ricerca online è stata eseguita.',
      ),
    ],
  };
}
export function blank(): Snapshot {
  const now = new Date().toISOString();
  const user = {
    id: 'owner',
    name: 'Owner',
    avatar: 'OW',
    skills: '',
    bio: '',
    availability: '',
    onboarded: false,
  };
  return {
    user,
    role: 'owner',
    demo: false,
    storage: 'local',
    ai: { configured: false, last4: '', model: 'gemini-2.5-flash' },
    profiles: [user],
    items: [
      {
        id: 'hq',
        kind: 'conversation',
        title: 'Generale',
        body: 'Canale principale del team.',
        project_id: null,
        conversation_id: null,
        owner_id: null,
        status: 'attivo',
        data: { channel: 'generale', kind: 'text' },
        created_at: now,
        updated_at: now,
      },
    ],
  };
}
let queue: Promise<unknown> = Promise.resolve();
export async function readDemo(): Promise<Snapshot> {
  await createIfMissing('demo.json', JSON.stringify(seed()));
  return { ...(await readJson<Snapshot>('demo.json'))!, storage: 'demo' };
}
export async function readStandalone(): Promise<LocalWorkspace> {
  let state = await readJson<LocalWorkspace>('workspace.json');
  if (!state) {
    // Preserve real data written by the previous release; never import demo records.
    const legacy = await readJson<Snapshot>('demo.json');
    await createIfMissing(
      'workspace.json',
      JSON.stringify(legacy?.demo === false ? legacy : blank()),
    );
    state = await readJson<Snapshot>('workspace.json');
  }
  if (!state || state.demo !== false || !Array.isArray(state.items) || !state.user)
    throw new LocalStorageError(new Error('Archivio non valido.'));
  return { ...state, storage: 'local' };
}
export async function localEncryptionKey(): Promise<string> {
  await createIfMissing('.app-key', randomBytes(32).toString('base64'));
  const key = (await readOptional('.app-key'))?.trim();
  if (!key || Buffer.from(key, 'base64').length !== 32)
    throw new LocalStorageError(new Error('Chiave locale non valida.'));
  return key;
}
export async function readLocalAi(): Promise<{
  ciphertext: string;
  last4: string;
  model: string;
} | null> {
  return readJson('ai-provider.json');
}
export async function writeLocalAi(
  value: { ciphertext: string; last4: string; model: string } | null,
) {
  if (value) await writeJson('ai-provider.json', value);
  else await removeFile('ai-provider.json');
}
export async function readLocalTavily(): Promise<{
  ciphertext: string;
  last4: string;
} | null> {
  return readJson('tavily-provider.json');
}
export async function writeLocalTavily(
  value: { ciphertext: string; last4: string } | null,
) {
  if (value) await writeJson('tavily-provider.json', value);
  else await removeFile('tavily-provider.json');
}
export async function mutateDemo<T>(fn: (s: Snapshot) => T | Promise<T>): Promise<T> {
  const task = queue.then(async () => {
    const state = await readDemo();
    const result = await fn(state);
    await writeJson('demo.json', state);
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
export async function mutateStandalone<T>(fn: (s: LocalWorkspace) => T | Promise<T>): Promise<T> {
  const task = queue.then(async () => {
    const state = await readStandalone();
    const result = await fn(state);
    await writeJson('workspace.json', state);
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
