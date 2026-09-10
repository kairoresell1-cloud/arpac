import { NextResponse } from 'next/server';
import { z } from 'zod';
import { actor, admin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';
import { requireOwner } from '@/lib/rules';
import { generate } from '@/lib/ai';
import { addRecord, snapshot } from '@/lib/store';
import { AuthRequiredError, LocalStorageError, errorStatus } from '@/lib/errors';
import { requireSameOrigin } from '@/lib/request-origin';
import { isStandalone, localEncryptionKey, writeLocalAi } from '@/lib/demo';
export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    if (isStandalone()) {
      requireOwner((await snapshot()).role);
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
      const key = p.key?.trim();
      if (!key) throw new Error('Inserisci una chiave Gemini.');
      await generate(key, p.model, 'Rispondi solo: connessione verificata.');
      const ciphertext = encrypt(
        key,
        process.env.APP_ENCRYPTION_KEY || (await localEncryptionKey()),
      );
      await writeLocalAi({ ciphertext, last4: key.slice(-4), model: p.model });
      return NextResponse.json({ ok: true, last4: key.slice(-4) });
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
    const key = p.key?.trim();
    if (!key) throw new Error('Inserisci una chiave valida.');
    const ciphertext = encrypt(key, process.env.APP_ENCRYPTION_KEY || '');
    await generate(key, p.model, 'Rispondi solo: connessione verificata.');
    const { error } = await db.from('ai_provider_settings').upsert({
      id: 1,
      ciphertext,
      last4: key.slice(-4),
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
    return NextResponse.json({ ok: true, last4: key.slice(-4) });
  } catch (e) {
    const known =
      e instanceof Error &&
      /^(Chiave Gemini|Google ha rifiutato|Quota AI|Provider AI|Inserisci una chiave|Origine non autorizzata|Solo l’owner)/.test(
        e.message,
      );
    return NextResponse.json(
      {
        error:
          e instanceof AuthRequiredError || e instanceof LocalStorageError
            ? e.message
            : known
              ? e.message
              : 'Configurazione non riuscita. La chiave precedente è stata conservata.',
      },
      { status: errorStatus(e) },
    );
  }
}
