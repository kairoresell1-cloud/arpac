import { actor } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';
export async function GET(req: Request) {
  try {
    const a = await actor();
    const params = new URL(req.url).searchParams;
    const id = z.uuid().parse(params.get('conversation'));
    const before = z.iso.datetime().parse(params.get('before'));
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
