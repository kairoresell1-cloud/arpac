# ARPAC

Workspace privato in italiano per un piccolo team: Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL/Realtime/Storage e Gemini esclusivamente lato server. Tema scuro con sidebar destra e logo capra originale.

## Deploy rapido senza SQL

Per il percorso GitHub → Railway leggi **[START-QUI.md](START-QUI.md)**. Le sezioni Supabase qui sotto descrivono l’installazione avanzata e non sono passaggi necessari per il login autonomo. La correzione login è identificata da `/api/health` con `version: "1.0.1"`.

Puoi caricare il progetto su GitHub e collegarlo a Railway lasciando vuote le variabili Supabase. In produzione ARPAC crea automaticamente un archivio vuoto in `data/` e mostra il login owner. Gemini si configura in seguito da `Impostazioni → AI Provider`. Per conservare i dati tra riavvii Railway, monta un volume su `/app/data`. Supabase resta disponibile come opzione avanzata usando `supabase/schema.sql`.

L’archivio autonomo usa `data/workspace.json`, separato dalla demo. Conserva automaticamente un vecchio `data/demo.json` solo quando è marcato come dati reali (`demo: false`). Include account membri creati dall’owner, accessi ai singoli progetti e avatar personalizzabili. Usa un solo processo e una sola replica; solo la ricerca semantica (pgvector) richiede ancora Supabase. Gli allegati (max 10 MB, PNG/JPG/WEBP/PDF/TXT/CSV) sono salvati sul filesystem in `data/attachments/` (permessi 0600, non cifrati — non è lo stesso livello di protezione di Supabase Storage) — monta un volume Railway su `/app/data` per non perderli tra i riavvii. Il worker/scheduler (briefing, report, promemoria, idee spontanee, ricerca online con `TAVILY_API_KEY`) **funziona anche in autonomo**, tramite `lib/local-scheduler.ts`: stesso `/api/cron`, stesso worker separato, ma senza recupero semantico (usa solo i dati recenti/pertinenti per progetto) e senza coda con retry — un ciclo fallito riprova al controllo utile successivo.

## Prova locale immediata

Richiede Node.js **22.18 o superiore** e npm.

```powershell
cd arpac
npm install
npm run dev
```

Apri http://localhost:3000. Senza `NEXT_PUBLIC_SUPABASE_URL`, **solo in sviluppo**, parte una demo interattiva con Owner, Luigi, Jamal e Server Minecraft. I dati sono salvati in `data/demo.json`, escluso da Git. Da Impostazioni puoi ripristinarli. La demo non invia email, non chiama Gemini, non salva chiavi e non carica file: l’interfaccia lo dichiara. Task, proposte, approvazioni, messaggi, calendario e memorie sono modificabili e persistono ai riavvii. Non usare la demo per dati riservati: non ha login. La modalità produzione non abilita mai questa scorciatoia.

Per ottenere un ambiente vuoto, imposta Supabase prima di avviare Next: quando `NEXT_PUBLIC_SUPABASE_URL` è presente, ARPAC non carica alcun seed. Le migrazioni creano solo struttura e l’owner creato da `npm run bootstrap`; nessun progetto, messaggio, task o finanza demo viene inserito.

Percorso creato in questa sessione:
`C:\Users\luigi\Documents\Codex\2026-09-10\files-pasted-by-the-user-crea\arpac`

Se npm non è presente nel PATH di questa macchina, il runtime della sessione permette anche:

```powershell
node ..\work\node_modules\npm\bin\npm-cli.js run dev
```

Il pacchetto ZIP del progetto non contiene quel runtime: per una copia autonoma installa Node.js con npm.

## Configura Supabase

1. Crea un progetto Supabase dedicato a questo team. ARPAC usa **un solo team per istanza**.
2. Nel SQL Editor incolla una sola volta il file `supabase/schema.sql` e premi Run. È il database completo già unito.
3. In Authentication disabilita le registrazioni pubbliche. Configura SMTP per inviti affidabili.
4. Imposta Site URL a `http://localhost:3000` e aggiungi `http://localhost:3000/auth/accept` ai redirect autorizzati. Aggiungi gli equivalenti Railway prima del deploy.
5. Verifica che la pubblicazione `supabase_realtime` includa `records`. La migrazione lo imposta. La UI ha anche un aggiornamento di recupero ogni 15 secondi.
6. Copia `.env.example` in `.env.local` e inserisci URL progetto, chiave pubblica anon e chiave segreta service role.

Le entità richieste sono vere tabelle PostgreSQL, partizioni della tabella `records` per tipo (`projects`, `conversations`, `messages`, `tasks`, `memories`, ecc.). L’app interroga il parent tramite il client tipizzato in `lib/database.ts`. Le partizioni non sono leggibili direttamente dai ruoli pubblici; RLS filtra il parent. `profiles`, `team_memberships`, `project_members`, `ai_jobs` e `ai_provider_settings` sono tabelle dedicate. Le scritture passano dalle route autorizzate; non sono consentite dal browser direttamente.

