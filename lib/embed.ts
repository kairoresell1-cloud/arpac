/**
 * Motore di ricerca semantica locale, indipendente dal provider AI.
 *
 * Gemini offriva un endpoint di embedding dedicato (text-embedding-004);
 * Groq non lo offre. Piuttosto che far dipendere la ricerca "semantica"
 * da un secondo provider (o romperla del tutto quando l'owner usa solo
 * Groq), generiamo qui un vettore a 768 dimensioni con la "hashing trick":
 * parole intere + n-grammi di caratteri vengono proiettati in modo
 * deterministico nello spazio del vettore, con segno pseudo-casuale per
 * ridurre le collisioni (approccio alla Vowpal Wabbit).
 *
 * Non è un embedding neurale (non coglie sinonimi concettuali come farebbe
 * un modello dedicato), ma è: gratuito, istantaneo, non richiede alcuna
 * chiave API, non fallisce mai e coglie bene affinità lessicali/morfologiche
 * (utile in italiano per varianti di genere/numero/coniugazione grazie ai
 * trigrammi di caratteri). Ottimo per il volume di dati di un piccolo team.
 */

const DIM = 768;

const ACCENTS: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ä: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n',
};

function normalize(text: string): string {
  let out = text.toLowerCase();
  out = out.replace(/[àáâäèéêëìíîïòóôöùúûüçñ]/g, (m) => ACCENTS[m] || m);
  out = out.replace(/[^a-z0-9\s]/g, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

// FNV-1a a 32 bit: veloce, ben distribuito, deterministico.
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function addFeature(vector: Float64Array, feature: string, weight: number) {
  const h = hash(feature);
  const idx = h % DIM;
  const sign = h & 0x10000 ? 1 : -1;
  vector[idx] += sign * weight;
}

const STOPWORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'a', 'da', 'in', 'con', 'su',
  'per', 'tra', 'fra', 'e', 'o', 'ma', 'se', 'che', 'chi', 'non', 'come', 'più', 'anche',
  'del', 'della', 'dei', 'delle', 'al', 'alla', 'ai', 'alle', 'dal', 'dalla', 'nel', 'nella',
  'è', 'sono', 'siamo', 'essere', 'questo', 'questa', 'questi', 'queste', 'ci', 'si', 'ne',
]);

/** Genera un vettore a 768 dimensioni, normalizzato (norma L2 = 1). */
export function localEmbedding(text: string): number[] {
  const vector = new Float64Array(DIM);
  const clean = normalize(text).slice(0, 20000);
  const tokens = clean.split(' ').filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  for (const token of tokens) {
    // Parola intera: segnale forte, cattura il concetto esatto.
    addFeature(vector, `w:${token}`, 1.6);
    // Trigrammi di caratteri: segnale debole, cattura affinità morfologiche
    // (es. "progetto"/"progetti"/"progettuale" restano vicini nello spazio).
    const padded = `#${token}#`;
    for (let i = 0; i < padded.length - 2; i++) {
      addFeature(vector, `t:${padded.slice(i, i + 3)}`, 0.4);
    }
  }
  // Bigrammi di parole adiacenti: cattura frasi corte ("budget marketing").
  for (let i = 0; i < tokens.length - 1; i++) {
    addFeature(vector, `b:${tokens[i]}_${tokens[i + 1]}`, 0.9);
  }

  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array<number>(DIM);
  for (let i = 0; i < DIM; i++) out[i] = vector[i] / norm;
  return out;
}
