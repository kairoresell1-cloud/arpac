import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { mutateDB, readDB } from "@/lib/store";
import { createSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { nome, ruolo, password } = await req.json();
  if (!nome || !password) {
    return NextResponse.json({ errore: "Nome e password richiesti." }, { status: 400 });
  }

  const dbAttuale = await readDB();
  if (dbAttuale.members.length >= 5) {
    return NextResponse.json({ errore: "Il team ha già raggiunto il massimo di 5 membri." }, { status: 400 });
  }
  if (dbAttuale.members.some((m) => m.nome.toLowerCase() === String(nome).toLowerCase())) {
    return NextResponse.json({ errore: "Esiste già un membro con questo nome." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const nuovoMembro = {
    id: nanoid(),
    nome: String(nome),
    ruolo: ruolo ? String(ruolo) : "Membro",
    isOwner: dbAttuale.members.length === 0, // il primo utente registrato è owner
    passwordHash,
    creatoIl: new Date().toISOString()
  };

  await mutateDB((db) => {
    db.members.push(nuovoMembro);
  });

  // Risolve la sessione per QUESTA richiesta: ogni onboarding crea e
  // autentica solo il membro appena creato, mai sovrascrivendo sessioni
  // di altri utenti che stanno onboardando in parallelo.
  await createSessionCookie(nuovoMembro.id);

  return NextResponse.json({
    ok: true,
    membro: { id: nuovoMembro.id, nome: nuovoMembro.nome, ruolo: nuovoMembro.ruolo, isOwner: nuovoMembro.isOwner }
  });
}