La chiave service role bypassa RLS: è importata solo in moduli server. Le letture dell’interfaccia usano il client della sessione utente con RLS. Owner e admin **non leggono le chat private di altri membri**. Le finanze sono visibili a tutto il team, come richiesto. HQ non diffonde il contenuto di progetti riservati a un sottoinsieme di membri.

## Variabili d’ambiente

| Variabile                       | Uso                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL del progetto, pubblico                                                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chiave pubblica Supabase; la protezione è RLS                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Segreto Supabase, solo server                                                      |
| `APP_URL`                       | URL canonico dell’app, senza slash finale                                          |
| `APP_ENCRYPTION_KEY`            | 32 byte casuali, codificati base64, solo server                                    |
| `GEMINI_MODEL`                  | Default `gemini-2.5-flash`                                                         |
| `GEMINI_EMBEDDING_MODEL`        | Default `gemini-embedding-001`                                                     |
| `GEMINI_API_KEY`                | Fallback opzionale server; puoi lasciarla vuota e usare Impostazioni → AI Provider |
| `CRON_SECRET`                   | Segreto condiviso tra web e worker                                                 |
| `TAVILY_API_KEY`                | Ricerca web opzionale con fonti                                                    |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | Usati una sola volta dal bootstrap                                                 |

Genera due valori indipendenti per cifratura e scheduler:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Conserva `APP_ENCRYPTION_KEY` in un password manager e nella configurazione segreta di Railway. Non ruotarla senza prima rimuovere o ricifrare la chiave salvata: il testo cifrato precedente diventa illeggibile. Non aggiungere mai segreti a variabili `NEXT_PUBLIC_*`.

## Primo owner e membri

Con le migrazioni applicate, imposta temporaneamente `OWNER_EMAIL` e `OWNER_PASSWORD` in `.env.local` (almeno 12 caratteri), quindi:

```powershell
npm run bootstrap
```

Lo script rifiuta di creare un secondo owner. Rimuovi `OWNER_PASSWORD` dal file dopo l’operazione. Accedi e completa il profilo. Da Team, l’owner invita membri tramite email; il link consente di impostare una password. I nuovi membri vedono HQ e le finanze. Aggiungili ai progetti attraverso Progetti → progetto → Accessi. Alla creazione di un nuovo progetto approvato vengono inclusi i membri attualmente presenti.

Ruoli: owner approva progetti, task, scadenze, spese e ruoli; admin può revisionare task e correggere memorie; membro può proporre e aggiornare i propri task; viewer legge soltanto. Le modifiche sensibili del profilo dopo l’onboarding generano una richiesta all’owner.

## Gemini dentro il sito

