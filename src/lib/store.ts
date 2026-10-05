import fs from "fs/promises";
import path from "path";
import { DB, emptyDB } from "./types";

// Percorso su cui Railway monta il volume persistente. Configurabile via env
// per sviluppo locale (cartella ./data dentro al progetto).
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const SUPABASE_MODE = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

export function isSupabaseMode() {
  return SUPABASE_MODE;
}

// --- Lock in memoria, SOLO per la durata di lettura/scrittura del file.
// Non va mai tenuto occupato durante una chiamata di rete (es. verso Groq):
// altrimenti un utente che scrive mentre lo scheduler gira resta in coda
// per tutta la durata della chiamata AI. Vedi lib/ai-session.ts per il
// pattern corretto (leggi -> rilascia lock -> chiama AI -> lock breve per scrivere).
let writeQueue: Promise<unknown> = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readRaw(): Promise<DB> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    return JSON.parse(raw) as DB;
  } catch {
    const fresh = emptyDB();
    await fs.writeFile(DB_PATH, JSON.stringify(fresh, null, 2), "utf-8");
    return fresh;
  }
}

/**
 * Legge l'intero DB. Lettura pura, nessun lock necessario.
 */
export async function readDB(): Promise<DB> {
  if (SUPABASE_MODE) {
    throw new Error(
      "readDB() del file store chiamato in modalità Supabase. Usa lib/supabase.ts."
    );
  }
  return readRaw();
}

/**
 * Applica una mutazione al DB in modo atomico rispetto alle altre scritture
 * concorrenti. Il lock copre SOLO l'operazione di lettura+scrittura del file,
 * mai operazioni di rete: `mutator` deve essere sincrono/veloce.
 */
export async function mutateDB<T = void>(mutator: (db: DB) => T): Promise<T> {
  if (SUPABASE_MODE) {
    throw new Error(
      "mutateDB() del file store chiamato in modalità Supabase. Usa lib/supabase.ts."
    );
  }
  const run = writeQueue.then(async () => {
    const db = await readRaw();
    const risultato = mutator(db);
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
    return risultato;
  });
  // Scollega gli errori dalla coda, altrimenti un fallimento blocca tutte
  // le scritture successive per sempre.
  writeQueue = run.catch(() => undefined) as Promise<unknown> as Promise<T>;
  return run;
}
