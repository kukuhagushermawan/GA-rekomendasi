import { z } from 'zod';
import type { Rng } from './acak';
import { TAXI_RATE_PER_KM, evaluateRoute, type Evaluation, type Problem } from './fitness';
import { cloneChromosome, decode, fromRoute, randomChromosome, type Chromosome } from './kromosom';
import {
  mutate,
  onePointCrossover,
  orderCrossoverPair,
  rouletteSampler,
  tournamentSelect,
  uniformCrossover,
  type Neighbors,
} from './operator';

/**
 * LANGKAH 4 — LOOP GA
 *   1. Populasi awal: 20% greedy seeding (selalu valid) + 80% acak
 *   2. Ulangi tiap generasi:
 *        elitisme   → 2 individu terbaik disalin utuh
 *        seleksi    → turnamen / roulette
 *        crossover  → peluang 0,8: uniform/one-point (pemilihan) + OX (urutan)
 *        mutasi     → peluang 0,05 per destinasi: swap, insert, tambah, hapus
 *   3. Berhenti di generasi maksimum atau bila fitness terbaik stagnan
 *   4. Keluarkan top-5 rencana yang berbeda
 */

export const gaConfigSchema = z
  .object({
    populationSize: z.number().int().min(4).max(1000),
    maxGenerations: z.number().int().min(1).max(5000),
    crossoverRate: z.number().min(0).max(1),
    /** Peluang mutasi per destinasi di rute. */
    mutationRate: z.number().min(0).max(1),
    eliteCount: z.number().int().min(0),
    selection: z.enum(['tournament', 'roulette']),
    tournamentSize: z.number().int().min(2).max(20),
    /** Crossover untuk bagian pemilihan; bagian urutan selalu OX. */
    maskCrossover: z.enum(['uniform', 'onePoint']),
    /** Berhenti bila terbaik tidak membaik selama sekian generasi (0 = nonaktif). */
    stagnationLimit: z.number().int().min(0),
    greedySeedRatio: z.number().min(0).max(1),
    topK: z.number().int().min(1).max(20),
    /** Rencana di top-K harus berbeda minimal sekian destinasi. */
    minPlanDifference: z.number().int().min(1),
    seed: z.number().int().min(0),
  })
  .refine((c) => c.eliteCount < c.populationSize, { message: 'Jumlah elit harus lebih kecil dari populasi', path: ['eliteCount'] });
export type GAConfig = z.infer<typeof gaConfigSchema>;

export const DEFAULT_CONFIG: GAConfig = {
  populationSize: 100,
  maxGenerations: 200,
  crossoverRate: 0.8,
  mutationRate: 0.05,
  eliteCount: 2,
  selection: 'tournament',
  tournamentSize: 3,
  maskCrossover: 'uniform',
  stagnationLimit: 100,
  greedySeedRatio: 0.2,
  topK: 5,
  minPlanDifference: 2,
  seed: 42,
};

// ---- Konstruksi greedy (dipakai seeding GA dan algoritma pembanding) --------------------------------------

export interface GreedyStep {
  c: number;
  /** Waktu tempuh dari destinasi terakhir (jam). */
  travel: number;
  /** Tambahan biaya: HTM × orang + taksi (Rp). */
  addCost: number;
}

/** Kandidat yang muat sendirian (kunjungan ≤ jam/hari dan HTM ≤ anggaran). */
export function feasibleStarts(problem: Problem): number[] {
  const out: number[] = [];
  for (let c = 0; c < problem.n; c++) {
    if ((problem.visit[c] as number) <= problem.input.hoursPerDay && (problem.ticket[c] as number) * problem.input.people <= problem.input.budget) out.push(c);
  }
  return out;
}

/**
 * Membangun rute dari `start`, lalu berulang kali menambah destinasi pilihan `choose` di antara yang
 * masih LAYAK: biaya ≤ anggaran, durasi ≤ batas jam, dan jadwal harian tetap muat. Hasilnya selalu valid.
 */
export function buildGreedyRoute(problem: Problem, start: number, choose: (options: GreedyStep[]) => GreedyStep): number[] {
  const { n, input } = problem;
  const H = input.hoursPerDay;
  const taxi = TAXI_RATE_PER_KM * problem.vehicles;
  const route = [start];
  const used = new Uint8Array(n);
  used[start] = 1;
  let cost = (problem.ticket[start] as number) * input.people;
  let hours = problem.visit[start] as number;
  let dayHours = hours;
  let dayCount = 1;

  for (;;) {
    const last = route[route.length - 1] as number;
    const options: GreedyStep[] = [];
    for (let c = 0; c < n; c++) {
      if (used[c]) continue;
      const travel = problem.travelH[last * n + c] as number;
      const need = travel + (problem.visit[c] as number);
      const addCost = (problem.ticket[c] as number) * input.people + (problem.distKm[last * n + c] as number) * taxi;
      if (cost + addCost > input.budget || hours + need > problem.targetHours) continue;
      const newDay = dayHours + need > H;
      if (need > H && newDay) continue;
      if (newDay && dayCount + 1 > input.days) continue;
      options.push({ c, travel, addCost });
    }
    if (options.length === 0) return route;
    const step = choose(options);
    const need = step.travel + (problem.visit[step.c] as number);
    if (dayHours + need > H) {
      dayHours = need;
      dayCount++;
    } else dayHours += need;
    route.push(step.c);
    used[step.c] = 1;
    cost += step.addCost;
    hours += need;
  }
}

