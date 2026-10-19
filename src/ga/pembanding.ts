import { createRng, type Rng } from './acak';
import { evaluateRoute, type Evaluation, type Problem } from './fitness';
import { DEFAULT_CONFIG, buildGreedyRoute, feasibleStarts, runGA, typicalRouteLength, type GAConfig } from './ga';
import { decode, randomChromosome } from './kromosom';

/**
 * LANGKAH 5 — PEMBANDING & EKSPERIMEN
 * Untuk membuktikan GA efektif, hasilnya dibandingkan dengan:
 *   - Greedy termurah dulu : mulai dari HTM termurah, lalu tambah destinasi dengan biaya tambahan terkecil
 *   - Greedy terdekat dulu : mulai dari destinasi acak, lalu tambah destinasi terdekat
 *   - Pencarian acak       : rute acak sebanyak jumlah evaluasi GA, ambil yang terbaik
 * Semua memakai fungsi fitness yang sama dan dijalankan berkali-kali dengan seed berbeda.
 */

export type Method = 'ga' | 'greedyTermurah' | 'greedyTerdekat' | 'acak';
export const METHOD_LABELS: Record<Method, string> = {
  ga: 'Algoritma Genetika',
  greedyTermurah: 'Greedy termurah dulu',
  greedyTerdekat: 'Greedy terdekat dulu',
  acak: 'Pencarian acak',
};

export interface MethodResult {
  route: number[];
  evaluation: Evaluation;
  evaluations: number;
}

const empty = (problem: Problem): MethodResult => ({ route: [], evaluation: evaluateRoute(problem, []), evaluations: 1 });

/** Greedy termurah dulu (deterministik). */
export function greedyCheapest(problem: Problem): MethodResult {
  const starts = feasibleStarts(problem);
  if (starts.length === 0) return empty(problem);
  const start = starts.reduce((a, b) => ((problem.ticket[b] as number) < (problem.ticket[a] as number) ? b : a));
  const route = buildGreedyRoute(problem, start, (options) =>
    options.reduce((a, b) => (b.addCost < a.addCost || (b.addCost === a.addCost && b.travel < a.travel) ? b : a)),
  );
  return { route, evaluation: evaluateRoute(problem, route), evaluations: 1 };
}

/** Greedy terdekat dulu (tetangga terdekat dari titik awal acak). */
export function greedyNearest(problem: Problem, rng: Rng): MethodResult {
  const starts = feasibleStarts(problem);
  if (starts.length === 0) return empty(problem);
  const route = buildGreedyRoute(problem, rng.pick(starts), (options) => options.reduce((a, b) => (b.travel < a.travel ? b : a)));
  return { route, evaluation: evaluateRoute(problem, route), evaluations: 1 };
}

/** Pencarian acak dengan jumlah evaluasi tertentu. Rencana valid diutamakan, lalu fitness tertinggi. */
export function randomSearch(problem: Problem, evaluations: number, rng: Rng): MethodResult {
  const maxLength = typicalRouteLength(problem);
  let best: MethodResult | null = null;
  for (let i = 0; i < evaluations; i++) {
    const route = decode(randomChromosome(problem.n, rng.int(1, maxLength), rng));
    const evaluation = evaluateRoute(problem, route);
    if (
      !best ||
      (evaluation.valid && !best.evaluation.valid) ||
      (evaluation.valid === best.evaluation.valid && evaluation.fitness > best.evaluation.fitness)
    ) {
      best = { route, evaluation, evaluations };
    }
  }
  return best ?? empty(problem);
}

// ---- Statistik ----------------------------------------------------------------------------------------

