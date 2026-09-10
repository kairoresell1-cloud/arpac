# ARPAC su Railway

1. Estrai lo ZIP e carica **i file e le cartelle contenuti**, direttamente nel repository GitHub collegato a Railway. Non caricare lo ZIP stesso. `Dockerfile`, `railway.toml` e `package.json` devono essere alla radice.
2. Attendi che Railway completi il nuovo deploy. La versione corretta risponde con `version: "1.0.1"` all’indirizzo `/api/health`.
3. Apri il sito e accedi. Senza credenziali personalizzate, l’accesso iniziale è `owner@arpac.local` / `arpac-local-setup`. Se hai già impostato `OWNER_EMAIL` e `OWNER_PASSWORD` su Railway, valgono quei valori.

Il codice crea l’archivio vuoto e le chiavi interne automaticamente. Non devi eseguire SQL, bootstrap o comandi locali. Lascia le variabili Supabase assenti per usare questa modalità. Gemini si inserisce nel sito: **Impostazioni → AI Provider → Salva e verifica**.

Per conservare dati e chiave Gemini quando il container viene sostituito, serve un volume Railway montato su `/app/data`: tasto destro sul canvas del progetto → crea volume → collegalo al servizio ARPAC → percorso `/app/data`. Il codice prepara i permessi del volume all’avvio. Questo collegamento si fa una volta; non può essere creato dal solo caricamento del codice GitHub. [Documentazione Railway](https://docs.railway.com/volumes).

Le credenziali iniziali sono pubbliche nel codice: prima di inserire dati privati imposta valori personali in `OWNER_EMAIL` e `OWNER_PASSWORD`. Questa versione mantiene l’accesso owner della precedente consegna; non crea un nuovo account con un’email qualsiasi.

La modalità autonoma include un owner, profilo, progetti con canali, messaggi, task, approvazioni, calendario, finanze, memorie manuali e configurazione Gemini. Inviti ad altri account, file allegati, ricerca semantica e worker dei briefing richiedono ancora la modalità Supabase descritta nel README. Questa correzione non completa quelle integrazioni nella modalità autonoma.

Lo ZIP non contiene dati, chiavi, password personali, dipendenze o build. I dati reali della versione precedente vengono mantenuti se presenti sul volume; la demo resta separata.
