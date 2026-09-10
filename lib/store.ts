import 'server-only';
import { admin, actor } from './supabase';
import { isDemo, isStandalone, readDemo, readStandalone, item, mutateStandalone } from './demo';
import { cookies } from 'next/headers';
import type { Snapshot, Item, Profile } from './types';
export async function snapshot(): Promise<Snapshot> {
  if (isDemo()) return readDemo();
  if (isStandalone()) {
    const jar = await cookies();
    if (jar.get('arpac_local_session')?.value !== 'owner')
      throw new Error('Accedi per continuare.');
    const s = await readStandalone();
    const ai = await import('./demo').then((m) => m.readLocalAi());
    if (ai) s.ai = { configured: true, last4: ai.last4, model: ai.model };
    return s;
  }
  const a = await actor();
  const [
    { data: items, error },
    { data: messages, error: messageError },
    { data: profiles },
    { data: settings },
  ] = await Promise.all([
    a.client
      .from('records')
      .select('*')
      .neq('kind', 'message')
      .order('created_at', { ascending: false })
      .limit(2000),
    a.client
      .from('records')
      .select('*')
      .eq('kind', 'message')
      .order('created_at', { ascending: false })
      .limit(250),
    a.client.from('profiles').select('*'),
    a.role === 'owner'
      ? admin().from('ai_provider_settings').select('last4,model').eq('id', 1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error || messageError)
    throw new Error('Impossibile caricare i dati. Verifica le migrazioni Supabase.');
  const people = profiles as Profile[];
  return {
    items: [...(items || []), ...(messages || [])].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ) as Item[],
    profiles: people,
    user: people.find((p) => p.id === a.id)!,
    role: a.role,
    demo: false,
    ai: {
      configured: !!settings?.last4 || !!process.env.GEMINI_API_KEY,
      last4: settings?.last4 || '',
      model: settings?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
  };
}
export async function addRecord(kind: string, title: string, body = '', extra: Partial<Item> = {}) {
  const row = item(kind, title, body, extra);
  if (isStandalone()) {
    await mutateStandalone((s) => s.items.push(row));
    return row;
  }
  const { error } = await admin().from('records').insert(row);
  if (error) throw new Error('Salvataggio non riuscito.');
  return row;
}
