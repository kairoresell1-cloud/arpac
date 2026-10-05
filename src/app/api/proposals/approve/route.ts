import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
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

  const esito = await mutateDB((db): "ok" | "non_trovata" | "gia_decisa" => {
    const proposta = db.proposte.find((p) => p.id === propostaId);
    if (!proposta) {
      return "non_trovata";
    }
    if (proposta.stato !== "in_attesa") {
      return "gia_decisa";
    }

    proposta.stato = "approvata";
    proposta.decisaIl = new Date().toISOString();
    proposta.decisaDa = membroId;

    // Solo ORA, con approvazione umana esplicita, la proposta diventa un
    // dato reale del sistema.
    const payload = proposta.payload as Record<string, any>;
    switch (proposta.tipo) {
      case "task":
        db.tasks.push({
          id: nanoid(),
          titolo: proposta.titolo,
          descrizione: proposta.descrizione,
          stato: "da_fare",
          assegnatoA: payload.assegnatoA ?? null,
          scadenza: payload.scadenza ?? null,
          progettoId: payload.progettoId ?? null,
          creatoIl: new Date().toISOString(),
          aggiornatoIl: new Date().toISOString()
        });
        break;
      case "progetto":
        db.progetti.push({
          id: nanoid(),
          nome: proposta.titolo,
          descrizione: proposta.descrizione,
          stato: "attivo",
          creatoIl: new Date().toISOString()
        });
        break;
      case "scadenza":
        db.calendario.push({
          id: nanoid(),
          titolo: proposta.titolo,
          data: payload.data ?? new Date().toISOString(),
          note: proposta.descrizione,
          creatoIl: new Date().toISOString()
        });
        break;
      case "finanza":
        db.finanza.push({
          id: nanoid(),
          tipo: payload.tipo === "entrata" ? "entrata" : "uscita",
          importo: Number(payload.importo) || 0,
          descrizione: proposta.descrizione,
          ricorrente: Boolean(payload.ricorrente),
          data: payload.data ?? new Date().toISOString(),
          creatoIl: new Date().toISOString()
        });
        break;
      default:
        // tipo "altro": resta solo come proposta approvata, nessuna
        // scrittura automatica su entità specifiche.
        break;
    }

    return "ok";
  });

  if (esito === "non_trovata") {
    return NextResponse.json({ errore: "Proposta non trovata." }, { status: 404 });
  }
  if (esito === "gia_decisa") {
    return NextResponse.json({ errore: "Proposta già decisa in precedenza." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
