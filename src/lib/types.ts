export type Member = {
  id: string;
  nome: string;
  ruolo: string;
  isOwner: boolean;
  passwordHash: string;
  creatoIl: string;
};

export type Task = {
  id: string;
  titolo: string;
  descrizione: string;
  stato: "da_fare" | "in_corso" | "bloccato" | "fatto";
  assegnatoA: string | null;
  scadenza: string | null;
  progettoId: string | null;
  creatoIl: string;
  aggiornatoIl: string;
};

export type Progetto = {
  id: string;
  nome: string;
  descrizione: string;
  stato: "attivo" | "in_pausa" | "concluso";
  creatoIl: string;
};

export type MovimentoFinanziario = {
  id: string;
  tipo: "entrata" | "uscita";
  importo: number;
  descrizione: string;
  ricorrente: boolean;
  data: string;
  creatoIl: string;
};

export type EventoCalendario = {
  id: string;
  titolo: string;
  data: string;
  note: string | null;
  creatoIl: string;
};

export type Messaggio = {
  id: string;
  canale: "gruppo" | string; // "gruppo" oppure id membro per chat privata con l'AI
  autoreId: string; // id membro, oppure "arpac"
  testo: string;
  timestamp: string;
};

export type Proposta = {
  id: string;
  tipo: "progetto" | "task" | "scadenza" | "finanza" | "altro";
  titolo: string;
  descrizione: string;
  motivazione: string; // il dato specifico che ha generato la proposta
  payload: Record<string, unknown>;
  stato: "in_attesa" | "approvata" | "rifiutata";
  creataIl: string;
  decisaIl: string | null;
  decisaDa: string | null;
};

export type Memoria = {
  id: string;
  contenuto: string;
  fonte: string; // da dove viene il fatto (messaggio id, task id, ecc.)
  creataIl: string;
};

export type DB = {
  members: Member[];
  tasks: Task[];
  progetti: Progetto[];
  finanza: MovimentoFinanziario[];
  calendario: EventoCalendario[];
  messaggi: Messaggio[];
  proposte: Proposta[];
  memorie: Memoria[];
};

export const emptyDB = (): DB => ({
  members: [],
  tasks: [],
  progetti: [],
  finanza: [],
  calendario: [],
  messaggi: [],
  proposte: [],
  memorie: []
});
