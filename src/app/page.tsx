"use client";

import { useEffect, useState } from "react";
import AuthScreen from "@/components/AuthScreen";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import ProposalsPanel from "@/components/ProposalsPanel";

type Membro = { id: string; nome: string; ruolo: string; isOwner: boolean };

export default function Home() {
  const [caricamento, setCaricamento] = useState(true);
  const [io, setIo] = useState<Membro | null>(null);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [canaleAttivo, setCanaleAttivo] = useState("gruppo");
  const [pannelloProposteAperto, setPannelloProposteAperto] = useState(false);
  const [numeroProposte, setNumeroProposte] = useState(0);
  const [aggiornaProposte, setAggiornaProposte] = useState(0);

  async function caricaStato() {
    const res = await fetch("/api/members");
    const data = await res.json();
    setMembri(data.membri || []);
    setIo(data.io || null);
    setCaricamento(false);
  }

  async function caricaNumeroProposte() {
    const res = await fetch("/api/proposals");
    if (res.ok) {
      const data = await res.json();
      setNumeroProposte(data.proposte.filter((p: any) => p.stato === "in_attesa").length);
    }
  }

  useEffect(() => {
    caricaStato();
  }, []);

  useEffect(() => {
    if (!io) return;
    caricaNumeroProposte();
    const interval = setInterval(caricaNumeroProposte, 15000);
    return () => clearInterval(interval);
  }, [io, aggiornaProposte]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setIo(null);
  }

  if (caricamento) {
    return <div className="min-h-screen flex items-center justify-center text-ink-700 text-sm">Caricamento...</div>;
  }

  if (!io) {
    return <AuthScreen onAutenticato={caricaStato} />;
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar
        membri={membri}
        io={io}
        canaleAttivo={canaleAttivo}
        onCambiaCanale={setCanaleAttivo}
        numeroProposte={numeroProposte}
        pannelloProposteAperto={pannelloProposteAperto}
        onTogglePannelloProposte={() => setPannelloProposteAperto((v) => !v)}
        onLogout={logout}
      />
      <ChatWindow
        canale={canaleAttivo}
        io={io}
        membri={membri}
        onProposteCambiate={() => setAggiornaProposte((v) => v + 1)}
      />
      {pannelloProposteAperto && (
        <ProposalsPanel onChiudi={() => setPannelloProposteAperto(false)} aggiorna={aggiornaProposte} />
      )}
    </div>
  );
}
