// Hook ufficiale di Next.js (App Router): register() parte UNA SOLA VOLTA
// quando il server si avvia. Funziona perché su Railway/Docker il server
// gira come processo Node persistente (output: 'standalone' in
// next.config.js) — su una piattaforma serverless "a funzioni" questo
// approccio non funzionerebbe, perché il processo si spegne tra una
// richiesta e l'altra. Non serve un secondo servizio/worker separato.

export async function register() {
  // instrumentation.ts viene valutato sia per il runtime nodejs sia per
  // edge: lo scheduler deve girare solo lato nodejs (usa fs per i file).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ticoScheduler } = await import("./src/lib/scheduler-logic");

  const INTERVALLO_MS = 30_000;

  setInterval(() => {
    ticoScheduler().catch((err) => {
      console.error("[ARPAC scheduler] errore nel ciclo:", err);
    });
  }, INTERVALLO_MS);

  console.log("[ARPAC] scheduler in background avviato (ogni 30s).");
}
