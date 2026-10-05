# ARPAC

Manager AI proattivo per un piccolo team (max 5 persone). Next.js (App Router) + TypeScript + Tailwind. Modalità file-locale di default (nessun database esterno richiesto), con opzione Supabase per multi-utente reale. AI tramite Groq.

## Sviluppo locale

```bash
npm install
cp .env.example .env.local
# apri .env.local e inserisci GROQ_API_KEY + SESSION_SECRET
npm run dev
```

Apri `http://localhost:3000`. Il primo account che registri (pulsante "Unisciti al team") diventa automaticamente owner. In modalità file-locale i dati vengono salvati in `./data/db.json`.

## Deploy su Railway

1. **Crea un nuovo progetto su Railway** collegato a questo repository GitHub (push del contenuto di questa cartella, zip incluso).
2. Railway rileva il `Dockerfile` e builda automaticamente — non serve configurare altro per il build.
3. **Aggiungi un volume**: Settings → Volumes → crea un volume e montalo su `/data`. Questo è il percorso usato da `DATA_DIR` per persistere `db.json` tra i riavvii del container.
4. **Variabili d'ambiente** (Settings → Variables):
   - `GROQ_API_KEY` — la tua chiave Groq
   - `SESSION_SECRET` — una stringa casuale lunga (es. `openssl rand -hex 32`)
   - `DATA_DIR` — `/data` (deve combaciare col mount point del volume)
   - `GROQ_MODEL` — opzionale, default `openai/gpt-oss-120b`
   - Per Supabase (opzionale): `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
5. Deploy. Un solo servizio Docker è sufficiente: lo scheduler in background gira dentro allo stesso processo Next.js (vedi `instrumentation.ts`), non serve un worker separato.
6. Apri l'URL assegnato da Railway, registra il primo membro (owner) e poi fai registrare gli altri (max 5 in totale).

## Modalità Supabase (opzionale)

Se vuoi multi-utente reale su un vero database invece dei file JSON: crea un progetto Supabase, esegui `supabase/schema.sql` nell'editor SQL, poi imposta `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` su Railway. **Nota:** il layer `lib/supabase.ts` è pronto come client, ma `lib/store.ts` attualmente implementa solo la modalità file-locale — per passare a Supabase in produzione, replica le funzioni `readDB`/`mutateDB` con query Supabase equivalenti (lo schema SQL rispecchia esattamente `lib/types.ts`).

## Decisioni chiave già prese nel codice (per non ripetere errori già fatti)

- **Groq non ha embedding**: la ricerca semantica delle memorie usa un embedding locale (hashing trick, `lib/embeddings.ts`), con soglia minima di similitudine per evitare falsi positivi su conversazioni appena iniziate.
- **`reasoning_format: 'hidden'`** sempre attivo nelle chiamate Groq (`lib/groq.ts`), con `reasoning_effort` esplicito e `max_tokens: 6000` per non troncare le risposte.
- **Parsing JSON robusto**: estrazione del blocco `{...}` più esterno prima di `JSON.parse` (`lib/ai-schema.ts`), più schema Zod con `.nullable().transform()` ovunque (Groq manda `null` esplicito, non omette i campi).
- **Anti-allucinazioni**: `lib/anti-allucinazioni.ts` verifica che nomi/orari/date citati dall'AI compaiano letteralmente nei dati reali prima di mostrarli; le nuove memorie proposte dall'AI vengono accettate solo se la loro "fonte" è verificabile nel contesto precedente alla risposta (mai un fatto affermato per la prima volta nella stessa risposta che lo salva).
- **Contesto identico per messaggi diretti e controlli automatici** (`lib/context.ts`): stessa ricchezza di dati in entrambi i casi, per evitare che l'AI riempia un contesto vuoto inventando.
- **Scheduler integrato** via `instrumentation.ts` (hook ufficiale Next.js, parte una volta sola all'avvio), non un servizio separato — funziona perché Railway fa girare un processo Node persistente (`output: 'standalone'`).
- **Lock brevi**: `lib/store.ts` tiene il lock del file SOLO per leggere/scrivere, mai durante le chiamate di rete verso Groq (vedi il pattern in `lib/ai-session.ts`) — altrimenti un utente che scrive mentre lo scheduler gira resta bloccato per tutta la durata della chiamata AI.
- **Utente attivo sempre dal cookie di sessione** della richiesta corrente (`lib/session.ts`), mai da un campo statico fisso — altrimenti l'onboarding di un membro qualsiasi sovrascriverebbe il profilo di un altro in modalità file-locale.

## Cosa manca / da rifinire

- Viste dedicate per Task/Progetti/Finanze/Calendario (le API REST ci sono già: `/api/tasks`, `/api/finance`; mancano le UI — per ora si vedono solo dentro al contesto che ARPAC usa per rispondere e nel pannello Proposte).
- Gestione chiave Groq da interfaccia owner (cifrata AES-256-GCM) menzionata nella spec iniziale — al momento la chiave è solo da variabile d'ambiente `GROQ_API_KEY`.
- Realtime (Supabase Realtime) per la chat — al momento il frontend fa polling ogni 4s sui messaggi e ogni 15s sulle proposte.
