import { NextResponse } from 'next/server';
import { z } from 'zod';
import { snapshot, addRecord } from '@/lib/store';
import { admin } from '@/lib/supabase';
import { isDemo, isStandalone } from '@/lib/demo';
import { createLocalMember } from '@/lib/local-team';
import { requireOwner } from '@/lib/rules';
import { requireSameOrigin } from '@/lib/request-origin';
import { errorStatus } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    const s = await snapshot();
    requireOwner(s.role);
    if (isDemo()) throw new Error('Crea gli account nel sito pubblicato. La demo non ha un login.');
    const input = z
      .object({
        name: z.string().trim().min(1).max(80),
        email: z.string().trim().toLowerCase().pipe(z.email()),
        password: z.string().min(10).max(128),
        role: z.enum(['membro', 'admin', 'viewer']).default('membro'),
        project_ids: z.array(z.string().min(1).max(100)).max(50).default([]),
      })
      .parse(await req.json());
    input.project_ids = [...new Set(input.project_ids)];
    if (isStandalone())
      return NextResponse.json(
        { ok: true, account: await createLocalMember(input) },
        { status: 201 },
      );
    if (input.project_ids.some((id) => !s.items.some((p) => p.kind === 'project' && p.id === id)))
      throw new Error('Progetto non disponibile.');
    const db = admin();
    const { data, error } = await db.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error(
        'Account non creato. Verifica che l’email non sia già utilizzata e che la password sia valida.',
      );
    const id = data.user.id;
    try {
      const profile = await db
        .from('profiles')
        .insert({ id, name: input.name, avatar: input.name.slice(0, 2).toUpperCase() });
      if (profile.error) throw profile.error;
      const membership = await db
        .from('team_memberships')
        .insert({ user_id: id, role: input.role });
      if (membership.error) throw membership.error;
      if (input.project_ids.length) {
        const access = await db
          .from('project_members')
          .insert(input.project_ids.map((project_id) => ({ project_id, user_id: id })));
        if (access.error) throw access.error;
      }
    } catch {
      await db.auth.admin.deleteUser(id);
      throw new Error('Account non creato: il salvataggio nel team non è riuscito. Riprova.');
    }
    await addRecord('invite', 'Account creato', input.email, {
      owner_id: s.user.id,
      data: { user_id: id },
    });
    return NextResponse.json(
      { ok: true, account: { id, email: input.email, name: input.name } },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? 'Inserisci nome, email valida e una password di almeno 10 caratteri.'
            : (error as Error).message || 'Account non creato.',
      },
      { status: errorStatus(error) },
    );
  }
}
