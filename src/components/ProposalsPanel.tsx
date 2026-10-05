"use client";

import { useEffect, useState } from "react";

type Proposta = {
  id: string;
  tipo: string;
  titolo: string;
  descrizione: string;
  motivazione: string;
  stato: "in_attesa" | "approvata" | "rifiutata";
  creataIl: string;
};

export default function ProposalsPanel({ onChiudi, aggiorna }: { onChiudi: () => void; aggiorna: number }) {
  const [proposte, setProposte] = useState<Proposta[]>([]);
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null);

  async function carica() {
    const res = await fetch("/api/proposals");
    if (res.ok) {
      const data = await res.json();
      setProposte(data.proposte);
    }
  }

  useEffect(() => {
    carica();
  }, [aggiorna]);

  async function decidi(id: string, azione: "approve" | "reject") {
    setAzioneInCorso(id);
    try {
      await fetch(`/api/proposals/${azione}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propostaId: id })
      });
      await carica();
    } finally {
      setAzioneInCorso(null);
    }
  }

  const pendenti = proposte.filter((p) => p.stato === "in_attesa");
  const decise = proposte.filter((p) => p.stato !== "in_attesa").slice(0, 10);

  return (
    <div className="w-80 shrink-0 glass rounded-token-lg m-3 ml-0 flex flex-col overflow-hidden">
      <div className="px-4 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="text-sm font-medium">Proposte</div>
        <button onClick={onChiudi} className="text-ink-500 hover:text-ink-100 text-sm">
          Chiudi
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {pendenti.length === 0 && <div className="text-ink-700 text-sm px-1">Nessuna proposta in attesa.</div>}
        {pendenti.map((p) => (
          <div key={p.id} className="glass rounded-token-sm p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-accent-soft">{p.tipo}</span>
            </div>
            <div className="text-sm font-medium text-ink-100">{p.titolo}</div>
            <div className="text-xs text-ink-500">{p.descrizione}</div>
            <div className="text-xs text-ink-700 italic">{p.motivazione}</div>
            <div className="flex gap-2 pt-1">
              <button
                className="btn-primary flex-1 !py-1.5 text-xs"
                onClick={() => decidi(p.id, "approve")}
                disabled={azioneInCorso === p.id}
              >
                Approva
              </button>
              <button
                className="btn-ghost flex-1 !py-1.5 text-xs"
                onClick={() => decidi(p.id, "reject")}
                disabled={azioneInCorso === p.id}
              >
                Rifiuta
              </button>
            </div>
          </div>
        ))}

        {decise.length > 0 && (
          <>
            <div className="text-xs uppercase tracking-wide text-ink-700 pt-3 px-1">Decise di recente</div>
            {decise.map((p) => (
              <div key={p.id} className="px-2 py-1.5 text-xs text-ink-500 flex items-center justify-between">
                <span className="truncate">{p.titolo}</span>
                <span className={p.stato === "approvata" ? "text-signal-ok" : "text-signal-risk"}>
                  {p.stato === "approvata" ? "approvata" : "rifiutata"}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
