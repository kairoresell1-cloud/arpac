import { DB } from "./types";
import { cercaRilevanti } from "./embeddings";

type TipoContesto =
  | { modalita: "diretto"; mittenteId: string; testoMessaggio: string; canale: string }
  | { modalita: "automatico"; motivoControllo: string };

/**
 * Costruisce il contesto per il modello. Una risposta diretta a un
 * messaggio di una persona vera riceve LO STESSO livello di contesto
 * (task attivi, membri, memorie, cronologia recente) di un messaggio
 * spontaneo programmato — mai un prompt vuoto con solo il testo appena
 * scritto. Senza dati veri da cui partire, l'AI riempie il vuoto
 * inventando.
 */
export function costruisciContesto(db: DB, tipo: TipoContesto): string {
  const membri = db.members.map((m) => `- ${m.nome} (${m.ruolo})${m.isOwner ? " [owner]" : ""}`).join("\n") || "(nessun membro registrato)";

  const taskAttivi = db.tasks
    .filter((t) => t.stato !== "fatto")
    .map((t) => `- [${t.stato}] ${t.titolo} — assegnato a: ${t.assegnatoA ?? "nessuno"} — scadenza: ${t.scadenza ?? "nessuna"} (id:${t.id})`)
    .join("\n") || "(nessun task attivo)";

  const progetti = db.progetti
    .map((p) => `- [${p.stato}] ${p.nome} (id:${p.id})`)
    .join("\n") || "(nessun progetto)";

  const prossimiEventi = db.calendario
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 10)
    .map((e) => `- ${e.data} — ${e.titolo} (id:${e.id})`)
    .join("\n") || "(nessun evento imminente)";

  const movimentiRecenti = db.finanza
    .slice(-15)
    .map((f) => `- ${f.data} ${f.tipo} ${f.importo}€ — ${f.descrizione} (id:${f.id})`)
    .join("\n") || "(nessun movimento registrato)";

  const propostePendenti = db.proposte
    .filter((p) => p.stato === "in_attesa")
    .map((p) => `- [${p.tipo}] ${p.titolo} (id:${p.id})`)
    .join("\n") || "(nessuna proposta in attesa)";

  // Cronologia recente: ultimi messaggi del canale rilevante.
  const canale = tipo.modalita === "diretto" ? tipo.canale : "gruppo";
  const cronologiaRecente = db.messaggi
    .filter((m) => m.canale === canale)
    .slice(-30)
    .map((m) => `[${m.timestamp}] (id:${m.id}) ${m.autoreId}: ${m.testo}`)
    .join("\n") || "(nessun messaggio precedente in questo canale)";

  // Memorie rilevanti via ricerca semantica locale (con soglia minima).
  const queryMemoria = tipo.modalita === "diretto" ? tipo.testoMessaggio : tipo.motivoControllo;
  const memorieRilevanti = cercaRilevanti(
    queryMemoria,
    db.memorie.map((m) => ({ testo: m.contenuto, dato: m })),
    8
  )
    .map((r) => `- (id:${r.dato.id}) ${r.dato.contenuto}`)
    .join("\n") || "(nessuna memoria pertinente trovata)";

  const intestazioneModalita =
    tipo.modalita === "diretto"
      ? `QUESTO È UN MESSAGGIO DIRETTO DI UNA PERSONA VERA (${tipo.mittenteId}), NON un controllo automatico. Sta aspettando una risposta: non usare mai "silenzio: true" qui.\nMessaggio ricevuto: "${tipo.testoMessaggio}"`
      : `QUESTO È UN CONTROLLO AUTOMATICO IN BACKGROUND. Motivo del controllo: ${tipo.motivoControllo}. Se non c'è nulla di rilevante, rispondi con silenzio: true.`;

  return `${intestazioneModalita}

## Membri del team
${membri}

## Task attivi
${taskAttivi}

## Progetti
${progetti}

## Prossimi eventi in calendario
${prossimiEventi}

## Movimenti finanziari recenti
${movimentiRecenti}

## Proposte in attesa di approvazione
${propostePendenti}

## Cronologia recente (canale: ${canale})
${cronologiaRecente}

## Memorie rilevanti
${memorieRilevanti}`;
}

/**
 * Testo completo del contesto "precedente" da passare al filtro
 * anti-allucinazioni delle memorie: tutto ciò che era già noto PRIMA di
 * chiamare il modello in questo turno.
 */
export function contestoPrecedenteTestuale(db: DB): string {
  return JSON.stringify({
    messaggi: db.messaggi.map((m) => m.id),
    tasks: db.tasks.map((t) => t.id),
    eventi: db.calendario.map((e) => e.id),
    finanza: db.finanza.map((f) => f.id),
    memorie: db.memorie.map((m) => m.id)
  });
}
