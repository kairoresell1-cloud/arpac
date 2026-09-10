import { NextResponse } from 'next/server';
import { z } from 'zod';
import { actor, admin } from '@/lib/supabase';
import { requireOwner } from '@/lib/rules';
import { addRecord } from '@/lib/store';
export async function POST(req: Request) {
  try {
    const a = await actor();
    requireOwner(a.role);
    const { email } = z.object({ email: z.email() }).parse(await req.json());
    const db = admin();
    const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.APP_URL}/auth/accept`,
    });
    if (error || !data.user) throw new Error();
    const id = data.user.id;
    const { error: p } = await db.from('profiles').upsert({ id });
    if (p) throw new Error();
    const { error: m } = await db.from('team_memberships').upsert({ user_id: id, role: 'membro' });
    if (m) throw new Error();
    await addRecord('invite', 'Invito inviato', email, { owner_id: a.id, data: { user_id: id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error: 'Invito non riuscito. Verifica configurazione email e che l’utente non esista già.',
      },
      { status: 400 },
    );
  }
}
