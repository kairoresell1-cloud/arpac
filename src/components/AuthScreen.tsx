"use client";

import { useState } from "react";

export default function AuthScreen({ onAutenticato }: { onAutenticato: () => void }) {
  const [modalita, setModalita] = useState<"login" | "registrazione">("login");
  const [nome, setNome] = useState("");
  const [ruolo, setRuolo] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);

  async function invia() {
    setErrore(null);
    setCaricamento(true);
    try {
      const url = modalita === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = modalita === "login" ? { nome, password } : { nome, ruolo, password };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        setErrore(data.errore || "Qualcosa è andato storto.");
        return;
      }
      onAutenticato();
    } catch {
      setErrore("Impossibile contattare il server.");
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-panel w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-tight text-ink-100">ARPAC</div>
          <div className="text-ink-500 text-sm mt-1">Il manager AI del tuo team</div>
        </div>

        <div className="flex gap-2 mb-6 text-sm">
          <button
            onClick={() => setModalita("login")}
            className={`flex-1 rounded-token-sm py-2 transition-colors ${
              modalita === "login" ? "bg-white/[0.08] text-ink-100" : "text-ink-500 hover:text-ink-300"
            }`}
          >
            Accedi
          </button>
          <button
            onClick={() => setModalita("registrazione")}
            className={`flex-1 rounded-token-sm py-2 transition-colors ${
              modalita === "registrazione" ? "bg-white/[0.08] text-ink-100" : "text-ink-500 hover:text-ink-300"
            }`}
          >
            Unisciti al team
          </button>
        </div>

        <div className="space-y-3">
          <input
            className="input-field w-full"
            placeholder="Il tuo nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          {modalita === "registrazione" && (
            <input
              className="input-field w-full"
              placeholder="Ruolo nel team (es. Sviluppatore)"
              value={ruolo}
              onChange={(e) => setRuolo(e.target.value)}
            />
          )}
          <input
            className="input-field w-full"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {errore && <div className="text-signal-risk text-sm">{errore}</div>}

          <button className="btn-primary w-full mt-2" onClick={invia} disabled={caricamento || !nome || !password}>
            {caricamento ? "Un attimo..." : modalita === "login" ? "Accedi" : "Crea il tuo account"}
          </button>
        </div>
      </div>
    </div>
  );
}
