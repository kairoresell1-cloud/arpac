import { NextResponse } from "next/server";
import { getActiveMemberId } from "@/lib/session";
import { eseguiArpac } from "@/lib/ai-session";

// Endpoint di debug: forza un controllo automatico subito, senza aspettare
// il prossimo tick dello scheduler in background. Utile in sviluppo.
export async function POST() {
  const membroId = await getActiveMemberId();
  if (!membroId) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });

  const risultato = await eseguiArpac({
    modalita: "automatico",
    motivoControllo: "Controllo manuale richiesto da un membro del team per debug/test."
  });

  return NextResponse.json(risultato);
}
