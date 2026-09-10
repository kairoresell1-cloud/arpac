'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function Login({
  configured,
  standalone = false,
  initialError = '',
}: {
  configured: boolean;
  standalone?: boolean;
  initialError?: string;
}) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
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
              setError('');
              const f = new FormData(e.currentTarget);
              try {
                const r = await fetch('/api/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
                  signal: AbortSignal.timeout(20000),
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok)
                  throw new Error(d.error || 'Il server non ha completato l’accesso. Riprova.');
                const workspace = await fetch('/api/workspace', {
                  cache: 'no-store',
                  signal: AbortSignal.timeout(20000),
                });
                if (!workspace.ok) {
                  const result = await workspace.json().catch(() => ({}));
                  throw new Error(
                    workspace.status === 401
                      ? 'La sessione non è stata salvata. Abilita i cookie per questo sito e riprova.'
                      : result.error || 'Impossibile aprire il workspace. Riprova tra poco.',
                  );
                }
                router.refresh();
              } catch (e) {
                setError(
                  e instanceof DOMException
                    ? 'Il server non risponde. Riprova tra poco.'
                    : (e as Error).message,
                );
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
