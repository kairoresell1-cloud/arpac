'use client';
import { createBrowserClient } from '@supabase/ssr';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function Accept() {
  const router = useRouter();
  const [error, setError] = useState('');
  return (
    <main className="login">
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const password = String(new FormData(e.currentTarget).get('password'));
          const client = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          );
          const fragment = new URLSearchParams(location.hash.slice(1));
          if (fragment.get('access_token')) {
            const { error } = await client.auth.setSession({
              access_token: fragment.get('access_token')!,
              refresh_token: fragment.get('refresh_token')!,
            });
            history.replaceState(null, '', location.pathname);
            if (error) {
              setError('Invito scaduto. Richiedi un nuovo invito all’owner.');
              return;
            }
          }
          const code = new URLSearchParams(location.search).get('code');
          if (code) await client.auth.exchangeCodeForSession(code);
          const { error } = await client.auth.updateUser({ password });
          if (error) setError('Impossibile attivare il profilo. Verifica che l’invito sia valido.');
          else {
            router.push('/');
            router.refresh();
          }
        }}
      >
        <h1>Benvenuto in ARPAC.</h1>
        <label>
          Crea una password
          <input
            type="password"
            name="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </label>
        <button className="primary">Attiva il mio accesso</button>
        <p role="alert">{error}</p>
      </form>
    </main>
  );
}
