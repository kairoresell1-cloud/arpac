import { session } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { createSession, sessionCookie, sessionMaxAge, authenticateLocal } from '@/lib/local-auth';
import { readStandalone, readLocalAi } from '@/lib/demo';
import { LocalStorageError, errorStatus } from '@/lib/errors';
import { publicOrigin, requireSameOrigin } from '@/lib/request-origin';
import { checkDataAccess } from '@/lib/local-files';
export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    const input = z
      .object({
        email: z.string().trim().toLowerCase().pipe(z.email()),
        password: z.string().min(1).max(200),
      })
      .safeParse(await req.json());
    if (!input.success)
      return NextResponse.json({ error: 'Email o password non validi.' }, { status: 400 });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const id = await authenticateLocal(input.data.email, input.data.password);
      if (!id)
        return NextResponse.json(
          {
            error: 'Email o password errate. Usa le credenziali del tuo account ARPAC.',
          },
          { status: 401 },
        );
      // Do not report a successful login if the workspace cannot be opened.
      await checkDataAccess();
      await readStandalone();
      await readLocalAi();
      const token = await createSession(Date.now(), id);
      (await cookies()).set(sessionCookie, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: publicOrigin(req).startsWith('https://'),
        path: '/',
        maxAge: sessionMaxAge,
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
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof LocalStorageError
            ? error.message
            : 'Accesso non completato. Riprova tra poco.',
      },
      { status: errorStatus(error) },
    );
  }
}
export async function DELETE(req: Request) {
  try {
    requireSameOrigin(req);
  } catch {
    return NextResponse.json({ error: 'Origine non autorizzata.' }, { status: 403 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    (await cookies()).delete(sessionCookie);
    return NextResponse.json({ ok: true });
  }
  await (await session()).auth.signOut();
  return NextResponse.json({ ok: true });
}
