import type { Rng } from '../random';
import { DEFAULT_GA_CONFIG, gaConfigSchema, type GAConfig } from './config';
import { cloneChromosome, decode, fromRoute, randomChromosome, type Chromosome } from './chromosome';
import { evaluateRoute, type Evaluation } from './evaluate';
import {
  mutate,
  onePointMaskCrossover,
  orderCrossoverPair,
  rouletteSampler,
  tournamentSelect,
  uniformMaskCrossover,
} from './operators';
import type { Problem } from './problem';
import { greedySeedRoute } from './seeding';

export interface Individual {
  chromosome: Chromosome;
  route: number[];
  evaluation: Evaluation;
}

export interface GenerationStats {
  generation: number;
  bestFitness: number;
  meanFitness: number;
  worstFitness: number;
  /** Porsi individu valid di populasi. */
  validRate: number;
  bestCostError: number;
  bestDurationError: number;
  bestValid: boolean;
  /** Evaluasi kumulatif sejak awal run. */
  evaluations: number;
}

export interface PopulationPoint {
  costError: number;
  durationError: number;
  fitness: number;
  valid: boolean;
}

export interface ArchivedPlan {
  /** Indeks kandidat lokal, berurutan. */
  route: number[];
  evaluation: Evaluation;
  /** Generasi saat himpunan destinasi ini pertama kali mencapai fitness tersebut. */
  generation: number;
}

export type StopReason = 'maxGenerations' | 'stagnation' | 'cancelled';

export interface GAResult {
  /** Top-K rencana berbeda: valid lebih dulu, lalu fitness. */
  top: ArchivedPlan[];
  /** Rekomendasi utama = top[0]. */
  best: ArchivedPlan;
  /** Fitness tertinggi sepanjang run, tanpa memandang validitas. */
  bestOverall: ArchivedPlan;
  history: GenerationStats[];
  finalPopulation: PopulationPoint[];
  generations: number;
  evaluations: number;
  stopReason: StopReason;
  elapsedMs: number;
  config: GAConfig;
}

export interface GAHooks {
  /** Dipanggil setelah setiap generasi (termasuk generasi 0). */
  onGeneration?: (stats: GenerationStats) => void;
  /** Kembalikan true untuk menghentikan run (mis. tombol batal di UI). */
  shouldStop?: () => boolean;
  now?: () => number;
}

const routeKey = (route: readonly number[]): string => [...route].sort((a, b) => a - b).join(',');

