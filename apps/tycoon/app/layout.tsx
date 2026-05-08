import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import '@zlatkov/styles/globals.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Economy Tycoon',
  description: 'Build the AI industry. A tycoon game with an AI advisor inside.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
