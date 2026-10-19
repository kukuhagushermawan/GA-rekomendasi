import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { HeroArt } from '@/components/hero-art';
import { goldPill, outlinePill } from '@/components/panel';

const STEPS = [
  ['Isi batasan', 'Anggaran, lama liburan, jumlah orang, dan minat.'],
  ['GA mencari', 'Kombinasi dan urutan destinasi berevolusi tiap generasi.'],
  ['Pilih rencana', 'Lima rencana terbaik lengkap dengan peta dan jadwal.'],
];

export default function LandingPage() {
  return (
    <div className="space-y-16 md:space-y-24">
      <section className="grid items-center gap-10 pt-2 md:grid-cols-[1.05fr_1fr] md:pt-8">
        <div className="space-y-6">
          <p className="text-sm font-medium tracking-wide text-ugm-gold">Genetic Algorithm</p>
          <h1 className="text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl">Rencana wisata terbaik, pas anggaran dan waktu.</h1>
          <p className="max-w-md text-white/75 md:text-lg">
            Isi anggaran, lama liburan, jumlah orang, dan minatmu. Pakai data bawaan atau unggah daftar destinasimu sendiri.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/rencana" className={goldPill}>
              Mulai merencanakan <ArrowRight className="size-4" />
            </Link>
            <Link href="/dataset" className={outlinePill}>
              Unggah dataset
            </Link>
          </div>
        </div>
        <HeroArt />
      </section>

      <section className="grid gap-8 border-t border-white/10 pt-10 md:grid-cols-3">
        {STEPS.map(([title, text], i) => (
          <div key={title} className="space-y-2">
            <p className="text-sm font-semibold text-ugm-gold tabular-nums">0{i + 1}</p>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-white/65">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
