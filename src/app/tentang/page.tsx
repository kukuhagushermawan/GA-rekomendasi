import type { ReactNode } from 'react';
import { PageHeading } from '@/components/panel';

export const metadata = { title: 'Tentang · Wisata Genetik' };

const TEAM = [
  { name: 'Azhar Maulana', nim: '24/533487/PA/22582' },
  { name: 'Kukuh Agus Hermawan', nim: '24/533395/PA/22573' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-white/10 py-8 md:grid-cols-[220px_1fr]">
      <h2 className="font-semibold text-ugm-gold">{title}</h2>
      <div className="space-y-3 text-white/80">{children}</div>
    </section>
  );
}

const Code = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-2xl bg-white/[0.07] p-5 text-sm leading-relaxed text-white">{children}</pre>
);

export default function TentangPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeading eyebrow="Tentang" title="Algoritma Genetika untuk rencana wisata">
        <p className="text-white/70">Mata kuliah Algoritma Genetika (PACS262501), Universitas Gadjah Mada.</p>
      </PageHeading>

      <div>
        <Section title="Masalah">
          <p>Memilih destinasi (mirip Knapsack) sekaligus mengurutkan rutenya (mirip TSP).</p>
          <p>
            Dari 201 destinasi ada 2<sup>201</sup> ≈ 3,2 × 10<sup>60</sup> kombinasi. Rencana <b className="text-white">valid</b> bila biaya ≤ anggaran dan
            durasi ≤ hari × jam per hari.
          </p>
        </Section>

        <Section title="Kromosom">
          <Code>{`mask  = [0, 1, 0, 1, 1]   destinasi yang dipilih
order = [4, 0, 3, 1, 2]   urutan kunjungan
rute  = 4 → 3 → 1`}</Code>
        </Section>

        <Section title="Fitness">
          <Code>{`fitness = 1 / (cost_score + duration_score)

cost_score     = |biaya − anggaran| / anggaran
duration_score = |durasi − batas jam| / batas jam`}</Code>
          <p>Ditambah penalti jika melanggar batas dan bonus jika cocok dengan minat.</p>
        </Section>

        <Section title="Operator">
          <ul className="space-y-1.5">
            <li>Populasi 100: acak + greedy seeding</li>
            <li>Seleksi turnamen atau roulette</li>
            <li>Crossover 0,8: uniform/one-point + order crossover (OX)</li>
            <li>Mutasi 0,05: swap, insert, tambah, hapus</li>
            <li>Elitisme 2, maksimal 200 generasi atau stagnasi</li>
          </ul>
        </Section>

        <Section title="Data">
          <p>201 atraksi Jabodetabek beserta matriks jarak dan waktu tempuh dari Qomariyah & Kazakov (2021). Delapan atraksi dengan data rute rusak tidak dipakai.</p>
        </Section>

        <Section title="Referensi">
          <ul className="space-y-2 text-sm">
            <li>Qomariyah, N. N., & Kazakov, D. (2021). A genetic-based pairwise trip planner recommender system. Journal of Big Data, 8, 77.</li>
            <li>Google, Temasek, & Bain & Company. (2020, 2024). e-Conomy SEA.</li>
            <li>Badan Pusat Statistik. (2024). Kunjungan wisatawan mancanegara Agustus 2024.</li>
          </ul>
        </Section>

        <Section title="Tim">
          <div className="grid gap-3 sm:grid-cols-2">
            {TEAM.map((m) => (
              <div key={m.nim} className="rounded-2xl bg-white p-5 text-ugm-ink">
                <p className="font-semibold">{m.name}</p>
                <p className="mt-1 text-sm text-slate-500 tabular-nums">{m.nim}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
