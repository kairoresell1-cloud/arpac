import { actor } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { snapshot } from '@/lib/store';
import { isStandalone, isDemo } from '@/lib/demo';
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const id = z.string().min(1).max(100).parse(params.get('conversation'));
    const before = z.iso.datetime().parse(params.get('before'));
    if (isStandalone() || isDemo()) {
      const s = await snapshot();
      const items = s.items
        .filter((i) => i.kind === 'message' && i.conversation_id === id && i.created_at < before)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 50);
      return NextResponse.json({ items });
    }
    const a = await actor();
    const { data, error } = await a.client
      .from('records')
      .select('*')
      .eq('kind', 'message')
      .eq('conversation_id', id)
      .lt('created_at', before)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error();
    return NextResponse.json({ items: data });
  } catch {
    return NextResponse.json({ error: 'Cronologia non disponibile.' }, { status: 400 });
  }
}
