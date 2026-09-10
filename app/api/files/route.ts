import { NextResponse } from 'next/server';
import { actor, admin } from '@/lib/supabase';
import { addRecord, snapshot } from '@/lib/store';
import { enqueue } from '@/lib/ai';
export async function POST(req: Request) {
  try {
    const a = await actor();
    if (a.role === 'viewer') throw new Error('Accesso in sola lettura.');
    const form = await req.formData();
    const file = form.get('file') as File;
    const id = String(form.get('conversation_id'));
    const state = await snapshot();
    const c = state.items.find((r) => r.kind === 'conversation' && r.id === id);
    if (!c) throw new Error('Conversazione non accessibile.');
    if (!file || file.size > 10 * 1024 * 1024)
      throw new Error('Dimensione massima: 10 MB. Per video pesanti condividi un link.');
    if (
      ![
        'image/png',
        'image/jpeg',
        'image/webp',
        'application/pdf',
        'text/plain',
        'text/csv',
      ].includes(file.type)
    )
      throw new Error('Formato ammesso: PNG, JPG, WEBP, PDF, TXT, CSV.');
    const path = `${c.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await admin()
      .storage.from('team-files')
      .upload(path, file, { contentType: file.type });
    if (error) throw new Error('Caricamento non riuscito.');
    try {
      const r = await addRecord(
        'attachment',
        file.name,
        file.type.startsWith('text/')
          ? (await file.text()).slice(0, 20000)
          : 'Allegato disponibile per consultazione.',
        {
          conversation_id: c.id,
          project_id: c.project_id,
          owner_id: c.owner_id,
          data: { path, type: file.type, size: file.size },
        },
      );
      await enqueue('index', { record_id: r.id });
      await enqueue('reply', {
        conversation_id: c.id,
        owner_id: c.owner_id,
        reason: 'Analizza il nuovo allegato, indica limiti e proponi un prossimo passo concreto.',
      });
    } catch (e) {
      await admin().storage.from('team-files').remove([path]);
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    const state = await snapshot();
    const file = state.items.find((r) => r.kind === 'attachment' && r.id === id);
    if (!file) throw new Error();
    const { data, error } = await admin()
      .storage.from('team-files')
      .createSignedUrl(String(file.data.path), 60, { download: file.title });
    if (error) throw new Error();
    return NextResponse.redirect(data.signedUrl);
  } catch {
    return NextResponse.json({ error: 'File non disponibile.' }, { status: 404 });
  }
}
