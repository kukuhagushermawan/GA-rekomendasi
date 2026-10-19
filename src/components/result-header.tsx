'use client';

import { Check, Pencil, Share2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { PageHeading } from '@/components/panel';
import { tagLabel } from '@/ga/data';
import type { PlannerParams } from '@/lib/params';
import { cn, rupiah } from '@/lib/utils';

export function TripChips({ params }: { params: PlannerParams }) {
  const { trip } = params;
  const prefs = Object.entries(trip.tagWeights)
    .filter(([, w]) => w > 0)
    .map(([t]) => tagLabel(t));
  const chips = [rupiah(trip.budget), `${trip.days} hari × ${trip.hoursPerDay} jam`, `${trip.people} orang`, ...prefs];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
          {c}
        </span>
      ))}
    </div>
  );
}

const iconButton = 'grid size-10 place-items-center rounded-full border border-white/25 text-white transition hover:bg-white/10';

/** Judul halaman hasil + tab Rencana/Evolusi + aksi ubah & bagikan. */
export function ResultHeader({ title, params, query }: { title: string; params: PlannerParams; query: string }) {
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <PageHeading eyebrow="Hasil" title={title}>
        <TripChips params={params} />
      </PageHeading>
      <div className="flex items-center gap-2">
        <div className="flex rounded-full bg-white/10 p-1 text-sm">
          {[
            { href: '/hasil', label: 'Rencana' },
            { href: '/evolusi', label: 'Evolusi' },
          ].map((t) => (
            <Link
              key={t.href}
              href={`${t.href}?${query}`}
              className={cn('rounded-full px-4 py-1.5 text-white/70', pathname === t.href && 'bg-white font-semibold text-ugm-ink')}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <Link href={`/rencana?${query}`} className={iconButton} aria-label="Ubah">
          <Pencil className="size-4" />
        </Link>
        <button
          type="button"
          className={iconButton}
          aria-label="Salin tautan"
          onClick={() =>
            void navigator.clipboard.writeText(window.location.href).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
        </button>
      </div>
    </div>
  );
}