/** Pilih acak berbobot (1 + 2 × preferensi): destinasi yang cocok preferensi lebih sering terpilih. */
function pickByPreference<T>(items: T[], candidate: (item: T) => number, problem: Problem, rng: Rng): T {
  const weight = (item: T) => 1 + 2 * (problem.preference[candidate(item)] as number);
  let r = rng.next() * items.reduce((s, item) => s + weight(item), 0);
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  return items[items.length - 1] as T;
}

/** Greedy seeding: mulai dari kandidat acak, lalu pilih acak di antara 5 tetangga terdekat yang layak. */
export function greedySeedRoute(problem: Problem, rng: Rng): number[] {
  const starts = feasibleStarts(problem);
  if (starts.length === 0) return [];
  const start = pickByPreference(starts, (c) => c, problem, rng);
  return buildGreedyRoute(problem, start, (options) => {
    const nearest = [...options].sort((a, b) => a.travel - b.travel || a.c - b.c).slice(0, 5);
    return pickByPreference(nearest, (o) => o.c, problem, rng);
  });
}

/** Perkiraan jumlah destinasi yang muat dalam batas jam (untuk panjang rute individu acak). */
export function typicalRouteLength(problem: Problem): number {
  let visit = 0;
  let travel = 0;
  for (let i = 0; i < problem.n; i++) visit += problem.visit[i] as number;
  for (let i = 0; i < problem.travelH.length; i++) travel += problem.travelH[i] as number;
  const perStop = visit / problem.n + (problem.n > 1 ? travel / (problem.n * (problem.n - 1)) : 0);
  return Math.max(1, Math.min(problem.n, Math.round(problem.targetHours / Math.max(perStop, 1e-6))));
}

export function initialPopulation(problem: Problem, config: GAConfig, rng: Rng): Chromosome[] {
  const population: Chromosome[] = [];
  const seeds = Math.round(config.populationSize * config.greedySeedRatio);
  for (let i = 0; i < seeds; i++) population.push(fromRoute(problem.n, greedySeedRoute(problem, rng), rng));
  const maxLength = typicalRouteLength(problem);
  while (population.length < config.populationSize) population.push(randomChromosome(problem.n, rng.int(1, maxLength), rng));
  return population;
}

// ---- Arsip top-K ----------------------------------------------------------------------------------------

export interface Plan {
  route: number[];
  evaluation: Evaluation;
}

const setDifference = (a: readonly number[], b: readonly number[]): number => {
  const sb = new Set(b);
  const sa = new Set(a);
  return a.filter((x) => !sb.has(x)).length + b.filter((x) => !sa.has(x)).length;
};
export { setDifference };

/** Menyimpan rencana terbaik per HIMPUNAN destinasi selama run (urutan terbaiknya yang disimpan). */
export class PlanArchive {
  private plans = new Map<string, Plan>();

  add(route: number[], evaluation: Evaluation): void {
    if (route.length === 0) return;
    const key = [...route].sort((a, b) => a - b).join(',');
    const old = this.plans.get(key);
    if (old && old.evaluation.fitness >= evaluation.fitness) return;
    this.plans.set(key, { route: [...route], evaluation });
    if (this.plans.size > 600) {
      const kept = this.sorted().slice(0, 300);
      this.plans = new Map(kept.map((p) => [[...p.route].sort((a, b) => a - b).join(','), p]));
    }
  }

  /** Valid lebih dulu, lalu yang jadwal hariannya muat, lalu fitness tertinggi. */
  sorted(): Plan[] {
    const rank = (p: Plan) => Number(p.evaluation.valid) * 2 + Number(p.evaluation.scheduleFits);
    return [...this.plans.values()].sort((a, b) => rank(b) - rank(a) || b.evaluation.fitness - a.evaluation.fitness);
  }

  /** Top-K rencana yang saling berbeda minimal `minDifference` destinasi. */
  top(k: number, minDifference: number): Plan[] {
    const chosen: Plan[] = [];
    for (const plan of this.sorted()) {
      if (chosen.every((c) => setDifference(c.route, plan.route) >= minDifference)) chosen.push(plan);
      if (chosen.length >= k) break;
    }
    return chosen;
  }
}

