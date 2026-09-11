import 'server-only';
import { readJson, writeJson } from './local-files';

// ── Struttura dati ──────────────────────────────────────────────────────────
// Salviamo gli embedding in un file JSON unico: embeddings.json
// Struttura: { version: 1, entries: EmbeddingEntry[] }
// Ogni voce è leggera: id, content (troncato a 400 char), project_id, vettore.

export type EmbeddingEntry = {
  id: string;               // record_id
  content: string;          // title + '\n' + body (troncato)
  project_id: string | null;
  conversation_id: string | null;
  owner_id: string | null;
  vector: number[];         // 768 dimensioni
  updated_at: string;
};

type EmbeddingStore = { version: 1; entries: EmbeddingEntry[] };

const FILE = 'embeddings.json';
const MAX_CONTENT = 1200;

async function load(): Promise<EmbeddingStore> {
  const stored = await readJson<EmbeddingStore>(FILE);
  if (stored?.version === 1 && Array.isArray(stored.entries)) return stored;
  return { version: 1, entries: [] };
}

export async function upsertEmbedding(entry: EmbeddingEntry) {
  const store = await load();
  const idx = store.entries.findIndex((e) => e.id === entry.id);
  const trimmed = { ...entry, content: entry.content.slice(0, MAX_CONTENT) };
  if (idx >= 0) store.entries[idx] = trimmed;
  else store.entries.push(trimmed);
  await writeJson(FILE, store);
}

export async function removeEmbedding(id: string) {
  const store = await load();
  store.entries = store.entries.filter((e) => e.id !== id);
  await writeJson(FILE, store);
}

// Cosine similarity
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function matchMemories(
  queryVector: number[],
  opts: {
    project_id: string | null;
    owner_id: string | null;
    conversation_id: string;
    limit?: number;
  },
): Promise<{ id: string; content: string; similarity: number }[]> {
  const store = await load();
  const results = store.entries
    .filter((e) => {
      // Stessa logica di visibilità di match_memories Supabase:
      // - entry privata (owner_id): solo se corrisponde
      // - entry di progetto: solo se stesso progetto o nessun progetto
      if (e.owner_id && e.owner_id !== opts.owner_id) return false;
      if (opts.project_id && e.project_id && e.project_id !== opts.project_id) return false;
      return true;
    })
    .map((e) => ({ id: e.id, content: e.content, similarity: cosine(queryVector, e.vector) }))
    .filter((e) => e.similarity > 0.65)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, opts.limit ?? 6);
  return results;
}

export async function embeddingCount(): Promise<number> {
  const store = await load();
  return store.entries.length;
}
