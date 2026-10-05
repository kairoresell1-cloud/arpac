-- Schema opzionale per la modalità Supabase (multi-utente reale).
-- Non necessario per la modalità file-locale di default.
-- Specchia la struttura di src/lib/types.ts.

create table if not exists members (
  id text primary key,
  nome text not null,
  ruolo text not null,
  is_owner boolean not null default false,
  password_hash text not null,
  creato_il timestamptz not null default now()
);

create table if not exists tasks (
  id text primary key,
  titolo text not null,
  descrizione text not null default '',
  stato text not null default 'da_fare',
  assegnato_a text references members(id),
  scadenza timestamptz,
  progetto_id text,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

create table if not exists progetti (
  id text primary key,
  nome text not null,
  descrizione text not null default '',
  stato text not null default 'attivo',
  creato_il timestamptz not null default now()
);

create table if not exists finanza (
  id text primary key,
  tipo text not null,
  importo numeric not null,
  descrizione text not null default '',
  ricorrente boolean not null default false,
  data timestamptz not null default now(),
  creato_il timestamptz not null default now()
);

create table if not exists calendario (
  id text primary key,
  titolo text not null,
  data timestamptz not null,
  note text,
  creato_il timestamptz not null default now()
);

create table if not exists messaggi (
  id text primary key,
  canale text not null,
  autore_id text not null,
  testo text not null,
  timestamp timestamptz not null default now()
);

create table if not exists proposte (
  id text primary key,
  tipo text not null,
  titolo text not null,
  descrizione text not null default '',
  motivazione text not null default '',
  payload jsonb not null default '{}',
  stato text not null default 'in_attesa',
  creata_il timestamptz not null default now(),
  decisa_il timestamptz,
  decisa_da text references members(id)
);

create table if not exists memorie (
  id text primary key,
  contenuto text not null,
  fonte text not null default '',
  creata_il timestamptz not null default now()
);

create index if not exists idx_messaggi_canale on messaggi (canale, timestamp);
create index if not exists idx_tasks_stato on tasks (stato);
create index if not exists idx_proposte_stato on proposte (stato);
