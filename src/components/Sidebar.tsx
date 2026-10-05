"use client";

type Membro = { id: string; nome: string; ruolo: string; isOwner: boolean };

export default function Sidebar({
  membri,
  io,
  canaleAttivo,
  onCambiaCanale,
  numeroProposte,
  pannelloProposteAperto,
  onTogglePannelloProposte,
  onLogout
}: {
  membri: Membro[];
  io: Membro | null;
  canaleAttivo: string;
  onCambiaCanale: (canale: string) => void;
  numeroProposte: number;
  pannelloProposteAperto: boolean;
  onTogglePannelloProposte: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className="w-64 shrink-0 glass flex flex-col rounded-token-lg m-3 mr-0">
      <div className="p-4 border-b border-white/[0.06]">
        <div className="text-lg font-semibold tracking-tight">ARPAC</div>
        {io && <div className="text-xs text-ink-500 mt-0.5">{io.nome} · {io.ruolo}</div>}
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 pt-2 pb-1 text-xs uppercase tracking-wide text-ink-700">Canali</div>
        <button
          onClick={() => onCambiaCanale("gruppo")}
          className={`w-full text-left px-3 py-2 rounded-token-sm text-sm transition-colors ${
            canaleAttivo === "gruppo" ? "bg-white/[0.08] text-ink-100" : "text-ink-300 hover:bg-white/[0.04]"
          }`}
        >
          # gruppo
        </button>

        <div className="px-2 pt-4 pb-1 text-xs uppercase tracking-wide text-ink-700">Chat privata con ARPAC</div>
        {io && (
          <button
            onClick={() => onCambiaCanale(io.id)}
            className={`w-full text-left px-3 py-2 rounded-token-sm text-sm transition-colors ${
              canaleAttivo === io.id ? "bg-white/[0.08] text-ink-100" : "text-ink-300 hover:bg-white/[0.04]"
            }`}
          >
            Solo per te
          </button>
        )}

        <div className="px-2 pt-4 pb-1 text-xs uppercase tracking-wide text-ink-700">Team</div>
        {membri.map((m) => (
          <div key={m.id} className="px-3 py-1.5 text-sm text-ink-500 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-ok/70" />
            {m.nome} {m.isOwner && <span className="text-ink-700">· owner</span>}
          </div>
        ))}
      </nav>

      <div className="p-2 border-t border-white/[0.06]">
        <button
          onClick={onTogglePannelloProposte}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-token-sm text-sm transition-colors ${
            pannelloProposteAperto ? "bg-white/[0.08] text-ink-100" : "text-ink-300 hover:bg-white/[0.04]"
          }`}
        >
          <span>Proposte</span>
          {numeroProposte > 0 && (
            <span className="bg-accent text-base-950 text-xs font-medium rounded-full px-2 py-0.5">
              {numeroProposte}
            </span>
          )}
        </button>
        <button onClick={onLogout} className="w-full text-left px-3 py-2 rounded-token-sm text-sm text-ink-500 hover:text-ink-300 hover:bg-white/[0.04]">
          Esci
        </button>
      </div>
    </aside>
  );
}
