import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Perencana Wisata Genetik',
  description: 'Rekomendasi rencana perjalanan wisata yang dioptimasi dengan Algoritma Genetika (PACS262501).',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