1. Crea una API key in [Google AI Studio](https://aistudio.google.com/apikey), con accesso ai modelli configurati.
2. Apri Impostazioni → AI Provider come owner.
3. Inserisci modello e chiave, seleziona Salva e verifica e conferma.
4. La verifica fa una piccola richiesta reale, potenzialmente soggetta alla quota del tuo account. Solo se riesce viene sostituita la configurazione precedente.

La chiave viene cifrata con AES-256-GCM, nonce casuale e tag di autenticazione. Dopo il salvataggio tornano al browser soltanto stato, modello e ultime quattro cifre. Aggiunta, sostituzione, verifica e rimozione sono registrate senza segreti. Non serve inserire `GEMINI_API_KEY` in Railway: usa il campo del sito. Nessun pagamento è implementato.

La quota residua non è disponibile dal provider tramite questa integrazione: la UI lo indica, mostrando chiamate generative, token riportati dal provider ed errori registrati. Non sono conteggiati qui i token degli embedding e della verifica chiave: controlla AI Studio per la contabilità completa.

## Worker e automazioni

Funziona in entrambe le modalità: con Supabase usa la coda PostgreSQL (vedi sotto); in autonomo usa `lib/local-scheduler.ts`, sincrono e senza coda. In entrambi i casi il worker richiama lo stesso `/api/cron` ogni 30 secondi.

Il server HTTP accoda i messaggi; non aspetta Gemini. In un **secondo terminale**, con il server acceso:

```powershell
node --env-file=.env.local --import tsx scripts/worker.ts
```

In Railway crea un secondo servizio dallo stesso repository, scegli `railway.worker.toml` come file di configurazione. Il worker ha bisogno solo di `APP_URL` e `CRON_SECRET` e può usare il dominio HTTPS pubblico del servizio web. `Dockerfile.worker` avvia un processo Node indipendente. Non usare soltanto un timer nel processo web: il worker separato rende esplicita la responsabilità dei job.

Il worker richiama `/api/cron` ogni 30 secondi. La route è protetta da un confronto a tempo costante del segreto, elabora al massimo tre job per richiesta e accoda analisi orarie. PostgreSQL assegna i job con `FOR UPDATE SKIP LOCKED`, recupera lock scaduti, deduplica controlli e promemoria. Le risposte, proposte e memorie AI sono salvate in una transazione. Il retry usa backoff esponenziale; dopo cinque tentativi passa a failed e l’owner può riprovare da Impostazioni. Chat e dati restano disponibili senza quota.

Orari Europe/Rome: briefing alle 08, report alle 20, cambiamenti rilevanti ogni ora e promemoria per task nell’ora successiva. Il report include avanzamenti, blocchi, risultati e piano di domani. Il worker deve restare attivo: se è spento, non vengono recuperati automaticamente tutti i briefing storici saltati. ARPAC può rispondere `SILENZIO` per evitare messaggi inutili.

## Memoria, ricerca e file

Non viene inviata l’intera cronologia a Gemini. Ogni risposta include al massimo 16 messaggi/allegati recenti, 45 record pertinenti e 6 ricordi semantici. I messaggi completi restano nel database; la chat carica la cronologia precedente su richiesta. Gli eventi rilevanti producono memorie strutturate per team, progetto o chat privata, con collegamenti ai messaggi sorgente. Le decisioni approvate sono registrate dal database. Le memorie estratte dall’AI restano correggibili e riportano la provenienza.

Embedding pgvector a 768 dimensioni, senza cambiare modello a parità di indice: per cambiare modello occorre reindicizzare. Correggere una memoria elimina il vecchio embedding e ne accoda uno nuovo. Memorie archiviate, obsolete o eliminate sono escluse dal recupero. Le memorie persistono anche se un progetto non è più attivo.

Ricerca online da Memoria → Ricerca online: usa Tavily, salva risultati e URL reali. ARPAC può anche richiedere una ricerca spontanea nelle chat condivise, con limite applicativo di una ricerca recente per contesto nelle 24 ore. Senza chiave mostra un messaggio esplicito. Il contenuto esterno è trattato come non fidato. I link nei messaggi possono essere condivisi come testo; ARPAC non apre arbitrariamente URL privati.

Storage privato: PNG, JPG, WEBP, PDF, TXT e CSV fino a 10 MB, scaricabili con URL firmati da 60 secondi dopo controllo degli accessi. I testi sono indicizzati; fino a due immagini/PDF recenti da massimo 5 MB vengono passati a Gemini come input multimodale. Per video pesanti usa link; non è incluso un transcoder video. Non è incluso un estrattore OCR separato per indicizzare semanticamente ogni pagina di PDF: Gemini può analizzare i file recenti, mentre la ricerca semantica usa il testo disponibile.

## Test

Per verificare il login autonomo: `npm run build` seguito da `npm run test:production`. Il test avvia un server di produzione su una porta libera con credenziali fittizie e un archivio separato. Controlla login/logout, sessioni false, profilo, approvazioni, canali, messaggi, persistenza al riavvio, dominio Railway ed errori del disco. Non usa il tuo sito online e non modifica `data/`.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

I test includono AES-GCM, manomissione, permessi, transizioni task e un vero PostgreSQL embedded PGlite con pgvector. Quest’ultimo applica le migrazioni con uno schema Auth/Storage minimo che simula quello di Supabase e verifica RLS, isolamento delle partizioni, approvazioni atomiche, coda e rate limit. Non sostituisce un collaudo del tuo progetto Supabase.

Con demo in esecuzione:

```powershell
npm run test:http
```

**Questo test ripristina i dati demo.** Non eseguirlo su dati demo da conservare. Rifiuta una risposta che non dichiara modalità demo.

CI GitHub: installazione pulita, lint, typecheck, test e build. Nessun segreto richiesto per questi controlli.

## GitHub

Crea un repository **privato** vuoto, poi dalla cartella `arpac`:

```powershell
git init
git add .
git commit -m "Implementa ARPAC"
git branch -M main
git remote add origin https://github.com/TUO-ACCOUNT/arpac.git
git push -u origin main
```

Sostituisci `TUO-ACCOUNT`. `.gitignore` esclude `.env*`, `data`, dipendenze e build. Non inserire token nel remote. Usa l’autenticazione GitHub del tuo computer. Se includi ARPAC in un repository più grande, imposta `arpac` come root directory su Railway.

### Procedura esatta per caricare solo il progetto

1. Scarica `arpac.zip` e decomprimilo in una cartella locale chiamata `arpac`.
2. Apri PowerShell dentro quella cartella. Non copiare `.env.local`, `data`, `node_modules` o `.next`: sono esclusi e non servono su GitHub.
3. Esegui `git init`, `git add .`, `git commit -m "Implementa ARPAC"`, `git branch -M main`.
4. Su GitHub crea un repository privato vuoto chiamato `arpac`, senza README, licenza o `.gitignore` aggiuntivi.
5. Esegui `git remote add origin https://github.com/TUO-ACCOUNT/arpac.git` e `git push -u origin main`.
6. Controlla nella pagina GitHub che compaiano `app`, `components`, `lib`, `supabase`, `scripts`, `Dockerfile`, `railway.toml`, `.env.example` e `README.md`. Se compare un file `.env.local` o una cartella `data`, fermati e rimuovili prima di renderlo privato online.

Il repository contiene codice e migrazioni, non un database già popolato. Il database da usare è Supabase PostgreSQL: crea un progetto nuovo, esegui le migrazioni numerate nel SQL Editor e poi avvia `npm run bootstrap` una sola volta. Su Railway inserisci i valori dell’ambiente nei Variables, mai in GitHub. Railway rileva il Dockerfile nella directory radice del servizio; se `arpac` è dentro un repository più grande, configura Root Directory su `arpac` o `RAILWAY_DOCKERFILE_PATH` sul percorso corretto. [Railway usa automaticamente il Dockerfile trovato nella directory sorgente](https://docs.railway.com/builds/dockerfiles) e le variabili si inseriscono nella sezione Variables del servizio ([guida Railway](https://docs.railway.com/variables)).

## Deploy Railway

- [ ] Repository privato collegato a Railway, root corretta.
- [ ] Servizio web con `railway.toml` / `Dockerfile`.
- [ ] Variabili Supabase, `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `APP_URL` configurate.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` disponibili **anche durante la build** come Docker build args. Sono pubbliche; le chiavi segrete sono solo runtime.
- [ ] Migrazioni applicate, registrazioni pubbliche disabilitate, SMTP configurato.
- [ ] Dominio Railway HTTPS impostato in `APP_URL` e nei redirect Supabase (`/auth/accept`).
- [ ] Bootstrap owner eseguito una sola volta.
- [ ] Servizio worker con `railway.worker.toml`, stesso `CRON_SECRET`, `APP_URL` del web.
- [ ] Owner accede, configura e verifica la chiave Gemini dal sito.
- [ ] Invito di prova, conversazione privata, upload/scaricamento file, proposta approvata e prima risposta del worker verificati.
- [ ] Backup Supabase e conservazione sicura di `APP_ENCRYPTION_KEY` predisposti.

`Dockerfile` produce Next standalone ed esegue come utente non root. Healthcheck: `/api/health`. Per prova della build fuori da Docker: `npm run build` seguito da `npm start`.

## Struttura Discord delle conversazioni

La pagina Conversazioni ora usa un albero tipo Discord:

```text
HQ · TEAM
  # Generale
SERVER MINECRAFT
  # Generale
  # Decisioni
  # Operatività
  + Nuovo canale
CHAT PRIVATE
  🔒 Script con ARPAC
```

Un progetto è una categoria. I canali condivisi (`Generale`, `Decisioni`, `Operatività`) sono conversazioni con accesso filtrato dagli stessi membri del progetto. Il pulsante `+` accanto al progetto crea altri canali testuali, ad esempio `marketing`, `contenuti` o `lancio`. Le chat private sono record distinti con `owner_id` e restano leggibili soltanto dal membro e da ARPAC; non vengono mostrate nella categoria condivisa e non vengono usate per briefing HQ. Per la coerenza dei dati, il canale principale viene creato insieme al progetto quando l’owner approva la proposta, mentre gli altri due canali standard vengono creati nello stesso momento.

## Confini della verifica di questa consegna

La correzione 1.0.1 è stata verificata con build di produzione, TypeScript, lint, test unitari/SQL e test HTTP del login autonomo. Nel browser sono stati verificati accesso, HQ, Impostazioni e salvataggio del profilo su un archivio locale isolato. Il nuovo pacchetto non è stato pubblicato automaticamente su GitHub o Railway. Le credenziali iniziali sono pubbliche e sostituibili con valori personali. Email, Realtime, Storage remoto, chiamate Gemini e Tavily richiedono collaudo con i servizi reali. Docker non è disponibile nell’ambiente di verifica: il container e il volume Railway restano da collaudare online.

Il modulo per proporre task espone anche un piccolo hook WebMCP opzionale nei browser compatibili. Non crea né approva dati automaticamente. Il relativo contratto browser non è stato verificato in un contesto WebMCP; l’interfaccia ordinaria funziona indipendentemente da questo hook.

Riferimenti: [Next.js](https://nextjs.org/docs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [inviti Supabase](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [Gemini embeddings](https://ai.google.dev/api/embeddings).
