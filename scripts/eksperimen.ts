/**
 * Eksperimen untuk laporan/presentasi: GA vs greedy vs acak, lalu analisis sensitivitas parameter.
 *   npm run eksperimen            → menulis docs/hasil_eksperimen.md
 *   npm run eksperimen -- --seeds 10
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DATA_FILES, buildDataset } from '../src/ga/data';
import { buildProblem, DEFAULT_TRIP, type TripInput } from '../src/ga/fitness';
import { PARAMETER_LABELS, compareMethods, sensitivityAnalysis } from '../src/ga/pembanding';

const { values } = parseArgs({ options: { seeds: { type: 'string', default: '20' } } });
const seeds = Array.from({ length: Number(values.seeds) }, (_, i) => i + 1);

const root = path.join(import.meta.dirname, '..');
const read = (url: string) => readFileSync(path.join(root, 'public', url), 'utf8');
const dataset = buildDataset({ attractions: read(DATA_FILES.attractions), distance: read(DATA_FILES.distance), duration: read(DATA_FILES.duration) });

const SCENARIOS: { name: string; trip: TripInput }[] = [
  { name: 'Contoh slide: Rp1.000.000, 5 hari × 7 jam, 2 orang', trip: DEFAULT_TRIP },
  { name: 'Default kode asli: Rp3.000.000, 3 hari × 10 jam, 2 orang, museum/pantai/ramah anak', trip: { budget: 3_000_000, days: 3, hoursPerDay: 10, people: 2, tagWeights: { museum: 1, beach: 1, 'kids-friendly': 1 } } },
  { name: 'Hemat: Rp500.000, 2 hari × 7 jam, 4 orang, alam', trip: { budget: 500_000, days: 2, hoursPerDay: 7, people: 4, tagWeights: { outdoors: 1 } } },
];

const f = (x: number, d = 2) => x.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
const rp = (x: number) => `Rp${Math.round(x).toLocaleString('id-ID')}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const log = (done: number, total: number, label: string) => process.stdout.write(`\r  ${done}/${total} ${label}`.padEnd(60));

let md = `# Hasil Eksperimen

> Dihasilkan otomatis oleh \`npm run eksperimen\` (${seeds.length} seed: 1–${seeds.length}). Parameter GA default:
> populasi 100, generasi maks. 200, crossover 0,8, mutasi 0,05, elit 2, seleksi turnamen, stagnasi 100.
> Fitness lebih tinggi = rencana lebih dekat ke target anggaran & jam. Pencarian acak memakai jumlah evaluasi yang sama dengan GA.

## 1. GA vs pembanding
`;

for (const { name, trip } of SCENARIOS) {
  console.log(`\n${name}`);
  const summary = compareMethods(buildProblem(dataset, trip), seeds, {}, log);
  md += `\n### ${name}\n\n| Metode | Fitness rata-rata ± SD | Fitness terbaik | Rencana valid | Biaya rata-rata | Durasi rata-rata | Waktu rata-rata |\n|---|---|---|---|---|---|---|\n`;
  for (const s of summary) {
    md += `| ${s.label} | ${f(s.meanFitness)} ± ${f(s.sdFitness)} | ${f(s.bestFitness)} | ${pct(s.validRate)} | ${rp(s.meanCost)} | ${f(s.meanHours, 1)} jam | ${f(s.meanMs, 0)} ms |\n`;
  }
  const ga = summary[0];
  const bestOther = summary.slice(1).reduce((a, b) => (b.meanFitness > a.meanFitness ? b : a));
  if (ga) md += `\nGA ${f(ga.meanFitness / bestOther.meanFitness)}× lebih baik dari pembanding terbaik (${bestOther.label}).\n`;
}

const sensSeeds = seeds.slice(0, Math.min(10, seeds.length));
console.log(`\n\nAnalisis sensitivitas (${sensSeeds.length} seed, skenario slide)`);
const points = sensitivityAnalysis(buildProblem(dataset, DEFAULT_TRIP), sensSeeds, {}, log);
md += `\n## 2. Analisis sensitivitas parameter\n\nSkenario contoh slide, ${sensSeeds.length} seed per nilai. Satu parameter diubah, sisanya default (**tebal**).\n`;
for (const parameter of Object.keys(PARAMETER_LABELS) as (keyof typeof PARAMETER_LABELS)[]) {
  md += `\n### ${PARAMETER_LABELS[parameter]}\n\n| Nilai | Fitness rata-rata ± SD | Rencana valid | Waktu rata-rata |\n|---|---|---|---|\n`;
  for (const p of points.filter((x) => x.parameter === parameter)) {
    const value = p.isDefault ? `**${p.value}**` : String(p.value);
    md += `| ${value} | ${f(p.meanFitness)} ± ${f(p.sdFitness)} | ${pct(p.validRate)} | ${f(p.meanMs, 0)} ms |\n`;
  }
}

writeFileSync(path.join(root, 'docs', 'hasil_eksperimen.md'), md);
console.log(`\n\n${md}`);
