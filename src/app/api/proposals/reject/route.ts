import { NextRequest, NextResponse } from "next/server";
import { mutateDB } from "@/lib/store";
import { getActiveMemberId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const membroId = await getActiveMemberId();
  if (!membroId) {
    return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });
  }
  const { propostaId } = await req.json();
  if (!propostaId) {
    return NextResponse.json({ errore: "propostaId mancante." }, { status: 400 });
  }

  const trovata = await mutateDB((db): boolean => {
    const proposta = db.proposte.find((p) => p.id === propostaId && p.stato === "in_attesa");
    if (!proposta) return false;
    proposta.stato = "rifiutata";
    proposta.decisaIl = new Date().toISOString();
    proposta.decisaDa = membroId;
    return true;
  });

  if (!trovata) {
    return NextResponse.json({ errore: "Proposta non trovata o già decisa." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
