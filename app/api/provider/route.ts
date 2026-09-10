import { NextResponse } from 'next/server';
import { z } from 'zod';
import { actor, admin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';
import { requireOwner } from '@/lib/rules';
import { generate } from '@/lib/ai';
import { addRecord } from '@/lib/store';
import { isStandalone, localEncryptionKey, writeLocalAi } from '@/lib/demo';
export async function POST(req: Request) {
  try {
    if (isStandalone()) {
      const p = z
        .object({
          action: z.enum(['save', 'remove']),
          key: z.string().max(300).optional(),
          model: z.string().regex(/^gemini-[a-z0-9.-]+$/),
          confirm: z.literal(true),
        })
        .parse(await req.json());
      if (p.action === 'remove') {
        await writeLocalAi(null);
        return NextResponse.json({ ok: true });
      }
      if (!p.key?.trim()) throw new Error();
      await generate(p.key, p.model, 'Rispondi solo: connessione verificata.');
      const ciphertext = encrypt(
        p.key,
        process.env.APP_ENCRYPTION_KEY || (await localEncryptionKey()),
      );
      await writeLocalAi({ ciphertext, last4: p.key.slice(-4), model: p.model });
      return NextResponse.json({ ok: true, last4: p.key.slice(-4) });
    }
    const a = await actor();
    requireOwner(a.role);
    const p = z
      .object({
        action: z.enum(['save', 'remove']),
        key: z.string().max(300).optional(),
        model: z.string().regex(/^gemini-[a-z0-9.-]+$/),
        confirm: z.literal(true),
      })
      .parse(await req.json());
    const db = admin();
    const { data: old } = await db
      .from('ai_provider_settings')
      .select('last4')
      .eq('id', 1)
      .maybeSingle();
    if (p.action === 'remove') {
      const { error } = await db.from('ai_provider_settings').delete().eq('id', 1);
      if (error) throw new Error('Rimozione non riuscita.');
      await addRecord('ai_activity_log', 'Chiave AI rimossa', '', {
        owner_id: a.id,
        data: { actor: a.id },
      });
      return NextResponse.json({ ok: true });
    }
    if (!p.key?.trim()) throw new Error('Inserisci una chiave valida.');
    const ciphertext = encrypt(p.key, process.env.APP_ENCRYPTION_KEY || '');
    await generate(p.key, p.model, 'Rispondi solo: connessione verificata.');
    const { error } = await db.from('ai_provider_settings').upsert({
      id: 1,
      ciphertext,
      last4: p.key.slice(-4),
      model: p.model,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error('Salvataggio non riuscito.');
    await addRecord(
      'ai_activity_log',
      old ? 'Chiave AI sostituita e verificata' : 'Chiave AI aggiunta e verificata',
      '',
      { owner_id: a.id, data: { actor: a.id } },
    );
    return NextResponse.json({ ok: true, last4: p.key.slice(-4) });
  } catch {
    return NextResponse.json(
      {
        error:
          'Configurazione non riuscita. Verifica ruolo owner, chiave, modello, quota e APP_ENCRYPTION_KEY. La chiave precedente è stata conservata.',
      },
      { status: 400 },
    );
  }
}
