import { NextResponse } from 'next/server';
import { z } from 'zod';
import { encrypt } from '@/lib/crypto';
import { requireOwner } from '@/lib/rules';
import { requireSameOrigin } from '@/lib/request-origin';
import { isDemo, isStandalone, localEncryptionKey, writeLocalTavily, readLocalTavily } from '@/lib/demo';
import { snapshot } from '@/lib/store';
import { errorStatus, AuthRequiredError, LocalStorageError } from '@/lib/errors';

const schema = z.object({
  action: z.enum(['save', 'remove']),
  key: z.string().max(200).optional(),
  confirm: z.literal(true),
});

export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    if (isDemo()) throw new Error('La demo non memorizza segreti.');

    if (isStandalone()) {
      requireOwner((await snapshot()).role);
      const p = schema.parse(await req.json());
      if (p.action === 'remove') {
        await writeLocalTavily(null);
        return NextResponse.json({ ok: true });
      }
      const key = p.key?.trim();
      if (!key) throw new Error('Inserisci una chiave Tavily.');
      // Verifica rapida: una richiesta reale a Tavily
      const test = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, query: 'test', max_results: 1 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!test.ok)
        throw new Error(
          test.status === 401 || test.status === 403
            ? 'Chiave Tavily non valida o non autorizzata.'
            : 'Tavily non disponibile al momento. Riprova.',
        );
      const encKey = process.env.APP_ENCRYPTION_KEY || (await localEncryptionKey());
      const ciphertext = encrypt(key, encKey);
      await writeLocalTavily({ ciphertext, last4: key.slice(-4) });
      return NextResponse.json({ ok: true, last4: key.slice(-4) });
    }

    // Modalità Supabase: usa solo env var (semplice, nessuna tabella aggiuntiva)
    return NextResponse.json(
      { error: 'In modalità Supabase imposta TAVILY_API_KEY come variabile d\'ambiente Railway.' },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Configurazione non riuscita.' },
      { status: errorStatus(e) },
    );
  }
}

export async function GET() {
  if (!isStandalone()) return NextResponse.json({ configured: false, last4: '' });
  const data = await readLocalTavily();
  return NextResponse.json({ configured: !!data, last4: data?.last4 || '' });
}
