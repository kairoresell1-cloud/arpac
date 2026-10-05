import { z } from "zod";

// IMPORTANTE: i modelli (soprattutto su Groq) scrivono `null` esplicito di
// continuo per "questo campo non serve ora", non lo omettono mai e non
// usano `[]` da soli. Se usassimo solo `.optional()`/`.default()`, questi
// scattano SOLO quando il campo è `undefined` (assente), MAI quando è
// `null` esplicito — e il parsing fallirebbe silenziosamente anche dopo una
// chiamata API riuscita. Per questo ogni campo opzionale è `.nullable()`
// con un `.transform()` che normalizza `null` nel default corretto.

const propostaSchema = z.object({
  tipo: z.enum(["progetto", "task", "scadenza", "finanza", "altro"]),
  titolo: z.string(),
  descrizione: z.string(),
  motivazione: z
    .string()
    .nullable()
    .transform((v) => v ?? ""),
  payload: z
    .record(z.unknown())
    .nullable()
    .transform((v) => v ?? {})
});

const nuovaMemoriaSchema = z.object({
  contenuto: z.string(),
  fonte: z
    .string()
    .nullable()
    .transform((v) => v ?? "")
});

export const arpacResponseSchema = z.object({
  // "" è valido: in un controllo automatico senza nulla da dire il testo
  // può essere vuoto (silenzio), ma MAI in risposta a un messaggio umano
  // diretto — quella regola è applicata a livello di prompt, non di schema.
  testo: z
    .string()
    .nullable()
    .transform((v) => v ?? ""),
  proposte: z
    .array(propostaSchema)
    .nullable()
    .transform((v) => v ?? []),
  nuoveMemorie: z
    .array(nuovaMemoriaSchema)
    .nullable()
    .transform((v) => v ?? []),
  silenzio: z
    .boolean()
    .nullable()
    .transform((v) => v ?? false)
});

export type ArpacResponse = z.infer<typeof arpacResponseSchema>;

/**
 * Estrae il blocco {...} più esterno da un testo grezzo prima di fare
 * JSON.parse. Rete di sicurezza nel caso il modello aggiunga testo
 * perimetrale (```json, spiegazioni, ecc.) nonostante le istruzioni.
 */
export function estraiBloccoJSON(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Nessun blocco JSON trovato nella risposta del modello.");
  }
  return raw.slice(start, end + 1);
}

export function parseArpacResponse(raw: string): ArpacResponse {
  const jsonBlock = estraiBloccoJSON(raw);
  const parsed = JSON.parse(jsonBlock);
  return arpacResponseSchema.parse(parsed);
}
