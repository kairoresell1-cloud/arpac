import { NextResponse } from 'next/server';
import { actor, admin } from '@/lib/supabase';
import { requireOwner } from '@/lib/rules';
import { z } from 'zod';
export async function GET(req: Request) {
  try {
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
