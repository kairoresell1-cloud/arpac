/**
 * Avvio locale con scheduler integrato (stesso comportamento del Docker).
 * Usa npm run start dopo npm run build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.error('Build assente. Esegui prima npm run build.');
  process.exit(1);
}

if (fs.existsSync(path.join(root, '.env.local')))
  process.loadEnvFile(path.join(root, '.env.local'));

fs.cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
fs.cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), {
  recursive: true,
});

process.env.HOSTNAME = '0.0.0.0';
process.env.ARPAC_DATA_DIR = path.resolve(
  process.env.ARPAC_DATA_DIR || path.join(root, 'data'),
);

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function waitForServer(maxWait = 30_000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const r = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* attendo */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function cronLoop() {
  if (!CRON_SECRET) {
    console.warn('[scheduler] CRON_SECRET non impostato — imposta CRON_SECRET in .env.local per il loop automatico.');
    return;
  }
  await waitForServer();
  console.log('[scheduler] Loop attivo (30s).');
  while (true) {
    try {
      const r = await fetch(`${APP_URL}/api/cron`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
        signal: AbortSignal.timeout(240_000),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && (body.processed ?? 0) > 0)
        console.log(`[scheduler] elaborati: ${body.processed}, ${body.reason ?? ''}`);
    } catch { /* riprovo */ }
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

cronLoop().catch(() => {});
await import(pathToFileURL(path.join(standalone, 'server.js')).href);
