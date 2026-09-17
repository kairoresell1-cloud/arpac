import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ARPAC · Il tuo team, un passo avanti',
  description:
    'Lo spazio operativo del tuo team. Progetti, conversazioni e decisioni, insieme ad ARPAC.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
