import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { actor, admin } from '@/lib/supabase';
import { addRecord, snapshot } from '@/lib/store';
import { enqueue, provider, generate } from '@/lib/ai';
import { isStandalone } from '@/lib/demo';
import { writeBinary, readBinary, removeFile as removeLocalFile } from '@/lib/local-files';

const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
];

export async function POST(req: Request) {
  try {
    const state = await snapshot();
    if (state.role === 'viewer') throw new Error('Accesso in sola lettura.');
    const form = await req.formData();
    const file = form.get('file') as File;
    const id = String(form.get('conversation_id'));
    const c = state.items.find((r) => r.kind === 'conversation' && r.id === id);
    if (!c) throw new Error('Conversazione non accessibile.');
    if (!file || file.size > 10 * 1024 * 1024)
      throw new Error('Dimensione massima: 10 MB. Per video pesanti condividi un link.');
    if (!ALLOWED_TYPES.includes(file.type))
      throw new Error('Formato ammesso: PNG, JPG, WEBP, PDF, TXT, CSV.');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${c.id}/${randomUUID()}/${safeName}`;

    if (isStandalone()) {
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeBinary(`attachments/${path}`, buffer);
      try {
        const r = await addRecord(
          'attachment',
          file.name,
          file.type.startsWith('text/') ? buffer.toString('utf8').slice(0, 20000) : 'Allegato disponibile per consultazione.',
          {
            conversation_id: c.id,
            project_id: c.project_id,
            owner_id: c.owner_id,
            data: { path, type: file.type, size: file.size },
          },
        );
        // Commento AI in diretta (come per i messaggi in standalone): nessuna coda, best-effort.
        try {
          const ai = await provider();
          const answer = await generate(
            ai.key,
            ai.model,
            `Nuovo allegato "${file.name}" (${file.type}). Analizza brevemente, indica limiti e proponi un prossimo passo concreto.`,
          );
          await addRecord('message', 'ARPAC', answer.text, {
            conversation_id: c.id,
            project_id: c.project_id,
            owner_id: c.owner_id,
            data: { author: 'ARPAC', tokens: answer.tokens },
          });
        } catch {
          /* Nessuna chiave AI o quota esaurita: l'allegato resta comunque salvato. */
        }
        return NextResponse.json({ ok: true, attachment_id: r.id });
      } catch (e) {
        await removeLocalFile(`attachments/${path}`).catch(() => {});
        throw e;
      }
    }

    const a = await actor();
    if (a.role === 'viewer') throw new Error('Accesso in sola lettura.');
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
    if (isStandalone()) {
      const buffer = await readBinary(`attachments/${String(file.data.path)}`);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': String(file.data.type || 'application/octet-stream'),
          'Content-Disposition': `attachment; filename="${file.title.replace(/["\r\n]/g, '_')}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    const { data, error } = await admin()
      .storage.from('team-files')
      .createSignedUrl(String(file.data.path), 60, { download: file.title });
    if (error) throw new Error();
    return NextResponse.redirect(data.signedUrl);
  } catch {
    return NextResponse.json({ error: 'File non disponibile.' }, { status: 404 });
  }
}
