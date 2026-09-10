import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database';
import { AuthRequiredError } from './errors';
export function admin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Completa la configurazione Supabase lato server.');
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function session() {
  const jar = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            /* Server Component: cookie già gestito dalle route. */
          }
        },
      },
    },
  );
}
export async function actor() {
  const client = await session();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new AuthRequiredError();
  const { data: membership, error } = await admin()
    .from('team_memberships')
    .select('role')
    .eq('user_id', user.id)
    .single();
  if (error || !membership) throw new Error('Non hai accesso a questo team.');
  return { client, id: user.id, role: membership.role as import('./types').Role };
}
