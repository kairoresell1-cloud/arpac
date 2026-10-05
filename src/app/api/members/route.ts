import { NextResponse } from "next/server";
import { readDB } from "@/lib/store";
import { getActiveMemberId } from "@/lib/session";

export async function GET() {
  const membroId = await getActiveMemberId();
  const db = await readDB();
  const membri = db.members.map((m) => ({ id: m.id, nome: m.nome, ruolo: m.ruolo, isOwner: m.isOwner }));
  const io = membri.find((m) => m.id === membroId) ?? null;
  return NextResponse.json({ membri, io });
}