export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
export const stdDev = (xs: readonly number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

export interface MethodSummary {
  method: Method;
  label: string;
  runs: number;
  meanFitness: number;
  sdFitness: number;
  bestFitness: number;
  /** Porsi run yang rekomendasinya VALID. */
  validRate: number;
  meanCost: number;
  meanHours: number;
  meanMs: number;
  meanEvaluations: number;
}

interface Run {
  method: Method;
  fitness: number;
  valid: boolean;
  cost: number;
  hours: number;
  ms: number;
  evaluations: number;
}

function summarize(method: Method, runs: Run[]): MethodSummary {
  const fitness = runs.map((r) => r.fitness);
  return {
    method,
    label: METHOD_LABELS[method],
    runs: runs.length,
    meanFitness: mean(fitness),
    sdFitness: stdDev(fitness),
    bestFitness: Math.max(...fitness),
    validRate: runs.filter((r) => r.valid).length / runs.length,
    meanCost: mean(runs.map((r) => r.cost)),
    meanHours: mean(runs.map((r) => r.hours)),
    meanMs: mean(runs.map((r) => r.ms)),
    meanEvaluations: mean(runs.map((r) => r.evaluations)),
  };
}

export type Progress = (done: number, total: number, label: string) => void;

const timed = <T>(fn: () => T): [T, number] => {
  const t0 = performance.now();
  const value = fn();
  return [value, performance.now() - t0];
};

/** Menjalankan keempat metode untuk setiap seed. Pencarian acak memakai jumlah evaluasi yang sama dengan GA. */
export function compareMethods(problem: Problem, seeds: number[], config: Partial<GAConfig> = {}, onProgress?: Progress): MethodSummary[] {
  const runs: Run[] = [];
  const push = (method: Method, r: MethodResult, ms: number) =>
    runs.push({
      method,
      fitness: r.evaluation.fitness,
      valid: r.evaluation.valid,
      cost: r.evaluation.totalCost,
      hours: r.evaluation.totalHours,
      ms,
      evaluations: r.evaluations,
    });

  seeds.forEach((seed, i) => {
    onProgress?.(i, seeds.length, `Seed ${seed}`);
    const [ga, gaMs] = timed(() => runGA(problem, { ...config, seed }, createRng(seed)));
    const best = ga.top[0];
    push('ga', best ? { route: best.route, evaluation: best.evaluation, evaluations: ga.evaluations } : empty(problem), gaMs);
    const [cheap, cheapMs] = timed(() => greedyCheapest(problem));
    push('greedyTermurah', cheap, cheapMs);
    const [near, nearMs] = timed(() => greedyNearest(problem, createRng(seed)));
    push('greedyTerdekat', near, nearMs);
    const [rand, randMs] = timed(() => randomSearch(problem, ga.evaluations, createRng(seed)));
    push('acak', rand, randMs);
  });
  onProgress?.(seeds.length, seeds.length, 'Selesai');
  return (Object.keys(METHOD_LABELS) as Method[]).map((m) => summarize(m, runs.filter((r) => r.method === m)));
}

/** Nilai parameter yang diuji pada analisis sensitivitas (satu parameter diubah, sisanya default). */
export const SENSITIVITY_GRID = {
  populationSize: [25, 50, 100, 200],
  mutationRate: [0.01, 0.05, 0.1, 0.2],
  crossoverRate: [0.4, 0.6, 0.8, 0.95],
} as const;
export type SensitivityParameter = keyof typeof SENSITIVITY_GRID;
export const PARAMETER_LABELS: Record<SensitivityParameter, string> = {
  populationSize: 'Ukuran populasi',
  mutationRate: 'Peluang mutasi',
  crossoverRate: 'Peluang crossover',
};

export interface SensitivityPoint {
  parameter: SensitivityParameter;
  value: number;
  isDefault: boolean;
  meanFitness: number;
  sdFitness: number;
  validRate: number;
  meanMs: number;
}

export function sensitivityAnalysis(problem: Problem, seeds: number[], config: Partial<GAConfig> = {}, onProgress?: Progress): SensitivityPoint[] {
  const base = { ...DEFAULT_CONFIG, ...config };
  const points: SensitivityPoint[] = [];
  const total = Object.values(SENSITIVITY_GRID).reduce((s, values) => s + values.length, 0) * seeds.length;
  let done = 0;
  for (const parameter of Object.keys(SENSITIVITY_GRID) as SensitivityParameter[]) {
    for (const value of SENSITIVITY_GRID[parameter]) {
      const fitness: number[] = [];
      const ms: number[] = [];
      let valid = 0;
      for (const seed of seeds) {
        onProgress?.(done++, total, `${PARAMETER_LABELS[parameter]} = ${value}`);
        const [r, t] = timed(() => runGA(problem, { ...base, [parameter]: value, seed }, createRng(seed)));
        fitness.push(r.top[0]?.evaluation.fitness ?? 0);
        if (r.top[0]?.evaluation.valid) valid++;
        ms.push(t);
      }
      points.push({
        parameter,
        value,
        isDefault: base[parameter] === value,
        meanFitness: mean(fitness),
        sdFitness: stdDev(fitness),
        validRate: valid / seeds.length,
        meanMs: mean(ms),
      });
    }
  }
  onProgress?.(total, total, 'Selesai');
  return points;
}
