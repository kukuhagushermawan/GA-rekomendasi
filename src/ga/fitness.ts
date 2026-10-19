import { z } from 'zod';
import { DIKECUALIKAN, type Attraction, type Dataset } from './data';

/**
 * LANGKAH 2 — FITNESS
 *   C = Σ HTM × orang + Σ jarak_km × Rp5.000 × ⌈orang/4⌉        biaya total (Rp)
 *   D = Σ lama kunjungan + Σ waktu tempuh                        durasi total (jam)
 *   VALID ⇔ C ≤ anggaran B  dan  D ≤ T = hari × jam/hari          (aturan slide)
 *
 *   cost_score     = |C − B| / B          duration_score = |D − T| / T
 *   penalti        = 10 × (kelebihan biaya + kelebihan durasi, relatif) + kelebihan jadwal harian / T
 *   fitness        = (1 + preferensi) / (0,01 + cost_score + duration_score + penalti)
 *
 * Tanpa penalti dan bonus, rumusnya = 1 / (cost_score + duration_score) seperti di slide
 * (Qomariyah & Kazakov, 2021). Bobot tiap komponen bisa diatur lewat `Weights`.
 */

export const tripInputSchema = z.object({
  /** Anggaran total rombongan (Rp). */
  budget: z.number().int().positive(),
  days: z.number().int().min(1).max(14),
  hoursPerDay: z.number().positive().max(24),
  people: z.number().int().min(1).max(50),
  /** Bobot preferensi per tag, 0–1. */
  tagWeights: z.record(z.string(), z.number().min(0).max(1)),
});
export type TripInput = z.infer<typeof tripInputSchema>;

/** Contoh di slide: Rp1.000.000, 5 hari × 7 jam, 2 orang. */
export const DEFAULT_TRIP: TripInput = { budget: 1_000_000, days: 5, hoursPerDay: 7, people: 2, tagWeights: {} };

export interface Weights {
  cost: number;
  duration: number;
  /** Penalti pelanggaran batas biaya/durasi. */
  violation: number;
  /** Penalti jadwal harian yang tidak muat. */
  schedule: number;
  /** Bonus kecocokan preferensi. */
  preference: number;
  epsilon: number;
}
export const DEFAULT_WEIGHTS: Weights = { cost: 1, duration: 1, violation: 10, schedule: 1, preference: 1, epsilon: 0.01 };

/** Tarif taksi per km (dari kode asli `TAXI_RATE`), per kendaraan berisi maks. 4 orang. */
export const TAXI_RATE_PER_KM = 5000;
export const SEATS_PER_VEHICLE = 4;
/** Aturan kode asli: sel matriks −1 atau 0 (di luar diagonal) diganti 15 km / 1.300 detik. */
const FALLBACK_KM = 15;
const FALLBACK_HOURS = 1300 / 3600;
/** Jumlah tetangga terdekat per kandidat (dipakai mutasi "tambah" dan greedy). */
const NEIGHBORS = 10;

/** Masalah yang siap dievaluasi: kandidat + matriks yang dipadatkan. GA bekerja dengan indeks kandidat 0..n-1. */
export interface Problem {
  input: TripInput;
  weights: Weights;
  attractions: readonly Attraction[];
  /** candidates[c] = indeks atraksi di dataset. */
  candidates: number[];
  n: number;
  ticket: Float64Array;
  visit: Float64Array;
  /** n×n: jarak (km) dan waktu tempuh (jam). */
  distKm: Float64Array;
  travelH: Float64Array;
  /** Skor preferensi tiap kandidat, 0–1. */
  preference: Float64Array;
  /** 10 kandidat terdekat per kandidat. */
  neighbors: Int32Array;
  neighborCount: number;
  /** T = hari × jam/hari. */
  targetHours: number;
  vehicles: number;
  excluded: { name: string; reason: string }[];
}

/** Skor preferensi destinasi = bobot tertinggi di antara tag-nya ÷ bobot slider tertinggi. */
export function preferenceOf(tags: readonly string[], weights: Readonly<Record<string, number>>): number {
  const max = Math.max(0, ...Object.values(weights));
  if (max <= 0) return 0;
  return Math.max(0, ...tags.map((t) => weights[t] ?? 0)) / max;
}

