import { describe, expect, it } from 'vitest';
import {
  buildProblem,
  evaluateRoute,
  greedySeedRoute,
  initialPopulation,
  DEFAULT_GA_CONFIG,
  runGA,
  setDifference,
  toPlanView,
  type GAConfig,
  type TripInput,
} from '@/lib/ga';
import { loadRawDir } from '@/lib/data/node';
import { createRng } from '@/lib/random';
import { RAW_DIR } from './helpers';

const { dataset } = loadRawDir(RAW_DIR);
const SLIDE_TRIP: TripInput = { budget: 1_000_000, days: 5, hoursPerDay: 7, people: 2, tagWeights: { museum: 1, history: 0.5 } };
const problem = buildProblem(dataset, SLIDE_TRIP);
const SMALL: Partial<GAConfig> = { populationSize: 40, maxGenerations: 60, stagnationLimit: 0 };

describe('masalah pada data asli', () => {
  it('mengecualikan 8 atraksi bermasalah secara default', () => {
    expect(problem.n).toBe(193);
    expect(problem.excluded).toHaveLength(8);
    expect(problem.excluded.filter((e) => e.reason === 'tidak-terjangkau').map((e) => e.name)).toEqual(['Nofri kasur']);
  });
});

describe('greedy seeding', () => {
  it('selalu menghasilkan rute valid yang jadwal hariannya muat', () => {
    const rng = createRng(1);
    for (let t = 0; t < 50; t++) {
      const route = greedySeedRoute(problem, rng);
      expect(route.length).toBeGreaterThan(0);
      expect(new Set(route).size).toBe(route.length);
      const e = evaluateRoute(problem, route);
      expect(e.valid).toBe(true);
      expect(e.schedule.fits).toBe(true);
    }
  });

  it('populasi awal berisi porsi seed sesuai rasio; tidak seluruhnya tidak valid', () => {
    const config = { ...DEFAULT_GA_CONFIG, populationSize: 50, greedySeedRatio: 0.2 };
    const population = initialPopulation(problem, config, createRng(2));
    expect(population).toHaveLength(50);
    const validCount = population.filter((c) => evaluateRoute(problem, Array.from(c.order).filter((g) => c.mask[g] === 1)).valid).length;
    expect(validCount).toBeGreaterThanOrEqual(10);
  });
});

