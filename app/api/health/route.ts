import { isStandalone, readStandalone, localEncryptionKey } from '@/lib/demo';
import { checkDataAccess } from '@/lib/local-files';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    if (isStandalone()) {
      await checkDataAccess();
      await readStandalone();
      await localEncryptionKey();
    }
    return Response.json({ status: 'ok', app: 'ARPAC', version: '1.0.1' });
  } catch {
    return Response.json(
      { status: 'error', app: 'ARPAC', error: 'Archivio dati non disponibile.' },
      { status: 503 },
    );
  }
}
