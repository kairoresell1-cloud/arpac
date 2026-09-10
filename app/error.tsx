'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login">
      <div className="panel">
        <h2>Qualcosa si è interrotto.</h2>
        <p>I dati già salvati restano disponibili. Riproviamo.</p>
        <button className="primary" onClick={reset}>
          Riprova
        </button>
      </div>
    </main>
  );
}
