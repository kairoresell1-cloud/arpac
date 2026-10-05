import { readDB } from "./store";
import { eseguiArpac } from "./ai-session";

// Stato in-memory del processo (unico processo Node persistente su
// Railway/Docker, output:'standalone' — vedi next.config.js). Non serve
// persisterlo: se il container riparte, riparte anche il ciclo.
let ultimoBriefingGiorno: string | null = null;
let ultimoReportGiorno: string | null = null;
let ultimoControlloGenerico = 0;

const INTERVALLO_CONTROLLO_GENERICO_MS = 1000 * 60 * 30; // ogni 30 minuti

function oggiISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Chiamata dal loop di instrumentation.ts ogni 30s. Decide, senza chiamare
 * l'AI ogni volta, QUANDO vale la pena fare un controllo (per non sprecare
 * chiamate Groq a ogni tick). Quando decide di procedere, delega a
 * eseguiArpac in modalità "automatico", che a sua volta può restituire
 * silenzio se non c'è nulla di rilevante.
 */
export async function ticoScheduler() {
  const ora = new Date();
  const oraLocale = ora.getHours();
  const oggi = oggiISO();

  // Briefing mattutino, una volta al giorno tra le 8 e le 9.
  if (oraLocale === 8 && ultimoBriefingGiorno !== oggi) {
    ultimoBriefingGiorno = oggi;
    await eseguiArpac({
      modalita: "automatico",
      motivoControllo: "Briefing mattutino: riassumi la giornata che inizia (task in scadenza oggi, eventi, proposte in attesa)."
    });
    return;
  }

  // Report serale, una volta al giorno tra le 19 e le 20.
  if (oraLocale === 19 && ultimoReportGiorno !== oggi) {
    ultimoReportGiorno = oggi;
    await eseguiArpac({
      modalita: "automatico",
      motivoControllo: "Report serale: riassumi cosa è successo oggi (task completati, movimenti finanziari, novità) e cosa resta aperto."
    });
    return;
  }

  // Controllo generico (pattern, rischi, scadenze vicine) ogni 30 minuti.
  if (ora.getTime() - ultimoControlloGenerico > INTERVALLO_CONTROLLO_GENERICO_MS) {
    ultimoControlloGenerico = ora.getTime();
    const db = await readDB();
    // Piccola euristica locale per evitare di chiamare l'AI quando non c'è
    // proprio nulla che si avvicina a una scadenza o a un task bloccato:
    // risparmia chiamate Groq nei periodi davvero tranquilli.
    const scadenzeVicine = db.tasks.some((t) => {
      if (!t.scadenza || t.stato === "fatto") return false;
      const giorni = (new Date(t.scadenza).getTime() - ora.getTime()) / (1000 * 60 * 60 * 24);
      return giorni <= 2;
    });
    const taskBloccati = db.tasks.some((t) => t.stato === "bloccato");
    if (!scadenzeVicine && !taskBloccati && db.tasks.length > 0) {
      return; // niente di urgente, non vale la pena chiamare l'AI
    }

    await eseguiArpac({
      modalita: "automatico",
      motivoControllo:
        "Controllo periodico: verifica scadenze vicine, task bloccati, spese ricorrenti anomale o membri sovraccarichi nei dati reali."
    });
  }
}
