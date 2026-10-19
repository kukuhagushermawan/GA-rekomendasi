'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/eksperimen', label: 'Eksperimen', keepQuery: true },
  { href: '/dataset', label: 'Dataset', keepQuery: false },
  { href: '/tentang', label: 'Tentang', keepQuery: false },
];

export function SiteHeader() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const planning = ['/rencana', '/hasil', '/evolusi'].includes(pathname);
  return (
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-5">
      <Link href="/" aria-label="Beranda">
        <Logo />
      </Link>
      <nav className="-mx-2 flex items-center text-[13px] sm:mx-0 sm:gap-1 sm:text-sm">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.keepQuery && query ? `${link.href}?${query}` : link.href}
            className={cn('rounded-full px-2 py-2 text-white/70 transition hover:text-white sm:px-3', pathname === link.href && 'text-white')}
          >
            {link.label}
          </Link>
        ))}
        <Link
          href={query ? `/rencana?${query}` : '/rencana'}
          className={cn(
            'ml-1 rounded-full px-3.5 py-2 font-semibold transition sm:ml-2 sm:px-5',
            planning ? 'bg-ugm-gold text-ugm-ink' : 'bg-white text-ugm-ink hover:bg-white/90',
          )}
        >
          Rencanakan
        </Link>
      </nav>
    </header>
  );
}
