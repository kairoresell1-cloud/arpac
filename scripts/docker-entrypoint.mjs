/**
 * Entrypoint Docker unico: avvia il server Next.js E il loop scheduler
 * nello stesso processo Node. Nessun secondo servizio Railway necessario.
 *
 * Il loop chiama /api/cron ogni 30 secondi (come il worker separato),
 * ma aspetta che il server sia pronto prima di iniziare.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.error('Build assente.');
  process.exit(1);
}

// Variabili d'ambiente
if (fs.existsSync(path.join(root, '.env.local')))
  process.loadEnvFile(path.join(root, '.env.local'));

process.env.HOSTNAME = '0.0.0.0';
process.env.ARPAC_DATA_DIR = path.resolve(
  process.env.ARPAC_DATA_DIR || path.join(root, 'data'),
);

// Copia assets statici
fs.cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
fs.cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), {
  recursive: true,
});

// ── Loop scheduler integrato ─────────────────────────────────────────────────
const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const INTERVAL_MS = 30_000; // 30 secondi, stesso ritmo del worker separato

async function waitForServer(maxWait = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const r = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch { /* server non ancora pronto */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function cronLoop() {
  if (!CRON_SECRET) {
    console.warn('[scheduler] CRON_SECRET non impostato — loop automatico disabilitato.');
    return;
  }

  console.log('[scheduler] Attendo avvio server…');
  const ready = await waitForServer();
  if (!ready) {
    console.warn('[scheduler] Server non raggiungibile dopo 60s — loop disabilitato.');
    return;
  }
  console.log('[scheduler] Server pronto. Loop automatico attivo ogni 30s.');

  while (true) {
    try {
      const r = await fetch(`${APP_URL}/api/cron`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
        signal: AbortSignal.timeout(240_000),
      });
      const body = await r.json().catch(() => ({}));
      console.log(
        new Date().toISOString(),
        r.ok
          ? `[scheduler] OK — elaborati: ${body.processed ?? 0}, motivo: ${body.reason ?? '?'}`
          : `[scheduler] Errore ${r.status}`,
      );
    } catch (e) {
      console.log('[scheduler] Timeout/connessione: riprovo tra 30s.', e instanceof Error ? e.message : '');
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

// Avvia il loop in background (non blocca il server)
cronLoop().catch((e) => console.error('[scheduler] Errore fatale loop:', e));

// Avvia il server Next.js (blocca il processo)
await import(pathToFileURL(path.join(standalone, 'server.js')).href);
