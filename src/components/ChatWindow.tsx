"use client";

import { useEffect, useRef, useState } from "react";

type Membro = { id: string; nome: string; ruolo: string; isOwner: boolean };
type Messaggio = { id: string; canale: string; autoreId: string; testo: string; timestamp: string };

export default function ChatWindow({
  canale,
  io,
  membri,
  onProposteCambiate
}: {
  canale: string;
  io: Membro;
  membri: Membro[];
  onProposteCambiate: () => void;
}) {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [bozza, setBozza] = useState("");
  const [invio, setInvio] = useState(false);
  const fineRef = useRef<HTMLDivElement>(null);

  async function carica() {
    const res = await fetch(`/api/chat?canale=${canale === io.id ? "privato" : "gruppo"}`);
    if (res.ok) {
      const data = await res.json();
      setMessaggi(data.messaggi);
    }
  }

  useEffect(() => {
    carica();
    const interval = setInterval(carica, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canale]);

  useEffect(() => {
    fineRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messaggi]);

  function nomeAutore(autoreId: string) {
    if (autoreId === "arpac") return "ARPAC";
    return membri.find((m) => m.id === autoreId)?.nome || "???";
  }

  async function invia() {
    if (!bozza.trim() || invio) return;
    const testo = bozza;
    setBozza("");
    setInvio(true);
    setMessaggi((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, canale, autoreId: io.id, testo, timestamp: new Date().toISOString() }
    ]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testo, canale: canale === "gruppo" ? "gruppo" : "privato" })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.propostaIds?.length) onProposteCambiate();
        await carica();
      }
    } finally {
      setInvio(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col glass rounded-token-lg m-3 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] text-sm text-ink-500">
        {canale === "gruppo" ? "# gruppo" : "Chat privata con ARPAC"}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messaggi.length === 0 && (
          <div className="text-ink-700 text-sm text-center mt-10">Nessun messaggio ancora. Scrivi qualcosa ad ARPAC.</div>
        )}
        {messaggi.map((m) => {
          const mio = m.autoreId === io.id;
          const ai = m.autoreId === "arpac";
          return (
            <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-token-sm px-3.5 py-2.5 text-sm leading-relaxed ${
                  mio
                    ? "bg-accent text-base-950"
                    : ai
                    ? "bg-accent-dim/40 border border-accent-dim text-ink-100"
                    : "bg-white/[0.06] text-ink-100"
                }`}
              >
                {!mio && <div className="text-xs opacity-60 mb-0.5">{nomeAutore(m.autoreId)}</div>}
                <div className="whitespace-pre-wrap">{m.testo}</div>
              </div>
            </div>
          );
        })}
        <div ref={fineRef} />
      </div>

      <div className="p-3 border-t border-white/[0.06] flex gap-2">
        <input
          className="input-field flex-1"
          placeholder="Scrivi un messaggio..."
          value={bozza}
          onChange={(e) => setBozza(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              invia();
            }
          }}
        />
        <button className="btn-primary" onClick={invia} disabled={invio || !bozza.trim()}>
          Invia
        </button>
      </div>
    </div>
  );
}
