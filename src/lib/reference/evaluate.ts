import type { Attraction } from '../data/schema';
import { rawDistanceM, rawDurationS, type TravelMatrices } from '../data/load';
import { UPSTREAM } from './constants';

/**
 * Port perilaku `evaluateV1` / `evaluateV3` dari utils.py (GPL-3.0).
 * Urutan operasi aritmetika sengaja disamakan (mis. `s / 60 / 60`, bukan `s / 3600`)
 * agar hasil floating-point identik dengan Python.
 */

export interface EvalContext {
  attractions: readonly Attraction[];
  matrices: TravelMatrices;
  budget: number;
  nPeople: number;
  /** Jumlah hari (argumen `duration` di Python). */
  days: number;
}

/** Padanan elemen populasi Python `[Chromosome, fitness, totalCost, totalDuration, travelExpenses, travelDuration]`. */
export interface Evaluated {
  /** Indeks atraksi; boleh berisi duplikat karena operator upstream tidak selalu mencegahnya. */
  genes: number[];
  fitness: number;
  /** Rupiah: HTM × orang + biaya taksi. */
  totalCost: number;
  /** Jam: lama kunjungan + waktu tempuh. */
  totalHours: number;
  /** Rupiah. */
  travelExpenses: number;
  /** Jam. */
  travelHours: number;
}

export interface TravelTotals {
  meters: number;
  seconds: number;
}

/** Jumlah jarak & durasi antar-gen berurutan, dengan pengganti 15000 m / 1300 s untuk sel -1 atau 0. */
export function travelTotals(genes: readonly number[], matrices: TravelMatrices): TravelTotals {
  let meters = 0;
  let seconds = 0;
  for (let j = 0; j < genes.length - 1; j++) {
    const from = genes[j] as number;
    const to = genes[j + 1] as number;
    // Catatan: gen duplikat berurutan membaca sel diagonal (0 atau -1) → ikut memakai nilai pengganti.
    const distance = rawDistanceM(matrices, from, to);
    const duration = rawDurationS(matrices, from, to);
    meters += distance === -1 || distance === 0 ? UPSTREAM.FALLBACK_DISTANCE_M : distance;
    seconds += duration === -1 || duration === 0 ? UPSTREAM.FALLBACK_DURATION_S : duration;
  }
  return { meters, seconds };
}

/** Chromosome.sumCost() — HTM per orang, dijumlah sesuai urutan gen. */
export function sumCost(genes: readonly number[], attractions: readonly Attraction[]): number {
  let sum = 0;
  for (const g of genes) sum += (attractions[g] as Attraction).ticketPriceIdr;
  return sum;
}

/** Chromosome.sumDuration() — jam kunjungan, dijumlah sesuai urutan gen. */
export function sumDuration(genes: readonly number[], attractions: readonly Attraction[]): number {
  let sum = 0;
  for (const g of genes) sum += (attractions[g] as Attraction).visitHours;
  return sum;
}

interface Scores {
  costScore: number;
  durationScore: number;
  totalCost: number;
  totalHours: number;
  travelExpenses: number;
  travelHours: number;
}

function scores(genes: readonly number[], ctx: EvalContext): Scores {
  const travel = travelTotals(genes, ctx.matrices);
  const travelExpenses = (travel.meters / 1000) * UPSTREAM.TAXI_RATE_IDR_PER_KM;
  const totalCost = sumCost(genes, ctx.attractions) * ctx.nPeople + travelExpenses;
  const travelHours = travel.seconds / 60 / 60;
  const totalHours = sumDuration(genes, ctx.attractions) + travelHours;
  return {
    costScore: Math.abs(ctx.budget - totalCost) / UPSTREAM.COST_SCORE_DIVISOR,
    durationScore: Math.abs(totalHours - ctx.days * UPSTREAM.EVAL_HOURS_PER_DAY),
    totalCost,
    totalHours,
    travelExpenses,
    travelHours,
  };
}

/**
 * fitness = 1 / (costScore + durationScore)
 * costScore = |budget − (ΣHTM × nPeople + travelExpenses)| / 100000
 * durationScore = |(ΣvisitDuration + travelHours) − days × 10|
 * Python melempar ZeroDivisionError bila penyebut 0; di sini hasilnya Infinity.
 */
export function evaluateV1(genes: number[], ctx: EvalContext): Evaluated {
  const s = scores(genes, ctx);
  return {
    genes,
    fitness: 1 / (s.costScore + s.durationScore),
    totalCost: s.totalCost,
    totalHours: s.totalHours,
    travelExpenses: s.travelExpenses,
    travelHours: s.travelHours,
  };
}

/**
 * evaluateV3 = evaluateV1 + tagScore / jumlahGen, dengan tagScore = jumlah gen yang memiliki SEMUA tag preferensi.
 * Tidak dipakai oleh type8 di main.py; diport untuk kelengkapan.
 * Python melempar ZeroDivisionError untuk kromosom kosong; di sini hasilnya NaN.
 */
export function evaluateV3(genes: number[], ctx: EvalContext, prefTags: readonly string[]): Evaluated {
  const s = scores(genes, ctx);
  let tagScore = 0;
  for (const g of genes) {
    const tags = (ctx.attractions[g] as Attraction).tags;
    if (prefTags.every((t) => tags.includes(t))) tagScore += 1;
  }
  return {
    genes,
    fitness: 1 / (s.costScore + s.durationScore) + tagScore / genes.length,
    totalCost: s.totalCost,
    totalHours: s.totalHours,
    travelExpenses: s.travelExpenses,
    travelHours: s.travelHours,
  };
}
