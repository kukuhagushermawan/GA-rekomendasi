import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Kartu putih membulat di atas latar biru tua. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl bg-white p-5 text-slate-900 md:p-6', className)}>{children}</div>;
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 font-semibold text-ugm-ink">{children}</h2>;
}

/** Judul halaman: eyebrow kuning + judul putih + isi tambahan (chip, aksi). */
export function PageHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="space-y-3">
      {eyebrow && <p className="text-sm font-medium text-ugm-gold">{eyebrow}</p>}
      <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{title}</h1>
      {children}
    </div>
  );
}

/** Baris angka di kartu putih (seperti statistik di landing page). */
export function StatStrip({ stats }: { stats: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-2xl bg-white text-ugm-ink md:grid-cols-4">
      {stats.map(([value, label], i) => (
        <div
          key={label}
          className={cn('border-slate-200 p-5 md:p-6', i % 2 === 1 && 'border-l', i > 0 && 'md:border-l', i >= 2 && 'border-t md:border-t-0')}
        >
          <dt className="text-2xl font-bold tabular-nums md:text-3xl">{value}</dt>
          <dd className="mt-1 text-sm text-slate-500">{label}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tombol pill kuning (aksi utama di latar biru tua). */
export const goldPill =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ugm-gold px-6 text-sm font-semibold text-ugm-ink transition hover:brightness-105 disabled:pointer-events-none disabled:opacity-50';

/** Tombol pill bergaris putih. */
export const outlinePill =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/30 px-6 text-sm font-semibold text-white transition hover:bg-white/10';
