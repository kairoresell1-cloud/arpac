import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { mutateDB, readDB } from "@/lib/store";
import { getActiveMemberId } from "@/lib/session";

export async function GET() {
  const membroId = await getActiveMemberId();
  if (!membroId) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });
  const db = await readDB();
  return NextResponse.json({ tasks: db.tasks });
}

export async function POST(req: NextRequest) {
  const membroId = await getActiveMemberId();
  if (!membroId) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });

  const { titolo, descrizione, assegnatoA, scadenza, progettoId } = await req.json();
  if (!titolo) return NextResponse.json({ errore: "Titolo mancante." }, { status: 400 });

  const nuovo = {
    id: nanoid(),
    titolo: String(titolo),
    descrizione: descrizione ? String(descrizione) : "",
    stato: "da_fare" as const,
    assegnatoA: assegnatoA ?? null,
    scadenza: scadenza ?? null,
    progettoId: progettoId ?? null,
    creatoIl: new Date().toISOString(),
    aggiornatoIl: new Date().toISOString()
  };

  await mutateDB((db) => {
    db.tasks.push(nuovo);
  });

  return NextResponse.json({ ok: true, task: nuovo });
}

export async function PATCH(req: NextRequest) {
  const membroId = await getActiveMemberId();
  if (!membroId) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });

  const { id, stato } = await req.json();
  if (!id || !stato) return NextResponse.json({ errore: "id e stato richiesti." }, { status: 400 });

  const trovato = await mutateDB((db): boolean => {
    const t = db.tasks.find((t) => t.id === id);
    if (!t) return false;
    t.stato = stato;
    t.aggiornatoIl = new Date().toISOString();
    return true;
  });

  if (!trovato) return NextResponse.json({ errore: "Task non trovato." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
