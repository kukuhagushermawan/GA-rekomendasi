/**
 * Validasi silang terhadap reference/upstream/newresults.txt (27 run type8 × 9 hasil).
 *
 *   npm run cross-validate            → menulis docs/validasi_silang.md
 *
 * A. Deterministik: hitung ulang fitness/biaya/durasi setiap hasil upstream dengan port evaluateV1.
 * B. Deterministik: jadwal per hari dari `route-by-index` upstream dengan port day_suggestion.
 * C. Aproksimasi: rute OR-Tools vs aproksimasi PATH_CHEAPEST_ARC + 2-opt/relocate.
 * D. Statistik: distribusi port type8 (banyak seed) vs 27 run upstream.
 * E. GA proyek ini pada OBJEKTIF UPSTREAM (bobot penalti/bonus 0, 10 jam/hari, kandidat sama),
 *    dinilai dengan evaluateV1 upstream.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadRawDir } from '../src/lib/data/node';
import { buildProblem, runGA, type GAConfig } from '../src/lib/ga';
import { createRng } from '../src/lib/random';
import {
  UPSTREAM,
  daySuggestion,
  evaluateV1,
  optimizeRouteApprox,
  parseNewResults,
  runType8,
  sumCost,
  type EvalContext,
} from '../src/lib/reference';
import { ksTwoSample, summarize, type Summary } from '../src/lib/stats';

const root = path.resolve(import.meta.dirname, '..');
const { dataset } = loadRawDir(path.join(root, 'data', 'raw'));
const { attractions, matrices } = dataset;
const byKey = new Map(attractions.map((a, i) => [a.matrixKey, i]));

const runs = parseNewResults(readFileSync(path.join(root, 'reference', 'upstream', 'newresults.txt'), 'utf8'));
const results = runs.flat();

const { nPeople, budget, days, tags } = UPSTREAM.DEFAULTS;
const ctx: EvalContext = { attractions, matrices, budget, nPeople, days };

// ---- A. Hitung ulang evaluateV1 --------------------------------------------------------------------
const unknownNames = new Set<string>();
const fields = ['fitness', 'HTM', 'travelExpenses', 'totalExpenses', 'totalDuration', 'travelDuration'] as const;
const exact: Record<(typeof fields)[number], number> = {
  fitness: 0,
  HTM: 0,
  travelExpenses: 0,
  totalExpenses: 0,
  totalDuration: 0,
  travelDuration: 0,
};
const maxRelDiff: Record<(typeof fields)[number], number> = { ...exact };
let comparable = 0;
for (const r of results) {
  const genes = r.spots.map((s) => byKey.get(s));
  if (genes.some((g) => g === undefined)) {
    r.spots.filter((s) => !byKey.has(s)).forEach((s) => unknownNames.add(s));
    continue;
  }
  comparable++;
  const e = evaluateV1(genes as number[], ctx);
  const ours = {
    fitness: e.fitness,
    // showResults: "HTM" = sumCost() * noPerson.
    HTM: sumCost(genes as number[], attractions) * nPeople,
    travelExpenses: e.travelExpenses,
    totalExpenses: e.totalCost,
    totalDuration: e.totalHours,
    travelDuration: e.travelHours,
  };
  for (const f of fields) {
    if (ours[f] === r[f]) exact[f]++;
    const rel = Math.abs(ours[f] - r[f]) / Math.max(1e-12, Math.abs(r[f]));
    maxRelDiff[f] = Math.max(maxRelDiff[f], rel);
  }
}

// ---- B & C. Jadwal per hari dan rute -----------------------------------------------------------------
let dayExact = 0;
let routeExact = 0;
let distWithin1pct = 0;
const distGaps: number[] = [];
let routeComparable = 0;
for (const r of results) {
  const genes = r.spots.map((s) => byKey.get(s));
  if (genes.some((g) => g === undefined)) continue;
  routeComparable++;
  const g = genes as number[];
  const perDay = daySuggestion(g, r['route-by-index'], attractions, matrices);
  if (JSON.stringify(perDay) === JSON.stringify(r['per-day-route'])) dayExact++;
  const approx = optimizeRouteApprox(g, attractions, matrices);
  if (JSON.stringify(approx.routeList) === JSON.stringify(r['route-by-index'])) routeExact++;
  const gap = (approx.totalDist - r.totalDist) / r.totalDist;
  distGaps.push(gap);
  if (Math.abs(gap) <= 0.01) distWithin1pct++;
}

// ---- D. Distribusi port type8 vs upstream -----------------------------------------------------------
const perRun = (rs: { fitness: number; spots: number; cost: number; hours: number }[]) => {
  const best = rs.reduce((a, b) => (b.fitness > a.fitness ? b : a));
  return { best: best.fitness, avg: rs.reduce((s, x) => s + x.fitness, 0) / rs.length, spots: best.spots, cost: best.cost, hours: best.hours };
};
const upstreamRuns = runs.map((rs) =>
  perRun(rs.map((r) => ({ fitness: r.fitness, spots: r.spots.length, cost: r.totalExpenses, hours: r.totalDuration }))),
);
const PORT_SEEDS = 500;
const portRuns = Array.from({ length: PORT_SEEDS }, (_, i) => {
  const out = runType8({ attractions, matrices, nPeople, budget, days, tags, rng: createRng(1000 + i) });
  return perRun(out.results.map((r) => ({ fitness: r.fitness, spots: r.genes.length, cost: r.totalCost, hours: r.totalHours })));
});

// ---- E. GA proyek pada objektif upstream ------------------------------------------------------------
const upstreamObjective = buildProblem(
  dataset,
  { budget, days, hoursPerDay: UPSTREAM.EVAL_HOURS_PER_DAY, people: nPeople, tagWeights: {} },
  {
    excludeSuspect: false,
    requireAnyTag: tags,
    weights: { cost: 1, duration: 1, violation: 0, schedule: 0, preference: 0, epsilon: 1e-12 },
  },
);
const GA_SEEDS = 30;
const runOurs = (config: Partial<GAConfig>) =>
  Array.from({ length: GA_SEEDS }, (_, i) => {
    const r = runGA(upstreamObjective, config, createRng(2000 + i));
    const route = r.bestOverall.route.map((c) => upstreamObjective.candidates[c] as number);
    const e = evaluateV1(route, ctx);
    return { best: e.fitness, spots: route.length, cost: e.totalCost, hours: e.totalHours, evaluations: r.evaluations };
  });
const oursEqualBudget = runOurs({ populationSize: 40, maxGenerations: 8, eliteCount: 2, stagnationLimit: 0 });
const oursDefault = runOurs({});

// ---- Laporan ----------------------------------------------------------------------------------------
const f = (x: number, d = 4) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const rp = (x: number) => `Rp${Math.round(x).toLocaleString('id-ID')}`;
const row = (label: string, s: Summary, fmt: (x: number) => string) =>
  `| ${label} | ${s.n} | ${fmt(s.mean)} | ${fmt(s.sd)} | ${fmt(s.min)} | ${fmt(s.median)} | ${fmt(s.max)} |`;
const header = '| Sumber | n | Rata-rata | SD | Min | Median | Maks |\n|---|---|---|---|---|---|---|';
const pval = (p: number) => (p < 0.001 ? '< 0,001' : f(p, 3));

const ksBest = ksTwoSample(upstreamRuns.map((r) => r.best), portRuns.map((r) => r.best));
const ksAvg = ksTwoSample(upstreamRuns.map((r) => r.avg), portRuns.map((r) => r.avg));
const ksSpots = ksTwoSample(upstreamRuns.map((r) => r.spots), portRuns.map((r) => r.spots));

const md = `# Validasi Silang terhadap \`newresults.txt\`

> Berkas ini **dihasilkan otomatis** oleh \`npm run cross-validate\` (scripts/cross-validate.ts). Jangan diedit manual.

Parameter upstream (default \`main.py\`): anggaran ${rp(budget)}, ${days} hari, ${nPeople} orang, tag \`${tags.join(', ')}\`,
\`epochs=400\` (tidak dipakai; type8 menjalankan ${UPSTREAM.GENERATIONS} generasi). \`newresults.txt\` berisi **${runs.length} run × ${runs[0]?.length ?? 0} hasil = ${results.length} hasil**.

## A. Fungsi evaluasi (deterministik)

Setiap hasil upstream dihitung ulang dengan port \`evaluateV1\` memakai urutan \`spots\` yang tercatat.

- Hasil yang semua nama destinasinya ada di dataset: **${comparable} / ${results.length}**${unknownNames.size ? ` (nama tidak dikenal: ${[...unknownNames].map((n) => `\`${n}\``).join(', ')})` : ''}.

| Besaran | Identik bit-per-bit | Selisih relatif maks. |
|---|---|---|
${fields.map((k) => `| \`${k}\` | ${exact[k]} / ${comparable} | ${maxRelDiff[k].toExponential(2)} |`).join('\n')}

## B. Jadwal per hari (deterministik)

\`day_suggestion\` diport persis (termasuk bug indeks). Dengan \`route-by-index\` upstream sebagai masukan:
**${dayExact} / ${routeComparable}** \`per-day-route\` identik.

## C. Rute OR-Tools (aproksimasi)

Port memakai PATH_CHEAPEST_ARC + 2-opt/relocate, bukan OR-Tools.

- Urutan identik dengan \`route-by-index\` upstream: **${routeExact} / ${routeComparable}**
- \`totalDist\` dalam ±1%: **${distWithin1pct} / ${routeComparable}**
- Selisih relatif \`totalDist\` (aproksimasi − OR-Tools) / OR-Tools: rata-rata ${f(summarize(distGaps).mean * 100, 2)}%, min ${f(summarize(distGaps).min * 100, 2)}%, maks ${f(summarize(distGaps).max * 100, 2)}%

## D. Distribusi port \`type8\` vs upstream (statistik)

Python memakai RNG tanpa seed, jadi run tidak bisa diulang bit-per-bit. Port dijalankan dengan ${PORT_SEEDS} seed (1000–${1000 + PORT_SEEDS - 1}).
Per run diambil fitness terbaik dan rata-rata fitness dari 9 entri \`bestSoFar\`.

**Fitness terbaik per run**

${header}
${row('Upstream (newresults.txt)', summarize(upstreamRuns.map((r) => r.best)), f)}
${row('Port TypeScript', summarize(portRuns.map((r) => r.best)), f)}

KS dua sampel: D = ${f(ksBest.d, 3)}, p = ${pval(ksBest.p)}

**Rata-rata fitness 9 entri per run**

${header}
${row('Upstream (newresults.txt)', summarize(upstreamRuns.map((r) => r.avg)), f)}
${row('Port TypeScript', summarize(portRuns.map((r) => r.avg)), f)}

KS dua sampel: D = ${f(ksAvg.d, 3)}, p = ${pval(ksAvg.p)}

**Jumlah destinasi pada hasil terbaik**

${header}
${row('Upstream (newresults.txt)', summarize(upstreamRuns.map((r) => r.spots)), (x) => f(x, 1))}
${row('Port TypeScript', summarize(portRuns.map((r) => r.spots)), (x) => f(x, 1))}

KS dua sampel: D = ${f(ksSpots.d, 3)}, p = ${pval(ksSpots.p)}

**Biaya dan durasi hasil terbaik**

${header}
${row('Biaya — upstream', summarize(upstreamRuns.map((r) => r.cost)), rp)}
${row('Biaya — port', summarize(portRuns.map((r) => r.cost)), rp)}
${row('Durasi (jam) — upstream', summarize(upstreamRuns.map((r) => r.hours)), (x) => f(x, 2))}
${row('Durasi (jam) — port', summarize(portRuns.map((r) => r.hours)), (x) => f(x, 2))}

## E. GA proyek ini pada objektif upstream

Konfigurasi agar setara: 10 jam/hari, kandidat = atraksi bertag \`${tags.join('/')}\` **tanpa** pengecualian audit,
bobot penalti/jadwal/preferensi = 0. Pada anggaran ${rp(budget)} dan ${days * UPSTREAM.EVAL_HOURS_PER_DAY} jam,
\`1/(|B−C|/B + |D−T|/T)\` = 30 × fitness upstream, jadi kedua objektif memiliki optimum yang sama.
Rencana dengan fitness tertinggi (\`bestOverall\`) dinilai ulang dengan \`evaluateV1\` upstream. ${GA_SEEDS} seed (2000–${2000 + GA_SEEDS - 1}).

${header}
${row('Upstream (newresults.txt), 360 evaluasi', summarize(upstreamRuns.map((r) => r.best)), f)}
${row(`GA proyek, evaluasi setara (${oursEqualBudget[0]?.evaluations ?? 0})`, summarize(oursEqualBudget.map((r) => r.best)), f)}
${row(`GA proyek, default (≈${Math.round(summarize(oursDefault.map((r) => r.evaluations)).mean)} evaluasi)`, summarize(oursDefault.map((r) => r.best)), f)}

KS (upstream vs GA proyek evaluasi setara): D = ${f(ksTwoSample(upstreamRuns.map((r) => r.best), oursEqualBudget.map((r) => r.best)).d, 3)}, p = ${pval(ksTwoSample(upstreamRuns.map((r) => r.best), oursEqualBudget.map((r) => r.best)).p)}
`;

writeFileSync(path.join(root, 'docs', 'validasi_silang.md'), md);
console.log(md);
