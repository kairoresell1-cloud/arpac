'use client';
import { useState } from 'react';
export default function Login({
  configured,
  standalone = false,
}: {
  configured: boolean;
  standalone?: boolean;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <div className="panel">
        <div className="brand">
          Λ<span>ARPAC</span>
        </div>
        <p className="eyebrow">IL TUO TEAM, UN PASSO AVANTI</p>
        <h1>Bentornato nel team.</h1>
        <p>Uno spazio privato. Idee condivise. Decisioni migliori.</p>
        {configured || standalone ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                const r = await fetch('/api/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                location.reload();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Email
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Accesso…' : 'Entra in ARPAC →'}
            </button>
          </form>
        ) : (
          <p className="notice">
            Configura Supabase nelle variabili d’ambiente. La demo locale è disponibile con{' '}
            <code>npm run dev</code> senza credenziali.
          </p>
        )}
        <p role="alert">{error}</p>
        <small>L’accesso è riservato ai membri invitati dall’owner.</small>
      </div>
    </main>
  );
}
