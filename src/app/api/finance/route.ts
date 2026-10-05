import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { mutateDB, readDB } from "@/lib/store";
import { getActiveMemberId } from "@/lib/session";

export async function GET() {
  const membroId = await getActiveMemberId();
  if (!membroId) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });
  const db = await readDB();
  return NextResponse.json({ finanza: db.finanza });
}

export async function POST(req: NextRequest) {
  const membroId = await getActiveMemberId();
  if (!membroId) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });

  const { tipo, importo, descrizione, ricorrente, data } = await req.json();
  if (!tipo || !importo) return NextResponse.json({ errore: "tipo e importo richiesti." }, { status: 400 });

  const nuovo = {
    id: nanoid(),
    tipo: tipo === "entrata" ? ("entrata" as const) : ("uscita" as const),
    importo: Number(importo),
    descrizione: descrizione ? String(descrizione) : "",
    ricorrente: Boolean(ricorrente),
    data: data ?? new Date().toISOString(),
    creatoIl: new Date().toISOString()
  };

  await mutateDB((db) => {
    db.finanza.push(nuovo);
  });

  return NextResponse.json({ ok: true, movimento: nuovo });
}
