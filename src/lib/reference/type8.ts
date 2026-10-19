import type { Attraction } from '../data/schema';
import type { TravelMatrices } from '../data/load';
import type { Rng } from '../random';
import { UPSTREAM } from './constants';
import { evaluateV1, type EvalContext, type Evaluated } from './evaluate';
import { crossv2, generateDynamic, getTaggedDest, selection } from './operators';

/**
 * Port perilaku `type8` (main.py) — satu-satunya varian GA yang dijalankan upstream.
 *
 *   eligible   = getTaggedDest(genePool, tags)
 *   population = generateDynamic(eligible, …, 0.75)          # 40 kromosom
 *   evaluate(population); bestSoFar = [population[0]]         # elemen PERTAMA, belum diurutkan
 *   while counter < repRate and bestSoFar[0].fitness < 1.2:   # repRate = 8 dari main.py
 *       selected = selection(currGen)                         # turnamen biner (ber-bug)
 *       nextGen  = selectionNextGen(eligible, selected, …)    # crossv2 berpasangan, tanpa mutasi, tanpa elitisme
 *       evaluate(nextGen); sort desc; bestSoFar.append(nextGen[0])
 *   return sorted(bestSoFar, desc)                            # 1 + jumlah generasi entri
 *
 * `epochs` dan `mutationRate` diterima main.py tetapi tidak dipakai di sini.
 */
export interface Type8Options {
  attractions: readonly Attraction[];
  matrices: TravelMatrices;
  nPeople: number;
  budget: number;
  days: number;
  tags: readonly string[];
  rng: Rng;
  /** `repRate` di Python. Default 8 sesuai main.py. */
  generations?: number;
  evaluate?: (genes: number[], ctx: EvalContext) => Evaluated;
}

export interface Type8Result {
  /** bestSoFar setelah diurutkan menurun berdasarkan fitness (yang ditulis ke newresults.txt). */
  results: Evaluated[];
  /** bestSoFar sebelum diurutkan: [populasi awal[0], terbaik gen-1, …]. */
  history: Evaluated[];
  generationsRun: number;
  eligibleCount: number;
}

const byFitnessDesc = (a: Evaluated, b: Evaluated): number => b.fitness - a.fitness;

export function runType8(options: Type8Options): Type8Result {
  const { attractions, matrices, nPeople, budget, days, tags, rng } = options;
  const repRate = options.generations ?? UPSTREAM.GENERATIONS;
  const evaluate = options.evaluate ?? evaluateV1;
  const ctx: EvalContext = { attractions, matrices, budget, nPeople, days };

  const eligible = getTaggedDest(attractions, tags);
  if (eligible.length === 0) throw new Error(`Tidak ada atraksi dengan tag: ${tags.join(', ')}`);

  const initial = generateDynamic(eligible, attractions, days, budget, nPeople, UPSTREAM.INIT_COST_RATE, rng);
  const population = initial.map((genes) => evaluate(genes, ctx));
  const bestSoFar: Evaluated[] = [population[0] as Evaluated];

  let currGen = population;
  let counter = 0;
  while (counter < repRate && (bestSoFar[0] as Evaluated).fitness < UPSTREAM.STOP_FITNESS) {
    const selected = selection(currGen, rng);
    const nextGenes: number[][] = [];
    for (let i = 0; i < selected.length; i += 2) {
      const [x, y] = crossv2(
        eligible,
        (selected[i] as Evaluated).genes,
        (selected[i + 1] as Evaluated).genes,
        attractions,
        days,
        budget,
        nPeople,
        rng,
      );
      nextGenes.push(x, y);
    }
    // Array.prototype.sort stabil (ES2019), sama seperti list.sort Python.
    const nextGen = nextGenes.map((genes) => evaluate(genes, ctx)).sort(byFitnessDesc);
    bestSoFar.push(nextGen[0] as Evaluated);
    currGen = nextGen;
    counter += 1;
  }

  return {
    results: [...bestSoFar].sort(byFitnessDesc),
    history: bestSoFar,
    generationsRun: counter,
    eligibleCount: eligible.length,
  };
}