// ---- Run GA -------------------------------------------------------------------------------------------

export interface GenerationStats {
  generation: number;
  bestFitness: number;
  meanFitness: number;
  /** Porsi individu valid di populasi. */
  validRate: number;
  evaluations: number;
}

export interface PopulationPoint {
  costError: number;
  durationError: number;
  fitness: number;
  valid: boolean;
}

export interface GAResult {
  /** Top-K rencana berbeda (valid lebih dulu). */
  top: Plan[];
  history: GenerationStats[];
  /** Populasi akhir: error biaya vs error durasi (untuk grafik sebaran). */
  finalPopulation: PopulationPoint[];
  generations: number;
  evaluations: number;
  stopReason: 'generasi maksimum' | 'stagnasi' | 'dibatalkan';
  elapsedMs: number;
}

export interface GAHooks {
  onGeneration?: (stats: GenerationStats) => void;
  shouldStop?: () => boolean;
}

interface Individual {
  chromosome: Chromosome;
  route: number[];
  evaluation: Evaluation;
}

export function runGA(problem: Problem, configInput: Partial<GAConfig>, rng: Rng, hooks: GAHooks = {}): GAResult {
  const config = gaConfigSchema.parse({ ...DEFAULT_CONFIG, ...configInput });
  const startedAt = performance.now();
  const neighbors: Neighbors = { list: problem.neighbors, count: problem.neighborCount };
  const archive = new PlanArchive();
  const history: GenerationStats[] = [];
  let evaluations = 0;

  const evaluate = (chromosome: Chromosome): Individual => {
    const route = decode(chromosome);
    evaluations++;
    const evaluation = evaluateRoute(problem, route);
    archive.add(route, evaluation);
    return { chromosome, route, evaluation };
  };

  const record = (generation: number, population: Individual[]) => {
    const fitness = population.map((ind) => ind.evaluation.fitness);
    const stats: GenerationStats = {
      generation,
      bestFitness: Math.max(...fitness),
      meanFitness: fitness.reduce((s, f) => s + f, 0) / fitness.length,
      validRate: population.filter((ind) => ind.evaluation.valid).length / population.length,
      evaluations,
    };
    history.push(stats);
    hooks.onGeneration?.(stats);
    return stats;
  };

  // 1. Populasi awal
  let population = initialPopulation(problem, config, rng).map(evaluate);
  let best = record(0, population).bestFitness;
  let sinceImprovement = 0;
  let stopReason: GAResult['stopReason'] = 'generasi maksimum';
  let generation = 0;

  // 2. Evolusi
  while (generation < config.maxGenerations) {
    if (hooks.shouldStop?.()) {
      stopReason = 'dibatalkan';
      break;
    }
    generation++;
    const fitness = population.map((ind) => ind.evaluation.fitness);
    const spin = config.selection === 'roulette' ? rouletteSampler(fitness) : null;
    const select = () => (population[spin ? spin(rng) : tournamentSelect(fitness, config.tournamentSize, rng)] as Individual).chromosome;

    // Elitisme: individu terbaik disalin tanpa diubah.
    const next = [...population].sort((a, b) => b.evaluation.fitness - a.evaluation.fitness).slice(0, config.eliteCount);
    while (next.length < config.populationSize) {
      const p1 = select();
      const p2 = select();
      let children: [Chromosome, Chromosome];
      if (rng.next() < config.crossoverRate) {
        const [m1, m2] = (config.maskCrossover === 'uniform' ? uniformCrossover : onePointCrossover)(p1.mask, p2.mask, rng);
        const [o1, o2] = orderCrossoverPair(p1.order, p2.order, rng);
        children = [
          { mask: m1, order: o1 },
          { mask: m2, order: o2 },
        ];
      } else {
        children = [cloneChromosome(p1), cloneChromosome(p2)];
      }
      for (const child of children) {
        if (next.length >= config.populationSize) break;
        mutate(child, config.mutationRate, rng, neighbors);
        next.push(evaluate(child));
      }
    }
    population = next;

    // 3. Kriteria berhenti
    const stats = record(generation, population);
    if (stats.bestFitness > best * (1 + 1e-12)) {
      best = stats.bestFitness;
      sinceImprovement = 0;
    } else if (config.stagnationLimit > 0 && ++sinceImprovement >= config.stagnationLimit) {
      stopReason = 'stagnasi';
      break;
    }
  }

  // 4. Top-K rencana berbeda
  return {
    top: archive.top(config.topK, config.minPlanDifference),
    history,
    finalPopulation: population.map((ind) => ({
      costError: ind.evaluation.costError,
      durationError: ind.evaluation.durationError,
      fitness: ind.evaluation.fitness,
      valid: ind.evaluation.valid,
    })),
    generations: generation,
    evaluations,
    stopReason,
    elapsedMs: performance.now() - startedAt,
  };
}
