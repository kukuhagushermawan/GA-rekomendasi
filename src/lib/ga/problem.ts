import { auditDataset } from '../data/audit';
import { rawDistanceM, rawDurationS, type Dataset } from '../data/load';
import type { Attraction } from '../data/schema';
import { MISSING_CELL } from '../data/units';
import {
  DEFAULT_COST_MODEL,
  DEFAULT_WEIGHTS,
  tripInputSchema,
  type CostModel,
  type FitnessWeights,
  type TripInput,
} from './config';

/**
 * Instans masalah yang sudah dipadatkan untuk evaluasi cepat. GA bekerja dengan indeks KANDIDAT lokal
 * (0..n-1); `candidates[i]` memetakan kembali ke indeks atraksi di dataset.
 */
export interface Problem {
  readonly input: TripInput;
  readonly costModel: CostModel;
  readonly weights: FitnessWeights;
  readonly attractions: readonly Attraction[];
  readonly candidates: Int32Array;
  readonly n: number;
  /** HTM per orang (Rp), per kandidat. */
  readonly ticket: Float64Array;
  /** Lama kunjungan (jam), per kandidat. */
  readonly visit: Float64Array;
  /** Jarak (km) n×n row-major, sel -1/0 di luar diagonal sudah diganti nilai pengganti. */
  readonly distKm: Float64Array;
  /** Waktu tempuh (jam) n×n row-major, aturan pengganti yang sama. */
  readonly travelH: Float64Array;
  /** Skor kecocokan preferensi per kandidat di [0, 1]. */
  readonly preference: Float64Array;
  /** `neighborCount` kandidat terdekat (waktu tempuh keluar) per kandidat, row-major. */
  readonly neighbors: Int32Array;
  readonly neighborCount: number;
  /** Batas jam total = hari × jam per hari. */
  readonly targetHours: number;
  readonly vehicles: number;
  readonly excluded: readonly ExcludedAttraction[];
}

export interface ExcludedAttraction {
  index: number;
  name: string;
  reason: 'jarak-tidak-masuk-akal' | 'tidak-terjangkau' | 'tag-tidak-cocok' | 'dikecualikan-manual';
}

export interface ProblemOptions {
  costModel?: CostModel;
  weights?: FitnessWeights;
  /**
   * Keluarkan atraksi bermasalah menurut audit (jarak > ambang & tidak terjangkau) dari kumpulan kandidat.
   * Data tidak diubah. Default true (keputusan milestone 1 §7.1).
   */
  excludeSuspect?: boolean;
  /** Hanya kandidat yang memiliki minimal satu tag ini (perilaku `getTaggedDest` upstream). */
  requireAnyTag?: readonly string[];
  excludeNames?: readonly string[];
}

/** Jumlah tetangga terdekat yang dipakai mutasi tambah-lokal. */
export const NEIGHBOR_COUNT = 10;

/** Skor preferensi destinasi = bobot tertinggi di antara tag-nya, dinormalisasi ke bobot maksimum masukan. */
export function preferenceOf(tags: readonly string[], tagWeights: Readonly<Record<string, number>>): number {
  const max = Math.max(0, ...Object.values(tagWeights));
  if (max <= 0) return 0;
  let best = 0;
  for (const t of tags) best = Math.max(best, tagWeights[t] ?? 0);
  return best / max;
}

export function buildProblem(dataset: Dataset, input: TripInput, options: ProblemOptions = {}): Problem {
  const trip = tripInputSchema.parse(input);
  const costModel = options.costModel ?? DEFAULT_COST_MODEL;
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const { attractions, matrices } = dataset;

  const excluded: ExcludedAttraction[] = [];
  const reasonByIndex = new Map<number, ExcludedAttraction['reason']>();
  if (options.excludeSuspect ?? true) {
    const audit = auditDataset(dataset);
    const suspect = new Set(audit.implausibleDistance.places.map((p) => p.name));
    const unroutable = new Set(audit.unroutable);
    attractions.forEach((a, i) => {
      if (unroutable.has(a.name)) reasonByIndex.set(i, 'tidak-terjangkau');
      else if (suspect.has(a.name)) reasonByIndex.set(i, 'jarak-tidak-masuk-akal');
    });
  }
  const manual = new Set(options.excludeNames ?? []);
  const required = options.requireAnyTag;
  attractions.forEach((a, i) => {
    if (reasonByIndex.has(i)) return;
    if (manual.has(a.name)) reasonByIndex.set(i, 'dikecualikan-manual');
    else if (required && !a.tags.some((t) => required.includes(t))) reasonByIndex.set(i, 'tag-tidak-cocok');
  });
  for (const [index, reason] of [...reasonByIndex].sort((a, b) => a[0] - b[0])) {
    excluded.push({ index, name: (attractions[index] as Attraction).name, reason });
  }

  const candidates = Int32Array.from(attractions.map((_, i) => i).filter((i) => !reasonByIndex.has(i)));
  const n = candidates.length;
  if (n === 0) throw new Error('Tidak ada kandidat destinasi setelah penyaringan');

  const ticket = new Float64Array(n);
  const visit = new Float64Array(n);
  const preference = new Float64Array(n);
  const distKm = new Float64Array(n * n);
  const travelH = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const a = attractions[candidates[i] as number] as Attraction;
    ticket[i] = a.ticketPriceIdr;
    visit[i] = a.visitHours;
    preference[i] = preferenceOf(a.tags, trip.tagWeights);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const from = candidates[i] as number;
      const to = candidates[j] as number;
      const m = rawDistanceM(matrices, from, to);
      const s = rawDurationS(matrices, from, to);
      distKm[i * n + j] = (m === MISSING_CELL || m === 0 ? costModel.fallbackDistanceM : m) / 1000;
      travelH[i * n + j] = (s === MISSING_CELL || s === 0 ? costModel.fallbackDurationS : s) / 3600;
    }
  }

  const neighborCount = Math.min(NEIGHBOR_COUNT, n - 1);
  const neighbors = new Int32Array(n * neighborCount);
  for (let i = 0; i < n; i++) {
    const others = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i);
    others.sort((a, b) => (travelH[i * n + a] as number) - (travelH[i * n + b] as number) || a - b);
    neighbors.set(others.slice(0, neighborCount), i * neighborCount);
  }

  return {
    input: trip,
    costModel,
    weights,
    attractions,
    candidates,
    n,
    ticket,
    visit,
    distKm,
    travelH,
    preference,
    neighbors,
    neighborCount,
    targetHours: trip.days * trip.hoursPerDay,
    vehicles: Math.ceil(trip.people / costModel.seatsPerVehicle),
    excluded,
  };
}
