import { DB } from "./types";

// Il prompt da solo non basta: anche con istruzioni esplicite "non
// inventare", un modello medio può comunque inventare orari, riunioni, nomi
// plausibili ma inesistenti. Qui facciamo un controllo tecnico vero prima
// di mostrare o salvare qualunque affermazione con nome/orario/data.

const REGEX_ORA = /\b([01]?\d|2[0-3])[:.]\d{2}\b/g;
const REGEX_DATA = /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g;

export type EsitoVerifica = {
  ok: boolean;
  motivi: string[];
};

/**
 * Verifica che ogni nome di membro e ogni orario/data citati in `testo`
 * compaiano letteralmente nei dati reali del team (`db`). Non riscrive il
 * testo (non è un compito affidabile farlo con regex): segnala soltanto se
 * il testo contiene riferimenti non verificabili, così il chiamante può
 * decidere di scartarlo o sostituirlo con una risposta onesta.
 */
export function verificaTesto(testo: string, db: DB): EsitoVerifica {
  const motivi: string[] = [];
  const nomiReali = new Set(db.members.map((m) => m.nome.toLowerCase()));

  // Nomi plausibili: parole capitalizzate che NON sono nomi reali del team
  // e non sono la prima parola di una frase (per ridurre i falsi positivi).
  const parole = testo.match(/\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\b/g) || [];
  for (const parola of parole) {
    const lower = parola.toLowerCase();
    const paroleComuniNonNomi = new Set([
      "ARPAC",
      "Gruppo",
      "Oggi",
      "Domani",
      "Task",
      "Progetto"
    ]);
    if (paroleComuniNonNomi.has(parola)) continue;
    // Se sembra un nome proprio isolato (non seguito da un sostantivo noto)
    // e non è tra i nomi reali del team, segnaliamolo come sospetto solo se
    // compare in un contesto che suggerisce una persona (euristica leggera).
    const contestoPersona = new RegExp(`${parola}\\s+(ha|dice|pensa|propone|scrive|dovrebbe)`, "i");
    if (contestoPersona.test(testo) && !nomiReali.has(lower)) {
      motivi.push(`Nome "${parola}" citato in un contesto da persona ma non è un membro reale del team.`);
    }
  }

  const orari = testo.match(REGEX_ORA) || [];
  const date = testo.match(REGEX_DATA) || [];
  const datiTestuali = JSON.stringify(db.calendario) + JSON.stringify(db.tasks);
  for (const o of orari) {
    if (!datiTestuali.includes(o)) {
      motivi.push(`Orario "${o}" citato ma non presente nei dati reali (calendario/task).`);
    }
  }
  for (const d of date) {
    if (!datiTestuali.includes(d)) {
      motivi.push(`Data "${d}" citata ma non presente nei dati reali (calendario/task).`);
    }
  }

  return { ok: motivi.length === 0, motivi };
}

/**
 * Filtra le nuove memorie proposte dall'AI: una memoria può raccontare SOLO
 * qualcosa già presente nel contesto prima di questa risposta (messaggi
 * reali, dati esistenti) — mai qualcosa che il modello sta affermando per
 * la prima volta nella stessa risposta che la genera. `contestoPrecedente`
 * è il testo di tutto ciò che era già noto PRIMA di chiamare il modello.
 */
export function filtraMemorieVerificabili(
  nuoveMemorie: { contenuto: string; fonte: string }[],
  contestoPrecedente: string
): { contenuto: string; fonte: string }[] {
  return nuoveMemorie.filter((m) => {
    // Richiede che almeno la "fonte" dichiarata sia rintracciabile nel
    // contesto che il modello aveva già prima di rispondere (id messaggio,
    // id task, ecc.), non solo che "suoni" plausibile.
    if (!m.fonte) return false;
    return contestoPrecedente.includes(m.fonte);
  });
}
