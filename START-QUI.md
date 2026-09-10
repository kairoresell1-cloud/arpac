# ARPAC: il percorso minimo

## Cosa fai tu

1. Carica il contenuto di questa cartella in un repository GitHub **privato**.
2. In Railway scegli quel repository e premi Deploy.
3. In Railway aggiungi le variabili indicate sotto.

## Variabili indispensabili Railway

Per il percorso più rapido puoi lasciare vuote tutte le variabili Supabase: in produzione ARPAC usa la modalità autonoma, crea un archivio vuoto in `data/` e parte senza SQL Editor.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
APP_URL
APP_ENCRYPTION_KEY
CRON_SECRET
```

`APP_URL` è il dominio Railway che Railway ti assegna. Genera `APP_ENCRYPTION_KEY` e `CRON_SECRET` con:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Modalità autonoma (consigliata per partire subito)

Con le variabili Supabase vuote usa il login iniziale `owner@arpac.local` / `arpac-local-setup`. Meglio impostare `OWNER_EMAIL` e `OWNER_PASSWORD` nelle Variables Railway. Per non perdere i dati quando Railway ricrea il container, aggiungi un volume montato su `/app/data`.

## Opzione Supabase

In Supabase incolla in SQL Editor il solo file `supabase/schema.sql` e premi Run. Questo abilita PostgreSQL, sicurezza, Storage, Realtime e coda AI; non è necessario per il primo deploy autonomo.

Poi aggiungi queste due variabili temporanee in locale ed esegui una sola volta:

```text
OWNER_EMAIL
OWNER_PASSWORD
```

```powershell
npm install
npm run bootstrap
```

Da quel momento inviti tutti gli altri membri dal pulsante Team dentro ARPAC.

## Gemini è facoltativo e si configura dal sito

Dopo il deploy, l’owner inserisce la chiave da `Impostazioni → AI Provider`. Non serve modificare Railway ogni volta e puoi lasciare `GEMINI_API_KEY` vuota.

## Worker automatico

In Railway duplica il servizio e imposta `railway.worker.toml`. Usa le stesse variabili `APP_URL` e `CRON_SECRET`. Il worker gestisce briefing, reminder, report, risposte Gemini e retry.

Il repository è vuoto: `data/`, `.env.local`, `node_modules` e `.next` non vengono caricati. In produzione la modalità demo è disabilitata.
