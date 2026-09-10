import { session } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
export async function POST(req: Request) {
  const input = z
    .object({ email: z.email(), password: z.string().min(1).max(200) })
    .safeParse(await req.json());
  if (!input.success)
    return NextResponse.json({ error: 'Email o password non validi.' }, { status: 400 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const email = process.env.OWNER_EMAIL || 'owner@arpac.local';
    const password = process.env.OWNER_PASSWORD || 'arpac-local-setup';
    if (input.data.email !== email || input.data.password !== password)
      return NextResponse.json({ error: 'Accesso non riuscito.' }, { status: 401 });
    (await cookies()).set('arpac_local_session', 'owner', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ ok: true });
  }
  const { error } = await (await session()).auth.signInWithPassword(input.data);
  return error
    ? NextResponse.json(
        { error: 'Accesso non riuscito. Verifica email e password.' },
        { status: 401 },
      )
    : NextResponse.json({ ok: true });
}
export async function DELETE() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    (await cookies()).delete('arpac_local_session');
    return NextResponse.json({ ok: true });
  }
  await (await session()).auth.signOut();
  return NextResponse.json({ ok: true });
}
