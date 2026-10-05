import { nanoid } from "nanoid";
import { readDB, mutateDB } from "./store";
import { costruisciContesto, contestoPrecedenteTestuale } from "./context";
import { chiamaArpac } from "./groq";
import { parseArpacResponse } from "./ai-schema";
import { verificaTesto, filtraMemorieVerificabili } from "./anti-allucinazioni";
import { ARPAC_SYSTEM_PROMPT } from "./prompt";
import { DB, Messaggio } from "./types";

type EsecuzioneArpacInput =
  | { modalita: "diretto"; mittenteId: string; testoMessaggio: string; canale: string }
  | { modalita: "automatico"; motivoControllo: string };

export type EsecuzioneArpacOutput = {
  messaggioAI: Messaggio | null;
  propostaIds: string[];
  memorieSalvate: number;
  avvisiVerifica: string[];
};

/**
 * Esegue un ciclo completo: legge il DB (lettura pura, no lock), chiama
 * Groq (chiamata di rete, NESSUN lock tenuto durante questa fase), poi
 * applica verifica anti-allucinazioni e scrive il risultato con un lock
 * breve. Questo è il pattern corretto da seguire ovunque nell'app: mai
 * tenere mutateDB() aperto a cavallo di una await di rete.
 */
export async function eseguiArpac(input: EsecuzioneArpacInput): Promise<EsecuzioneArpacOutput> {
  // 1. Lettura pura, nessun lock.
  const dbLettura = await readDB();
  const contesto = costruisciContesto(dbLettura, input);
  const contestoPrecedente = contestoPrecedenteTestuale(dbLettura);

  const reasoningEffort = input.modalita === "diretto" ? "medium" : "medium";

  // 2. Chiamata di rete: NESSUN lock del DB tenuto qui.
  const rawRisposta = await chiamaArpac({
    systemPrompt: ARPAC_SYSTEM_PROMPT,
    contesto,
    reasoningEffort
  });

  const risposta = parseArpacResponse(rawRisposta);

  // Regola di sicurezza indipendente dal prompt: un messaggio diretto non
  // può mai risultare in silenzio, qualsiasi cosa dica il modello.
  const forzaRisposta = input.modalita === "diretto" && risposta.silenzio;
  const testoFinale = forzaRisposta
    ? "Ho ricevuto il tuo messaggio ma non sono riuscito a formulare una risposta utile in questo momento. Puoi riformulare?"
    : risposta.testo;

  if (input.modalita === "automatico" && (risposta.silenzio || !testoFinale)) {
    return { messaggioAI: null, propostaIds: [], memorieSalvate: 0, avvisiVerifica: [] };
  }

  // 3. Verifica anti-allucinazioni sul testo prima di salvarlo/mostrarlo.
  const verifica = verificaTesto(testoFinale, dbLettura);
  const testoDaMostrare = verifica.ok
    ? testoFinale
    : `${testoFinale}\n\n(Nota: alcuni dettagli di questa risposta non sono stati verificabili nei dati del team e sono stati segnalati internamente.)`;

  const memorieVerificate = filtraMemorieVerificabili(risposta.nuoveMemorie, contestoPrecedente);

  // 4. Scrittura: lock breve, solo lettura/scrittura file, nessuna await di
  // rete all'interno.
  const idMessaggio = nanoid();
  const propostaIds: string[] = [];

  await mutateDB((db: DB) => {
    const canale = input.modalita === "diretto" ? input.canale : "gruppo";
    db.messaggi.push({
      id: idMessaggio,
      canale,
      autoreId: "arpac",
      testo: testoDaMostrare,
      timestamp: new Date().toISOString()
    });

    for (const p of risposta.proposte) {
      const id = nanoid();
      propostaIds.push(id);
      db.proposte.push({
        id,
        tipo: p.tipo,
        titolo: p.titolo,
        descrizione: p.descrizione,
        motivazione: p.motivazione,
        payload: p.payload,
        stato: "in_attesa",
        creataIl: new Date().toISOString(),
        decisaIl: null,
        decisaDa: null
      });
    }

    for (const m of memorieVerificate) {
      db.memorie.push({
        id: nanoid(),
        contenuto: m.contenuto,
        fonte: m.fonte,
        creataIl: new Date().toISOString()
      });
    }
  });

  const messaggioAI: Messaggio = {
    id: idMessaggio,
    canale: input.modalita === "diretto" ? input.canale : "gruppo",
    autoreId: "arpac",
    testo: testoDaMostrare,
    timestamp: new Date().toISOString()
  };

  return {
    messaggioAI,
    propostaIds,
    memorieSalvate: memorieVerificate.length,
    avvisiVerifica: verifica.motivi
  };
}
