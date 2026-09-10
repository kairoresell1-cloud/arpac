import { createClient } from '@supabase/supabase-js';
async function main() {
  const email = process.env.OWNER_EMAIL,
    password = process.env.OWNER_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error('Imposta OWNER_EMAIL e OWNER_PASSWORD (minimo 12 caratteri).');
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: existing, error: lookup } = await db
    .from('team_memberships')
    .select('user_id')
    .eq('role', 'owner')
    .maybeSingle();
  if (lookup) throw new Error('Applica prima le migrazioni.');
  if (existing) throw new Error('Owner già presente. Nessuna modifica eseguita.');
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user)
    throw new Error('Creazione owner fallita. Verifica email e configurazione.');
  const id = data.user.id;
  const { error: p } = await db.from('profiles').insert({ id, name: 'Owner', avatar: 'OW' });
  if (p) throw new Error('Creazione profilo fallita.');
  const { error: m } = await db.from('team_memberships').insert({ user_id: id, role: 'owner' });
  if (m) throw new Error('Creazione ruolo fallita.');
  const { error: c } = await db
    .from('records')
    .insert({ kind: 'conversation', title: 'Generale', body: 'Canale principale del team.', data: { channel: 'generale', kind: 'text' } });
  if (c) throw new Error('Creazione HQ fallita.');
  console.log(
    'Owner e HQ creati. Puoi accedere con le credenziali impostate. Rimuovi OWNER_PASSWORD da .env.local.',
  );
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
