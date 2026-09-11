import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverJs = path.resolve(__dirname, '..', 'server.js');

if (!fs.existsSync(serverJs)) {
  console.error('server.js non trovato in:', serverJs);
  console.error('Contenuto cartella:', fs.readdirSync(path.dirname(serverJs)));
  process.exit(1);
}

process.env.HOSTNAME = '0.0.0.0';
process.env.ARPAC_DATA_DIR = process.env.ARPAC_DATA_DIR || '/app/data';

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* attendo */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function cronLoop() {
  if (!CRON_SECRET) {
    console.warn('[scheduler] CRON_SECRET mancante — loop disabilitato.');
    return;
  }
  console.log('[scheduler] Attendo server...');
  await waitForServer();
  console.log('[scheduler] Loop attivo ogni 30s.');
  while (true) {
    try {
      const r = await fetch(`${APP_URL}/api/cron`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
        signal: AbortSignal.timeout(240_000),
      });
      const b = await r.json().catch(() => ({}));
      if (b.processed > 0)
        console.log(`[scheduler] elaborati: ${b.processed}`);
    } catch { /* riprovo */ }
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

cronLoop().catch(() => {});
await import(pathToFileURL(serverJs).href);
