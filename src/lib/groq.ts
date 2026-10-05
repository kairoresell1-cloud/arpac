import Groq from "groq-sdk";

const MODELLO_DEFAULT = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// Istanziato lazy (non al top-level del modulo): a build-time Next.js
// analizza le route anche senza le variabili d'ambiente di runtime
// disponibili, e il costruttore di Groq lancia subito se manca la key.
let _groq: Groq | null = null;
function getGroqClient(): Groq {
  if (!_groq) {
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

type ChiamataAIOpzioni = {
  systemPrompt: string;
  contesto: string;
  /**
   * "low" solo per chat diretta quando la velocità conta più della
   * correttezza; in pratica quasi sempre meglio partire da "medium".
   */
  reasoningEffort?: "low" | "medium" | "high";
};

/**
 * Chiamata "grezza" al modello. Non fa parsing/validazione: restituisce il
 * testo raw, che va passato a parseArpacResponse(). reasoning_format è
 * sempre 'hidden' — il ragionamento interno del modello non deve MAI
 * arrivare all'utente, né mescolarsi al JSON di risposta.
 */
export async function chiamaArpac({
  systemPrompt,
  contesto,
  reasoningEffort = "medium"
}: ChiamataAIOpzioni): Promise<string> {
  // Campi reasoning_format / reasoning_effort sono specifici dei modelli
  // reasoning su Groq e potrebbero non essere (o essere parzialmente)
  // tipizzati a seconda della versione dell'SDK: passati via cast mirato
  // invece di @ts-expect-error, che si romperebbe appena l'SDK li tipizza.
  const params = {
    model: MODELLO_DEFAULT,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: contesto }
    ],
    reasoning_format: "hidden",
    reasoning_effort: reasoningEffort,
    // Generoso: deve lasciare spazio sia al ragionamento interno (anche se
    // nascosto, consuma token) sia alla risposta JSON finale. Senza questo
    // la risposta finale può troncarsi a metà.
    max_tokens: 6000,
    temperature: 0.4
  } as unknown as Parameters<Groq["chat"]["completions"]["create"]>[0];

  const completion = (await getGroqClient().chat.completions.create(params)) as {
    choices: { message?: { content?: string | null } }[];
  };

  const testo = completion.choices[0]?.message?.content;
  if (!testo) {
    throw new Error("Risposta vuota dal modello Groq.");
  }
  return testo;
}
