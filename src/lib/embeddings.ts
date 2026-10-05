// Groq non espone un endpoint di embedding. Niente chiamate a embedding API
// di altri provider con una chiave Groq (fallisce sempre, silenziosamente).
// Qui implementiamo un embedding locale con hashing trick su parole e
// n-grammi di caratteri: nessuna dipendenza esterna, funziona sempre offline.

const DIM = 256;

function tokenizza(testo: string): string[] {
  const normalizzato = testo.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ");
  const parole = normalizzato.split(/\s+/).filter(Boolean);
  const token: string[] = [...parole];
  // n-grammi di caratteri (n=3) per catturare somiglianze morfologiche
  for (const parola of parole) {
    const p = `#${parola}#`;
    for (let i = 0; i < p.length - 2; i++) {
      token.push(p.slice(i, i + 3));
    }
  }
  return token;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function embed(testo: string): number[] {
  const vettore = new Array(DIM).fill(0);
  for (const t of tokenizza(testo)) {
    const idx = hash(t) % DIM;
    const segno = hash(t + "#segno") % 2 === 0 ? 1 : -1;
    vettore[idx] += segno;
  }
  const norma = Math.sqrt(vettore.reduce((s, v) => s + v * v, 0)) || 1;
  return vettore.map((v) => v / norma);
}

export function similitudineCoseno(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Soglia minima: sotto questo valore un risultato NON è considerato
// pertinente, anche se è il "più vicino" disponibile. Senza questa soglia,
// su una conversazione appena iniziata (poco testo su cui cercare) la
// ricerca restituirebbe comunque i risultati più vicini pur non essendo
// pertinenti, e l'AI li racconterebbe come fatti della conversazione
// attuale quando vengono da un contesto completamente diverso.
export const SOGLIA_MINIMA_SIMILITUDINE = 0.22;

export function cercaRilevanti<T>(
  query: string,
  elementi: { testo: string; dato: T }[],
  k = 5
): { dato: T; score: number }[] {
  const qVec = embed(query);
  return elementi
    .map((e) => ({ dato: e.dato, score: similitudineCoseno(qVec, embed(e.testo)) }))
    .filter((r) => r.score >= SOGLIA_MINIMA_SIMILITUDINE)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
