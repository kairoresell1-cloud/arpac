import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ARPAC · Il tuo team, un passo avanti',
  description:
    'Lo spazio operativo del tuo team. Progetti, conversazioni e decisioni, insieme ad ARPAC.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
