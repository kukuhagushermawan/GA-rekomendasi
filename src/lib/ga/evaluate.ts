import type { Problem } from './problem';
import { splitIntoDays, type ScheduleResult } from './schedule';

/**
 * Evaluasi satu rute (daftar indeks kandidat berurutan, tanpa duplikat).
 *
 *   C = Σ HTM × orang + Σ jarak_km × tarif × kendaraan          (biaya total, Rp)
 *   D = Σ kunjungan + Σ tempuh                                  (durasi total, jam)
 *   valid ⇔ C ≤ anggaran ∧ D ≤ hari × jam/hari                  (aturan slide)
 *
 *   cost_score     = w_c · |C − B| / B
 *   duration_score = w_d · |D − T| / T
 *   violation      = w_v · (max(0, C − B) / B + max(0, D − T) / T)
 *   schedule       = w_s · overflow_jadwal / T
 *   fitness        = (1 + w_p · preferensi) / (ε + cost_score + duration_score + violation + schedule)
 *
 * Dengan w_v = w_s = w_p = 0, fitness = 1 / (ε + cost_score + duration_score): rumus slide
 * (Qomariyah & Kazakov, 2021) dengan selisih relatif.
 */
export interface Evaluation {
  ticketCost: number;
  transportCost: number;
  totalCost: number;
  visitHours: number;
  travelHours: number;
  totalHours: number;
  distanceKm: number;
  /** (C − B) / B: negatif = di bawah anggaran. */
  costError: number;
  /** (D − T) / T: negatif = di bawah batas jam. */
  durationError: number;
  /** Rata-rata skor preferensi destinasi di rute, [0, 1]. */
  preference: number;
  valid: boolean;
  schedule: ScheduleResult;
  components: {
    costScore: number;
    durationScore: number;
    violation: number;
    schedulePenalty: number;
    bonusFactor: number;
  };
  fitness: number;
}

export function evaluateRoute(problem: Problem, route: readonly number[]): Evaluation {
  const { input, weights, n } = problem;
  let ticket = 0;
  let visitHours = 0;
  let travelHours = 0;
  let distanceKm = 0;
  let pref = 0;
  for (let k = 0; k < route.length; k++) {
    const c = route[k] as number;
    ticket += problem.ticket[c] as number;
    visitHours += problem.visit[c] as number;
    pref += problem.preference[c] as number;
    if (k > 0) {
      const prev = route[k - 1] as number;
      distanceKm += problem.distKm[prev * n + c] as number;
      travelHours += problem.travelH[prev * n + c] as number;
    }
  }

  const ticketCost = ticket * input.people;
  const transportCost = distanceKm * problem.costModel.taxiRatePerKm * problem.vehicles;
  const totalCost = ticketCost + transportCost;
  const totalHours = visitHours + travelHours;
  const B = input.budget;
  const T = problem.targetHours;
  const costError = (totalCost - B) / B;
  const durationError = (totalHours - T) / T;
  const preference = route.length > 0 ? pref / route.length : 0;
  const schedule = splitIntoDays(problem, route);

  const costScore = weights.cost * Math.abs(costError);
  const durationScore = weights.duration * Math.abs(durationError);
  const violation = weights.violation * (Math.max(0, costError) + Math.max(0, durationError));
  const schedulePenalty = (weights.schedule * schedule.overflowHours) / T;
  const bonusFactor = 1 + weights.preference * preference;

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
    schedule,
    components: { costScore, durationScore, violation, schedulePenalty, bonusFactor },
    fitness: bonusFactor / (weights.epsilon + costScore + durationScore + violation + schedulePenalty),
  };
}