export function buildProblem(
  dataset: Dataset,
  input: TripInput,
  options: { weights?: Weights; exclude?: Readonly<Record<string, string>> } = {},
): Problem {
  const trip = tripInputSchema.parse(input);
  const exclude = options.exclude ?? DIKECUALIKAN;
  const excluded = dataset.attractions.filter((a) => a.name in exclude).map((a) => ({ name: a.name, reason: exclude[a.name] as string }));
  const candidates = dataset.attractions.filter((a) => !(a.name in exclude)).map((a) => a.index);
  const n = candidates.length;
  if (n === 0) throw new Error('Tidak ada destinasi kandidat');

  const ticket = new Float64Array(n);
  const visit = new Float64Array(n);
  const preference = new Float64Array(n);
  const distKm = new Float64Array(n * n);
  const travelH = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const a = dataset.attractions[candidates[i] as number] as Attraction;
    ticket[i] = a.ticket;
    visit[i] = a.visitHours;
    preference[i] = preferenceOf(a.tags, trip.tagWeights);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const cell = (candidates[i] as number) * dataset.size + (candidates[j] as number);
      const m = dataset.distanceM[cell] as number;
      const s = dataset.durationS[cell] as number;
      distKm[i * n + j] = m === -1 || m === 0 ? FALLBACK_KM : m / 1000;
      travelH[i * n + j] = s === -1 || s === 0 ? FALLBACK_HOURS : s / 3600;
    }
  }

  const neighborCount = Math.min(NEIGHBORS, n - 1);
  const neighbors = new Int32Array(n * neighborCount);
  for (let i = 0; i < n; i++) {
    const others = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i);
    others.sort((a, b) => (travelH[i * n + a] as number) - (travelH[i * n + b] as number) || a - b);
    neighbors.set(others.slice(0, neighborCount), i * neighborCount);
  }

  return {
    input: trip,
    weights: options.weights ?? DEFAULT_WEIGHTS,
    attractions: dataset.attractions,
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
    vehicles: Math.ceil(trip.people / SEATS_PER_VEHICLE),
    excluded,
  };
}

// ---- Jadwal per hari --------------------------------------------------------------------------------

export interface DayPlan {
  day: number;
  /** Indeks kandidat di hari ini, berurutan. */
  stops: number[];
  hours: number;
  /** True bila satu destinasi saja sudah lebih lama dari jam/hari. */
  overLimit: boolean;
}

/**
 * Memecah rute ke hari-hari secara greedy: destinasi masuk ke hari berjalan bila
 * jam hari itu + tempuh + kunjungan ≤ jam/hari; jika tidak, mulai hari baru.
 */
export function splitIntoDays(problem: Problem, route: readonly number[]): { days: DayPlan[]; fits: boolean; overflowHours: number } {
  const H = problem.input.hoursPerDay;
  const days: DayPlan[] = [];
  route.forEach((c, k) => {
    const need = (k > 0 ? (problem.travelH[(route[k - 1] as number) * problem.n + c] as number) : 0) + (problem.visit[c] as number);
    let today = days[days.length - 1];
    if (!today || today.hours + need > H) {
      today = { day: days.length + 1, stops: [], hours: 0, overLimit: false };
      days.push(today);
    }
    today.stops.push(c);
    today.hours += need;
    today.overLimit = today.hours > H;
  });
  // Rentang terpakai: hari selain terakhir dihitung penuh (minimal H jam).
  let span = 0;
  let excess = 0;
  days.forEach((d, i) => {
    span += i < days.length - 1 ? Math.max(H, d.hours) : d.hours;
    excess += Math.max(0, d.hours - H);
  });
  return {
    days,
    fits: days.length <= problem.input.days && excess === 0,
    overflowHours: Math.max(0, span - problem.targetHours) + excess,
  };
}

// ---- Evaluasi ----------------------------------------------------------------------------------------

export interface Evaluation {
  ticketCost: number;
  transportCost: number;
  totalCost: number;
  visitHours: number;
  travelHours: number;
  totalHours: number;
  distanceKm: number;
  /** (C − B) / B; negatif = di bawah anggaran. */
  costError: number;
  /** (D − T) / T; negatif = di bawah batas jam. */
  durationError: number;
  /** Rata-rata skor preferensi destinasi, 0–1. */
  preference: number;
  valid: boolean;
  days: DayPlan[];
  scheduleFits: boolean;
  fitness: number;
}

