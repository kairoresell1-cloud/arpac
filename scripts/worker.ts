export {};
const origin = process.env.APP_URL || 'http://localhost:3000';
async function tick() {
  if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET mancante.');
  try {
    const r = await fetch(`${origin}/api/cron`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(240000),
    });
    console.log(new Date().toISOString(), r.ok ? 'Controllo completato' : 'Controllo da riprovare');
  } catch {
    console.log('Connessione al server non disponibile; nuovo tentativo tra 30 secondi.');
  }
}
async function main() {
  while (true) {
    await tick();
    await new Promise((r) => setTimeout(r, 30000));
  }
}
main().catch(() => {
  console.error('Configurazione worker incompleta.');
  process.exit(1);
});