/** Selisih simetris dua himpunan destinasi. */
export function setDifference(a: readonly number[], b: readonly number[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let diff = 0;
  for (const x of sa) if (!sb.has(x)) diff++;
  for (const x of sb) if (!sa.has(x)) diff++;
  return diff;
}

/**
 * Arsip rencana terbaik sepanjang run, unik per HIMPUNAN destinasi (urutan terbaik yang disimpan).
 * Ukurannya dibatasi agar memori tetap kecil.
 */
export class PlanArchive {
  private readonly plans = new Map<string, ArchivedPlan>();

  constructor(private readonly capacity = 300) {}

  add(route: number[], evaluation: Evaluation, generation: number): void {
    if (route.length === 0) return;
    const key = routeKey(route);
    const existing = this.plans.get(key);
    if (existing && existing.evaluation.fitness >= evaluation.fitness) return;
    this.plans.set(key, { route: [...route], evaluation, generation });
    if (this.plans.size > this.capacity * 2) this.prune();
  }

  private prune(): void {
    const kept = this.sorted().slice(0, this.capacity);
    this.plans.clear();
    for (const p of kept) this.plans.set(routeKey(p.route), p);
  }

  /** Rencana dengan fitness tertinggi, tanpa memandang validitas. */
  highestFitness(): ArchivedPlan | undefined {
    let best: ArchivedPlan | undefined;
    for (const p of this.plans.values()) if (!best || p.evaluation.fitness > best.evaluation.fitness) best = p;
    return best;
  }

  /** Valid lebih dulu, lalu fitness menurun. */
  sorted(): ArchivedPlan[] {
    return [...this.plans.values()].sort(
      (a, b) =>
        Number(b.evaluation.valid) - Number(a.evaluation.valid) || b.evaluation.fitness - a.evaluation.fitness,
    );
  }

  /** Top-K rencana yang saling berbeda minimal `minDifference` destinasi. */
  topDistinct(k: number, minDifference: number): ArchivedPlan[] {
    const chosen: ArchivedPlan[] = [];
    for (const plan of this.sorted()) {
      if (chosen.every((c) => setDifference(c.route, plan.route) >= minDifference)) chosen.push(plan);
      if (chosen.length >= k) break;
    }
    return chosen;
  }
}

/** Batas atas panjang rute untuk individu acak: kira-kira berapa destinasi muat dalam batas jam. */
function randomRouteLengthCap(problem: Problem): number {
  const { n } = problem;
  let visit = 0;
  for (let i = 0; i < n; i++) visit += problem.visit[i] as number;
  let travel = 0;
  for (let i = 0; i < problem.travelH.length; i++) travel += problem.travelH[i] as number;
  const meanStop = visit / n + (n > 1 ? travel / (n * (n - 1)) : 0);
  return Math.max(1, Math.min(n, Math.round(problem.targetHours / Math.max(meanStop, 1e-6))));
}

export function initialPopulation(problem: Problem, config: GAConfig, rng: Rng): Chromosome[] {
  const seeds = Math.round(config.populationSize * config.greedySeedRatio);
  const cap = randomRouteLengthCap(problem);
  const population: Chromosome[] = [];
  for (let i = 0; i < seeds; i++) population.push(fromRoute(problem.n, greedySeedRoute(problem, rng), rng));
  while (population.length < config.populationSize) {
    population.push(randomChromosome(problem.n, rng.int(1, cap), rng));
  }
  return population;
}

export function runGA(problem: Problem, configInput: Partial<GAConfig> = {}, rng: Rng, hooks: GAHooks = {}): GAResult {
  const config = gaConfigSchema.parse({ ...DEFAULT_GA_CONFIG, ...configInput });
  const now = hooks.now ?? (() => performance.now());
  const startedAt = now();
  let evaluations = 0;

  const evaluate = (chromosome: Chromosome): Individual => {
    const route = decode(chromosome);
    evaluations++;
    return { chromosome, route, evaluation: evaluateRoute(problem, route) };
  };

  const mutationContext = {
    neighbors: problem.neighbors,
    neighborCount: problem.neighborCount,
    localAddRate: config.localAddRate,
  };
  const archive = new PlanArchive();
  const history: GenerationStats[] = [];
  let population = initialPopulation(problem, config, rng).map(evaluate);

  const record = (generation: number) => {
    let best = population[0] as Individual;
    let sum = 0;
    let worst = Infinity;
    let valid = 0;
    for (const ind of population) {
      const f = ind.evaluation.fitness;
      sum += f;
      worst = Math.min(worst, f);
      if (ind.evaluation.valid) valid++;
      if (f > best.evaluation.fitness) best = ind;
      archive.add(ind.route, ind.evaluation, generation);
    }
    const stats: GenerationStats = {
      generation,
      bestFitness: best.evaluation.fitness,
      meanFitness: sum / population.length,
      worstFitness: worst,
      validRate: valid / population.length,
      bestCostError: best.evaluation.costError,
      bestDurationError: best.evaluation.durationError,
      bestValid: best.evaluation.valid,
      evaluations,
    };
    history.push(stats);
    hooks.onGeneration?.(stats);
    return stats;
  };

  let bestSoFar = record(0).bestFitness;
  let sinceImprovement = 0;
  let stopReason: StopReason = 'maxGenerations';
  let generation = 0;

  while (generation < config.maxGenerations) {
    if (hooks.shouldStop?.()) {
      stopReason = 'cancelled';
      break;
    }
    generation++;

    const ranked = [...population].sort((a, b) => b.evaluation.fitness - a.evaluation.fitness);
    const fitness = population.map((ind) => ind.evaluation.fitness);
    const roulette = config.selection === 'roulette' ? rouletteSampler(fitness) : null;
    const select = (): Individual =>
      population[roulette ? roulette(rng) : tournamentSelect(fitness, config.tournamentSize, rng)] as Individual;

    // Elitisme: individu terbaik disalin utuh beserta evaluasinya (tidak dievaluasi ulang).
    const next: Individual[] = ranked.slice(0, config.eliteCount);
    while (next.length < config.populationSize) {
      const p1 = select().chromosome;
      const p2 = select().chromosome;
      let c1: Chromosome;
      let c2: Chromosome;
      if (rng.next() < config.crossoverRate) {
        const [m1, m2] = (config.maskCrossover === 'uniform' ? uniformMaskCrossover : onePointMaskCrossover)(
          p1.mask,
          p2.mask,
          rng,
        );
        const [o1, o2] = orderCrossoverPair(p1.order, p2.order, rng);
        c1 = { mask: m1, order: o1 };
        c2 = { mask: m2, order: o2 };
      } else {
        c1 = cloneChromosome(p1);
        c2 = cloneChromosome(p2);
      }
      mutate(c1, config.mutationRate, rng, mutationContext);
      mutate(c2, config.mutationRate, rng, mutationContext);
      next.push(evaluate(c1));
      if (next.length < config.populationSize) next.push(evaluate(c2));
    }
    population = next;

    const stats = record(generation);
    if (stats.bestFitness > bestSoFar * (1 + 1e-12)) {
      bestSoFar = stats.bestFitness;
      sinceImprovement = 0;
    } else {
      sinceImprovement++;
    }
    if (config.stagnationLimit > 0 && sinceImprovement >= config.stagnationLimit) {
      stopReason = 'stagnation';
      break;
    }
  }

  const top = archive.topDistinct(config.topK, config.minPlanDifference);
  const bestIndividual = population.reduce((a, b) => (b.evaluation.fitness > a.evaluation.fitness ? b : a));
  const fallback = { route: bestIndividual.route, evaluation: bestIndividual.evaluation, generation };
  return {
    top,
    best: top[0] ?? fallback,
    bestOverall: archive.highestFitness() ?? fallback,
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
    elapsedMs: now() - startedAt,
    config,
  };
}
