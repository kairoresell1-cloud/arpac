# ARPAC su Railway — Guida rapida

## 1. Carica il codice su GitHub

Estrai lo ZIP e carica i file nella root del repository collegato a Railway.
`Dockerfile`, `railway.toml` e `package.json` devono stare in radice.

## 2. Variabili Railway da impostare (obbligatorie)

Nel pannello Railway → il tuo servizio → **Variables**:

| Variabile | Come ottenerla |
|---|---|
| `APP_URL` | L'URL pubblico Railway, es. `https://arpac-xyz.railway.app` |
| `APP_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `CRON_SECRET` | `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` |
| `OWNER_EMAIL` | La tua email |
| `OWNER_PASSWORD` | La tua password |

> **CRON_SECRET è fondamentale**: senza di esso ARPAC non scrive da solo,
> non fa briefing e non manda reminder. È il segreto che permette al loop
> interno di chiamare lo scheduler ogni 30 secondi.

## 3. Un solo servizio Railway (non due)

Con questa versione **non serve un secondo servizio worker**.
Il loop automatico parte dentro lo stesso container del sito.
Vedi i log Railway: cerchi `[scheduler] Loop attivo` per confermare.

## 4. Volume Railway (obbligatorio per persistenza)

Senza volume i dati si perdono ad ogni deploy.

1. Tasto destro sul canvas Railway → **Create Volume**
2. Collegalo al servizio ARPAC
3. Percorso: `/app/data`

Il volume salva: workspace, chiave Gemini, chiave Tavily, embeddings semantici.

## 5. Configura Gemini e Tavily dal sito

Dopo il primo deploy:
1. Accedi con `OWNER_EMAIL` / `OWNER_PASSWORD`
2. Vai su **Impostazioni → AI Provider** → incolla la chiave Gemini → Salva e verifica
3. Vai su **Impostazioni → Ricerca online** → incolla la chiave Tavily → Salva e verifica

Le chiavi vengono cifrate AES-256-GCM e salvate sul volume. Non le devi mettere su Railway.

## 6. Verifica che tutto funzioni

- `/api/health` → deve rispondere `{"status":"ok"}`
- Log Railway → deve comparire `[scheduler] Loop attivo (30s)`
- Alle 08:00 e 20:00 (fuso Roma) ARPAC scrive da solo nelle chat di progetto

## Cosa fa ARPAC automaticamente (ogni 30 secondi controlla, agisce se necessario)

- **08:00** — Briefing mattutino: priorità del giorno, chi fa cosa
- **Ogni ora** — Controlla cambiamenti (task aggiornati, spese, proposte) e interviene
- **Entro un'ora dalla scadenza** — Reminder sul task in scadenza
- **20:00** — Report giornaliero: cosa è stato fatto, blocchi, piano di domani
- **Sempre** — Quando qualcuno scrive, ARPAC risponde, propone task/spese, salva memorie

## Credenziali iniziali di default (se non imposti le variabili)

Email: `owner@arpac.local` — Password: `arpac-local-setup`
Cambia subito le credenziali in produzione.
