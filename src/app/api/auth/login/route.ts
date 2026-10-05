import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { readDB } from "@/lib/store";
import { createSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { nome, password } = await req.json();
  if (!nome || !password) {
    return NextResponse.json({ errore: "Nome e password richiesti." }, { status: 400 });
  }

  const db = await readDB();
  const membro = db.members.find((m) => m.nome.toLowerCase() === String(nome).toLowerCase());
  if (!membro) {
    return NextResponse.json({ errore: "Credenziali non valide." }, { status: 401 });
  }

  const valida = await bcrypt.compare(password, membro.passwordHash);
  if (!valida) {
    return NextResponse.json({ errore: "Credenziali non valide." }, { status: 401 });
  }

  await createSessionCookie(membro.id);
  return NextResponse.json({ ok: true, membro: { id: membro.id, nome: membro.nome, ruolo: membro.ruolo, isOwner: membro.isOwner } });
}