describe('runGA', () => {
  it('elitisme: fitness terbaik tidak pernah turun antargenerasi', () => {
    for (const selection of ['tournament', 'roulette'] as const) {
      for (const seed of [1, 2, 3]) {
        const r = runGA(problem, { ...SMALL, selection, eliteCount: 1 }, createRng(seed));
        for (let g = 1; g < r.history.length; g++) {
          expect(r.history[g]?.bestFitness).toBeGreaterThanOrEqual(r.history[g - 1]?.bestFitness ?? Infinity);
        }
      }
    }
  });

  it('tanpa elitisme fitness terbaik bisa turun (uji elitisme di atas bermakna)', () => {
    let decreased = false;
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = runGA(problem, { ...SMALL, selection: 'roulette', eliteCount: 0 }, createRng(seed));
      for (let g = 1; g < r.history.length; g++) {
        if ((r.history[g]?.bestFitness ?? 0) < (r.history[g - 1]?.bestFitness ?? 0)) decreased = true;
      }
    }
    expect(decreased).toBe(true);
  });

  it('deterministik untuk seed yang sama dan berbeda untuk seed lain', () => {
    const a = runGA(problem, SMALL, createRng(7), { now: () => 0 });
    const b = runGA(problem, SMALL, createRng(7), { now: () => 0 });
    expect(b.history).toEqual(a.history);
    expect(b.top.map((p) => p.route)).toEqual(a.top.map((p) => p.route));
    const c = runGA(problem, SMALL, createRng(8), { now: () => 0 });
    expect(c.history).not.toEqual(a.history);
  });

  it('memperbaiki solusi terbaik populasi awal', () => {
    const r = runGA(problem, { maxGenerations: 200, stagnationLimit: 0 }, createRng(1));
    expect(r.history.at(-1)?.bestFitness).toBeGreaterThan(r.history[0]?.bestFitness ?? Infinity);
  });

  it('mencatat statistik per generasi dan jumlah evaluasi', () => {
    const r = runGA(problem, { ...SMALL, eliteCount: 2 }, createRng(9));
    expect(r.history).toHaveLength(r.generations + 1);
    expect(r.evaluations).toBe(40 + r.generations * (40 - 2));
    expect(r.history.at(-1)?.evaluations).toBe(r.evaluations);
    for (const s of r.history) {
      expect(s.bestFitness).toBeGreaterThanOrEqual(s.meanFitness);
      expect(s.meanFitness).toBeGreaterThanOrEqual(s.worstFitness);
      expect(s.validRate).toBeGreaterThanOrEqual(0);
      expect(s.validRate).toBeLessThanOrEqual(1);
    }
    expect(r.finalPopulation).toHaveLength(40);
  });

  it('top-K: maksimal K rencana, valid lebih dulu, saling berbeda ≥ minPlanDifference, tanpa duplikat', () => {
    const r = runGA(problem, { ...SMALL, topK: 5, minPlanDifference: 2 }, createRng(10));
    expect(r.top.length).toBeGreaterThan(0);
    expect(r.top.length).toBeLessThanOrEqual(5);
    const validFlags = r.top.map((p) => p.evaluation.valid);
    expect(validFlags).toEqual([...validFlags].sort((x, y) => Number(y) - Number(x)));
    for (let i = 0; i < r.top.length; i++) {
      const route = r.top[i]?.route ?? [];
      expect(route.length).toBeGreaterThan(0);
      expect(new Set(route).size).toBe(route.length);
      for (let j = 0; j < i; j++) expect(setDifference(r.top[j]?.route ?? [], route)).toBeGreaterThanOrEqual(2);
    }
    expect(r.best).toBe(r.top[0]);
  });

  it('berhenti karena stagnasi bila fitness terbaik tidak membaik', () => {
    const r = runGA(problem, { populationSize: 20, maxGenerations: 500, stagnationLimit: 5 }, createRng(11));
    expect(r.stopReason).toBe('stagnation');
    expect(r.generations).toBeLessThan(500);
    const last = r.history.slice(-6).map((s) => s.bestFitness);
    expect(new Set(last).size).toBe(1);
  });

  it('berhenti di generasi maksimum atau saat dibatalkan', () => {
    expect(runGA(problem, SMALL, createRng(12)).stopReason).toBe('maxGenerations');
    let calls = 0;
    const r = runGA(problem, SMALL, createRng(12), { shouldStop: () => ++calls > 3 });
    expect(r.stopReason).toBe('cancelled');
    expect(r.generations).toBe(3);
  });

  it('memanggil onGeneration untuk setiap generasi termasuk generasi 0', () => {
    const seen: number[] = [];
    runGA(problem, { ...SMALL, maxGenerations: 4 }, createRng(13), { onGeneration: (s) => seen.push(s.generation) });
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });

  it('menolak konfigurasi tidak sah', () => {
    expect(() => runGA(problem, { eliteCount: 100, populationSize: 100 }, createRng(1))).toThrow();
    expect(() => runGA(problem, { crossoverRate: 1.5 }, createRng(1))).toThrow();
  });
});

describe('toPlanView', () => {
  const r = runGA(problem, SMALL, createRng(14));

  it('rincian biaya, sisa anggaran, dan jadwal konsisten dengan total', () => {
    for (const [i, plan] of r.top.entries()) {
      const v = toPlanView(problem, plan, i + 1);
      expect(v.rank).toBe(i + 1);
      expect(v.ticketCost + v.transportCost).toBeCloseTo(v.totalCost, 6);
      expect(v.remainingBudget).toBeCloseTo(SLIDE_TRIP.budget - v.totalCost, 6);
      expect(v.visitHours + v.travelHours).toBeCloseTo(v.totalHours, 9);
      expect(v.days.reduce((s, d) => s + d.hours, 0)).toBeCloseTo(v.totalHours, 9);
      expect(v.days.flatMap((d) => d.stops.map((s) => s.id))).toEqual(v.ids);
      expect(v.ids.every((id) => /^ID\d{3}$/.test(id))).toBe(true);
      expect(v.valid).toBe(v.issues.filter((m) => !m.startsWith('Jadwal') && !m.includes('hari melebihi')).length === 0);
    }
  });
});
