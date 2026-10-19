/**
 * Menjalankan GA sekali di terminal.
 *   npm run ga -- --budget 1000000 --days 5 --hours 7 --people 2 --tags museum=1,history=0.5 --seed 42
 * Opsi GA: --pop --gens --pc --pm --elite --selection tournament|roulette
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createRng } from '../src/ga/acak';
import { DATA_FILES, buildDataset } from '../src/ga/data';
import { buildProblem, toPlanView } from '../src/ga/fitness';
import { DEFAULT_CONFIG, runGA, type GAConfig } from '../src/ga/ga';

const { values: v } = parseArgs({
  options: Object.fromEntries(
    ['budget', 'days', 'hours', 'people', 'tags', 'seed', 'pop', 'gens', 'pc', 'pm', 'elite', 'selection'].map((k) => [k, { type: 'string' }]),
  ) as Record<string, { type: 'string' }>,
});

const read = (url: string) => readFileSync(path.join(import.meta.dirname, '..', 'public', url), 'utf8');
const dataset = buildDataset({ attractions: read(DATA_FILES.attractions), distance: read(DATA_FILES.distance), duration: read(DATA_FILES.duration) });

const tagWeights = Object.fromEntries(
  (v.tags ?? '').split(',').filter(Boolean).map((p) => {
    const [tag, w] = p.split('=');
    return [tag as string, w === undefined ? 1 : Number(w)];
  }),
);
const problem = buildProblem(dataset, {
  budget: Number(v.budget ?? 1_000_000),
  days: Number(v.days ?? 5),
  hoursPerDay: Number(v.hours ?? 7),
  people: Number(v.people ?? 2),
  tagWeights,
});
const num = (x: string | undefined, fallback: number) => (x === undefined ? fallback : Number(x));
const config: GAConfig = {
  ...DEFAULT_CONFIG,
  seed: num(v.seed, DEFAULT_CONFIG.seed),
  populationSize: num(v.pop, DEFAULT_CONFIG.populationSize),
  maxGenerations: num(v.gens, DEFAULT_CONFIG.maxGenerations),
  crossoverRate: num(v.pc, DEFAULT_CONFIG.crossoverRate),
  mutationRate: num(v.pm, DEFAULT_CONFIG.mutationRate),
  eliteCount: num(v.elite, DEFAULT_CONFIG.eliteCount),
  selection: (v.selection as GAConfig['selection']) ?? DEFAULT_CONFIG.selection,
};

const rp = (x: number) => `Rp${Math.round(x).toLocaleString('id-ID')}`;
const { input } = problem;
console.log(`Anggaran ${rp(input.budget)} · ${input.days} hari × ${input.hoursPerDay} jam · ${input.people} orang · ${problem.n} kandidat`);

const result = runGA(problem, config, createRng(config.seed), {
  onGeneration: (s) => {
    if (s.generation % 25 === 0) {
      console.log(`gen ${String(s.generation).padStart(3)} | terbaik ${s.bestFitness.toFixed(3)} | rata-rata ${s.meanFitness.toFixed(3)} | valid ${(s.validRate * 100).toFixed(0)}%`);
    }
  },
});
console.log(`Berhenti (${result.stopReason}) setelah ${result.generations} generasi, ${result.evaluations} evaluasi, ${result.elapsedMs.toFixed(0)} ms\n`);

result.top.forEach((plan, i) => {
  const p = toPlanView(problem, plan.route, plan.evaluation, i + 1);
  const names = p.days.flatMap((d) => d.stops.map((s) => s.id));
  console.log(
    `#${p.rank} ${p.valid ? 'VALID' : 'TIDAK VALID'} | ${names.length} destinasi | ${rp(p.totalCost)} (sisa ${rp(p.remainingBudget)}) | ${p.totalHours.toFixed(1)} jam | preferensi ${(p.preference * 100).toFixed(0)}% | fitness ${p.fitness.toFixed(3)}`,
  );
  p.issues.forEach((issue) => console.log(`   ! ${issue}`));
});
