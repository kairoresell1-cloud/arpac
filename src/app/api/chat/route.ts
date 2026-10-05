import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { mutateDB, readDB } from "@/lib/store";
import { getActiveMemberId } from "@/lib/session";
import { eseguiArpac } from "@/lib/ai-session";

export async function GET(req: NextRequest) {
  const mittenteId = await getActiveMemberId();
  if (!mittenteId) {
    return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });
  }
  const canale = req.nextUrl.searchParams.get("canale") || "gruppo";
  const canaleFinale = canale === "gruppo" ? "gruppo" : mittenteId;

  const db = await readDB();
  const messaggi = db.messaggi.filter((m) => m.canale === canaleFinale).slice(-100);
  return NextResponse.json({ messaggi });
}

export async function POST(req: NextRequest) {
  const mittenteId = await getActiveMemberId();
  if (!mittenteId) {
    return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });
  }

  const { testo, canale } = await req.json();
  if (!testo || typeof testo !== "string") {
    return NextResponse.json({ errore: "Testo del messaggio mancante." }, { status: 400 });
  }
  // canale "gruppo" per la chat di gruppo, altrimenti id del membro per la
  // chat privata 1:1 con ARPAC.
  const canaleFinale = canale === "gruppo" ? "gruppo" : mittenteId;

  // Salva subito il messaggio dell'utente (lock breve, no rete).
  await mutateDB((db) => {
    db.messaggi.push({
      id: nanoid(),
      canale: canaleFinale,
      autoreId: mittenteId,
      testo,
      timestamp: new Date().toISOString()
    });
  });

  const risultato = await eseguiArpac({
    modalita: "diretto",
    mittenteId,
    testoMessaggio: testo,
    canale: canaleFinale
  });

  return NextResponse.json(risultato);
}
