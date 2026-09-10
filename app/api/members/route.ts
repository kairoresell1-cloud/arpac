import { NextResponse } from 'next/server';
import { actor, admin } from '@/lib/supabase';
import { requireOwner } from '@/lib/rules';
import { z } from 'zod';
import { snapshot } from '@/lib/store';
import { isStandalone, readStandalone, mutateStandalone } from '@/lib/demo';
import { projectMembers } from '@/lib/local-team';
import { requireSameOrigin } from '@/lib/request-origin';
export async function GET(req: Request) {
  try {
    if (isStandalone()) {
      const s = await snapshot();
      requireOwner(s.role);
      const id = new URL(req.url).searchParams.get('project');
      if (!id || !s.items.some((i) => i.kind === 'project' && i.id === id)) throw new Error();
      return NextResponse.json({ user_ids: projectMembers(await readStandalone(), id) });
    }
    const a = await actor();
    requireOwner(a.role);
    const id = z.uuid().parse(new URL(req.url).searchParams.get('project'));
    const { data, error } = await a.client
      .from('project_members')
      .select('user_id')
      .eq('project_id', id);
    if (error) throw new Error();
    return NextResponse.json({ user_ids: data.map((m) => m.user_id) });
  } catch {
    return NextResponse.json({ error: 'Accessi non disponibili.' }, { status: 400 });
  }
}
export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    if (isStandalone()) {
      const s = await snapshot();
      requireOwner(s.role);
      const p = z
        .object({ project_id: z.string().max(100), user_ids: z.array(z.string().max(100)).max(50) })
        .parse(await req.json());
      await mutateStandalone((state) => {
        if (
          !state.items.some((i) => i.kind === 'project' && i.id === p.project_id) ||
          p.user_ids.some((id) => !state.profiles.some((u) => u.id === id))
        )
          throw new Error();
        state.projectMembers ??= {};
        state.projectMembers[p.project_id] = [...new Set([s.user.id, ...p.user_ids])];
      });
      return NextResponse.json({ ok: true });
    }
    const a = await actor();
    requireOwner(a.role);
    const p = z
      .object({ project_id: z.uuid(), user_ids: z.array(z.uuid()).min(1).max(50) })
      .parse(await req.json());
    const { data: project } = await a.client
      .from('records')
      .select('id')
      .eq('kind', 'project')
      .eq('id', p.project_id)
      .single();
    if (!project) throw new Error();
    const ids = [...new Set([...p.user_ids, a.id])];
    const db = admin();
    const { error } = await db.rpc('set_project_members', {
      p_project: p.project_id,
      p_users: ids,
      p_actor: a.id,
    });
    if (error) throw new Error();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Accessi non aggiornati. Verifica ruolo, progetto e membri.' },
      { status: 400 },
    );
  }
}