export function evaluateRoute(problem: Problem, route: readonly number[]): Evaluation {
  const { input, weights: w, n } = problem;
  let ticket = 0;
  let visitHours = 0;
  let travelHours = 0;
  let distanceKm = 0;
  let pref = 0;
  route.forEach((c, k) => {
    ticket += problem.ticket[c] as number;
    visitHours += problem.visit[c] as number;
    pref += problem.preference[c] as number;
    if (k > 0) {
      const prev = route[k - 1] as number;
      distanceKm += problem.distKm[prev * n + c] as number;
      travelHours += problem.travelH[prev * n + c] as number;
    }
  });

  const ticketCost = ticket * input.people;
  const transportCost = distanceKm * TAXI_RATE_PER_KM * problem.vehicles;
  const totalCost = ticketCost + transportCost;
  const totalHours = visitHours + travelHours;
  const B = input.budget;
  const T = problem.targetHours;
  const costError = (totalCost - B) / B;
  const durationError = (totalHours - T) / T;
  const preference = route.length > 0 ? pref / route.length : 0;
  const schedule = splitIntoDays(problem, route);

  const costScore = w.cost * Math.abs(costError);
  const durationScore = w.duration * Math.abs(durationError);
  const penalty = w.violation * (Math.max(0, costError) + Math.max(0, durationError)) + (w.schedule * schedule.overflowHours) / T;
  const fitness = (1 + w.preference * preference) / (w.epsilon + costScore + durationScore + penalty);

  return {
    ticketCost,
    transportCost,
    totalCost,
    visitHours,
    travelHours,
    totalHours,
    distanceKm,
    costError,
    durationError,
    preference,
    valid: totalCost <= B && totalHours <= T,
    days: schedule.days,
    scheduleFits: schedule.fits,
    fitness,
  };
}

// ---- Rencana siap tampil --------------------------------------------------------------------------------

export interface PlanStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tags: string[];
  ticket: number;
  visitHours: number;
  /** Tempuh dari destinasi sebelumnya. */
  travelHours: number;
  travelKm: number;
  pictureUrl: string;
  mapsUrl: string;
}

export interface PlanView {
  rank: number;
  ticketCost: number;
  transportCost: number;
  totalCost: number;
  remainingBudget: number;
  visitHours: number;
  travelHours: number;
  totalHours: number;
  distanceKm: number;
  preference: number;
  valid: boolean;
  scheduleFits: boolean;
  issues: string[];
  fitness: number;
  days: { day: number; hours: number; overLimit: boolean; stops: PlanStop[] }[];
}

const rupiah = (x: number) => `Rp${Math.round(x).toLocaleString('id-ID')}`;
const jam = (x: number) => `${x.toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam`;

export function toPlanView(problem: Problem, route: readonly number[], e: Evaluation, rank: number): PlanView {
  const issues: string[] = [];
  if (e.totalCost > problem.input.budget) issues.push(`Biaya melebihi anggaran ${rupiah(e.totalCost - problem.input.budget)}`);
  if (e.totalHours > problem.targetHours) issues.push(`Durasi melebihi batas ${jam(e.totalHours - problem.targetHours)}`);
  if (e.days.length > problem.input.days) issues.push(`Jadwal butuh ${e.days.length} hari (tersedia ${problem.input.days})`);
  if (e.days.some((d) => d.overLimit)) issues.push(`Ada hari yang lebih dari ${jam(problem.input.hoursPerDay)}`);

  const position = new Map(route.map((c, k) => [c, k]));
  const stop = (c: number): PlanStop => {
    const a = problem.attractions[problem.candidates[c] as number] as Attraction;
    const k = position.get(c) as number;
    const prev = k > 0 ? (route[k - 1] as number) : -1;
    return {
      id: a.id,
      name: a.name,
      lat: a.lat,
      lng: a.lng,
      tags: a.tags,
      ticket: a.ticket,
      visitHours: a.visitHours,
      travelHours: prev >= 0 ? (problem.travelH[prev * problem.n + c] as number) : 0,
      travelKm: prev >= 0 ? (problem.distKm[prev * problem.n + c] as number) : 0,
      pictureUrl: a.pictureUrl,
      mapsUrl: a.mapsUrl,
    };
  };

  return {
    rank,
    ticketCost: e.ticketCost,
    transportCost: e.transportCost,
    totalCost: e.totalCost,
    remainingBudget: problem.input.budget - e.totalCost,
    visitHours: e.visitHours,
    travelHours: e.travelHours,
    totalHours: e.totalHours,
    distanceKm: e.distanceKm,
    preference: e.preference,
    valid: e.valid,
    scheduleFits: e.scheduleFits,
    issues,
    fitness: e.fitness,
    days: e.days.map((d) => ({ day: d.day, hours: d.hours, overLimit: d.overLimit, stops: d.stops.map(stop) })),
  };
}
