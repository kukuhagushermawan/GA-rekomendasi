import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { Suspense, type ReactNode } from 'react';
import { GaProvider } from '@/components/ga-provider';
import { SiteHeader } from '@/components/site-header';
import { cn } from '@/lib/utils';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Wisata Genetik',
  description: 'Rencana wisata yang pas dengan anggaran dan waktu, disusun dengan Algoritma Genetika.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={cn('font-sans', geist.variable)}>
      <body className="min-h-screen bg-ugm-ink text-white antialiased">
        <GaProvider>
          <Suspense fallback={<div className="h-20" />}>
            <SiteHeader />
          </Suspense>
          <main className="mx-auto max-w-6xl px-4 pt-6 pb-16 md:pt-10">{children}</main>
        </GaProvider>
      </body>
    </html>
  );
}
