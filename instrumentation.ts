/**
 * Scheduler integrato: fa scrivere ARPAC in autonomia (briefing, report,
 * promemoria, idee spontanee) SENZA bisogno di un secondo servizio Railway
 * separato (il vecchio `railway.worker.toml` + `Dockerfile.worker`).
 *
 * `instrumentation.ts` è un hook ufficiale di Next.js: la funzione register()
 * viene eseguita automaticamente UNA VOLTA quando il server si avvia (non ad
 * ogni richiesta, non in fase di build). È il punto giusto per partire con
 * un loop in background che vive per tutta la vita del processo — cosa
 * possibile solo perché ARPAC gira come server Node persistente
 * (`output: 'standalone'` in next.config.ts, non funzioni serverless).
 *
 * Il vecchio `/api/cron` + worker esterno restano disponibili e funzionano
 * ancora (utili se un giorno si scala su più repliche con Supabase, dove un
 * trigger esterno indipendente dal processo web può avere senso), ma non
 * sono più necessari per l'uso normale: con un solo container in esecuzione,
 * ARPAC ora si occupa da solo del proprio ciclo di controllo.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Guardia anti-doppioni: in sviluppo Next.js può ricaricare i moduli più
  // volte nello stesso processo. Senza questo flag globale finiremmo con
  // due (o più) loop attivi in parallelo, con risposte duplicate.
  const g = globalThis as unknown as { __arpacSchedulerStarted?: boolean };
  if (g.__arpacSchedulerStarted) return;
  g.__arpacSchedulerStarted = true;

  const TICK_MS = 30000; // stesso intervallo del vecchio worker esterno

  const tick = async () => {
    try {
      const { isDemo, isStandalone } = await import('./lib/demo');
      // La demo non chiama mai un provider AI vero: nessuna automazione da eseguire.
      if (isDemo()) return;
      if (isStandalone()) {
        const { runLocalScheduler } = await import('./lib/local-scheduler');
        await runLocalScheduler();
        return;
      }
      const { schedule, processJob } = await import('./lib/ai');
      await schedule();
      let n = 0;
      while (n < 3 && (await processJob())) n++;
    } catch (error) {
      // Un tick fallito (es. rete assente, quota esaurita) non deve fermare
      // il loop: si riprova al giro successivo.
      console.error('[ARPAC/scheduler]', error instanceof Error ? error.message : error);
    }
  };

  setInterval(tick, TICK_MS).unref();
  // Primo giro subito, senza aspettare i primi 30s dopo l'avvio del server.
  void tick();
}
