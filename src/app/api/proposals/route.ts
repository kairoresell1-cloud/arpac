import { NextResponse } from "next/server";
import { readDB } from "@/lib/store";
import { getActiveMemberId } from "@/lib/session";

export async function GET() {
  const mittenteId = await getActiveMemberId();
  if (!mittenteId) {
    return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });
  }
  const db = await readDB();
  return NextResponse.json({ proposte: db.proposte.slice().reverse() });
}
