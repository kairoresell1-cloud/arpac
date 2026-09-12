import { NextResponse } from 'next/server';
import { z } from 'zod';
import { actor, admin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';
import { requireOwner } from '@/lib/rules';
import { generate } from '@/lib/ai';
import { addRecord, snapshot } from '@/lib/store';
import { AuthRequiredError, LocalStorageError, errorStatus } from '@/lib/errors';
import { requireSameOrigin, publicOrigin } from '@/lib/request-origin';
import { isDemo, isStandalone, localEncryptionKey, writeLocalAi } from '@/lib/demo';

export async function POST(req: Request) {
  // Log sempre visibile nei Deploy Logs Railway — aiuta a diagnosticare problemi CSRF/auth
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  const expected = publicOrigin(req);
  console.log('[ARPAC/provider] POST', {
    origin,
    host,
    expected,
    isDemo: isDemo(),
    isStandalone: isStandalone(),
    APP_URL: process.env.APP_URL,
    RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
  });

  try {
    requireSameOrigin(req);
    console.log('[ARPAC/provider] CSRF ok');

    if (isDemo())
      throw new Error(
        'La demo non memorizza segreti: collega Supabase oppure prova con una build locale (npm run build && npm run start) per salvare davvero la chiave.',
      );

    if (isStandalone()) {
      console.log('[ARPAC/provider] modalità standalone');
      requireOwner((await snapshot()).role);
      const p = z
        .object({
          action: z.enum(['save', 'remove']),
          key: z.string().max(300).optional(),
          model: z.string().regex(/^gemini-[a-z0-9._-]+$/i),
          confirm: z.literal(true),
        })
        .parse(await req.json());
      if (p.action === 'remove') {
        await writeLocalAi(null);
        return NextResponse.json({ ok: true });
      }
      const key = p.key?.trim();
      if (!key) throw new Error('Inserisci una chiave Gemini.');
      console.log('[ARPAC/provider] chiave ricevuta, tipo:', key.startsWith('AQ.') ? 'AQ (Bearer)' : 'AIzaSy (x-goog-api-key)', 'modello:', p.model);
      console.log('[ARPAC/provider] verifica Gemini in corso...');
      await generate(key, p.model, 'Rispondi solo: connessione verificata.');
      console.log('[ARPAC/provider] verifica Gemini ok');
      const ciphertext = encrypt(
        key,
        process.env.APP_ENCRYPTION_KEY || (await localEncryptionKey()),
      );
      await writeLocalAi({ ciphertext, last4: key.slice(-4), model: p.model });
      console.log('[ARPAC/provider] chiave salvata ok');
      return NextResponse.json({ ok: true, last4: key.slice(-4) });
    }

    console.log('[ARPAC/provider] modalità Supabase');
    const a = await actor();
    requireOwner(a.role);
    const p = z
      .object({
        action: z.enum(['save', 'remove']),
        key: z.string().max(300).optional(),
        model: z.string().regex(/^gemini-[a-z0-9._-]+$/i),
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
    console.log('[ARPAC/provider] chiave ricevuta, tipo:', key.startsWith('AQ.') ? 'AQ (Bearer)' : 'AIzaSy (x-goog-api-key)', 'modello:', p.model);
    console.log('[ARPAC/provider] verifica Gemini in corso...');
    const ciphertext = encrypt(key, process.env.APP_ENCRYPTION_KEY || '');
    await generate(key, p.model, 'Rispondi solo: connessione verificata.');
    console.log('[ARPAC/provider] verifica Gemini ok');
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
    console.error('[ARPAC/provider] ERRORE:', e instanceof Error ? e.message : e);
    const known =
      e instanceof Error &&
      /^(Chiave Gemini|Google ha rifiutato|Quota AI|Provider AI|Inserisci una chiave|Origine non autorizzata|Solo l'owner|La demo)/.test(
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
