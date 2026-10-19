/**
 * Menjalankan GA di terminal pada data asli.
 *
 *   npm run ga -- --budget 1000000 --days 5 --hours 7 --people 2 --tags museum=1,history=0.5 --seed 42
 *
 * Opsi GA: --pop --gens --pc --pm --elite --selection tournament|roulette --tournament
 *          --mask uniform|onePoint --stagnation --seed-ratio --top --min-diff --include-suspect
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadRawDir } from '../src/lib/data/node';
import { DEFAULT_GA_CONFIG, DEFAULT_TRIP, buildProblem, runGA, toPlanView, type GAConfig } from '../src/lib/ga';
import { createRng } from '../src/lib/random';

const { values } = parseArgs({
  options: {
    budget: { type: 'string', default: String(DEFAULT_TRIP.budget) },
    days: { type: 'string', default: String(DEFAULT_TRIP.days) },
    hours: { type: 'string', default: String(DEFAULT_TRIP.hoursPerDay) },
    people: { type: 'string', default: String(DEFAULT_TRIP.people) },
    tags: { type: 'string', default: '' },
    seed: { type: 'string', default: '42' },
    pop: { type: 'string' },
    gens: { type: 'string' },
    pc: { type: 'string' },
    pm: { type: 'string' },
    elite: { type: 'string' },
    selection: { type: 'string' },
    tournament: { type: 'string' },
    mask: { type: 'string' },
    stagnation: { type: 'string' },
    'seed-ratio': { type: 'string' },
    top: { type: 'string' },
    'min-diff': { type: 'string' },
    'include-suspect': { type: 'boolean', default: false },
  },
});

const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
const tagWeights = Object.fromEntries(
  (values.tags ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => {
      const [tag, weight] = pair.split('=');
      return [tag as string, weight === undefined ? 1 : Number(weight)];
    }),
);

const config: Partial<GAConfig> = Object.fromEntries(
  Object.entries({
    populationSize: num(values.pop),
    maxGenerations: num(values.gens),
    crossoverRate: num(values.pc),
    mutationRate: num(values.pm),
    eliteCount: num(values.elite),
    selection: values.selection as GAConfig['selection'] | undefined,
    tournamentSize: num(values.tournament),
    maskCrossover: values.mask as GAConfig['maskCrossover'] | undefined,
    stagnationLimit: num(values.stagnation),
    greedySeedRatio: num(values['seed-ratio']),
    topK: num(values.top),
    minPlanDifference: num(values['min-diff']),
  }).filter(([, v]) => v !== undefined),
);

const { dataset } = loadRawDir(path.resolve(import.meta.dirname, '..', 'data', 'raw'));
const problem = buildProblem(
  dataset,
  {
    budget: Number(values.budget),
    days: Number(values.days),
    hoursPerDay: Number(values.hours),
    people: Number(values.people),
    tagWeights,
  },
  { excludeSuspect: !values['include-suspect'] },
);

const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const h = (n: number) => n.toFixed(2);
const effective = { ...DEFAULT_GA_CONFIG, ...config };

console.log('Perencana Wisata Genetik — GA (CLI)');
console.log(
  `Anggaran ${rp(problem.input.budget)} · ${problem.input.days} hari × ${problem.input.hoursPerDay} jam = ${problem.targetHours} jam · ${problem.input.people} orang`,
);
console.log(`Preferensi: ${Object.keys(tagWeights).length ? JSON.stringify(tagWeights) : '(tidak ada)'}`);
console.log(`Kandidat: ${problem.n} dari ${dataset.attractions.length} (dikecualikan ${problem.excluded.length})`);
console.log(
  `GA: pop ${effective.populationSize}, gen ${effective.maxGenerations}, pc ${effective.crossoverRate}, pm ${effective.mutationRate}, elit ${effective.eliteCount}, ${effective.selection}, mask ${effective.maskCrossover}, stagnasi ${effective.stagnationLimit}, seed ${values.seed}\n`,
);

const result = runGA(problem, config, createRng(Number(values.seed)), {
  onGeneration: (s) => {
    if (s.generation % 20 === 0) {
      console.log(
        `gen ${String(s.generation).padStart(4)} | terbaik ${s.bestFitness.toFixed(4)} | rata-rata ${s.meanFitness.toFixed(4)} | valid ${(s.validRate * 100).toFixed(0).padStart(3)}%`,
      );
    }
  },
});

console.log(
  `\nBerhenti: ${result.stopReason} setelah ${result.generations} generasi, ${result.evaluations} evaluasi, ${result.elapsedMs.toFixed(0)} ms\n`,
);

const plans = result.top.map((p, i) => toPlanView(problem, p, i + 1));
if (plans.length === 0) console.log('Tidak ada rencana. Coba naikkan anggaran atau durasi.');
for (const p of plans) {
  console.log(
    `#${p.rank} ${p.valid ? 'VALID      ' : 'TIDAK VALID'} | ${p.names.length} destinasi | biaya ${rp(p.totalCost)} (HTM ${rp(p.ticketCost)} + taksi ${rp(p.transportCost)}) | sisa ${rp(p.remainingBudget)} | ${h(p.totalHours)} jam | preferensi ${(p.preference * 100).toFixed(0)}% | fitness ${p.fitness.toFixed(4)}`,
  );
  for (const issue of p.issues) console.log(`     ! ${issue}`);
}

const first = plans[0];
if (first) {
  console.log(`\nJadwal rencana #1:`);
  for (const d of first.days) {
    console.log(`  Hari ${d.day} (${h(d.hours)} jam${d.overLimit ? ', MELEBIHI BATAS' : ''})`);
    for (const s of d.stops) {
      const travel = s.travelHoursIn > 0 ? `+${h(s.travelHoursIn)} j tempuh (${s.travelKmIn.toFixed(1)} km), ` : '';
      console.log(`    ${s.id} ${s.name} — ${travel}${h(s.visitHours)} j kunjungan, ${rp(s.ticketPerPerson)}/orang`);
    }
  }
}
if (!plans.some((p) => p.valid)) console.log('\nTidak ada rencana valid. Coba naikkan anggaran atau durasi.');
