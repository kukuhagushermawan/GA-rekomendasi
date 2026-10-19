import { describe, expect, it } from 'vitest';
import { evaluateV1, evaluateV3, travelTotals, UPSTREAM, type EvalContext } from '@/lib/reference';
import { F, loadFixture } from './helpers';

/**
 * Nilai harapan diturunkan dengan tangan dari sel CSV fixture (lihat komentar), memakai rumus utils.py:
 *   travelExpenses = (Σmeter / 1000) × 5000
 *   costScore      = |budget − (ΣHTM × orang + travelExpenses)| / 100000
 *   durationScore  = |(Σjam kunjungan + Σdetik / 60 / 60) − hari × 10|
 *   fitness        = 1 / (costScore + durationScore)
 */
const ds = loadFixture();
const ctx: EvalContext = { attractions: ds.attractions, matrices: ds.matrices, budget: 3_000_000, nPeople: 2, days: 3 };

describe('konstanta upstream', () => {
  it('sesuai kode Python', () => {
    expect(UPSTREAM.TAXI_RATE_IDR_PER_KM).toBe(5000);
    expect(UPSTREAM.FALLBACK_DISTANCE_M).toBe(15000);
    expect(UPSTREAM.FALLBACK_DURATION_S).toBe(1300);
    expect(UPSTREAM.COST_SCORE_DIVISOR).toBe(100000);
    expect(UPSTREAM.EVAL_HOURS_PER_DAY).toBe(10);
    expect(UPSTREAM.INIT_HOURS_PER_DAY).toBe(7);
  });
});

describe('evaluateV1', () => {
  it('rute National Monument → Merdeka Square → Irian Jaya Liberation Monument', () => {
    // Jarak: NM→MS 403 m, MS→IJ 3216 m. Durasi: NM→MS 39 s, MS→IJ 338 s.
    const meters = 403 + 3216;
    const seconds = 39 + 338;
    const travelExpenses = (meters / 1000) * 5000; // ≈ Rp18.095
    const totalCost = (20000 + 0 + 0) * 2 + travelExpenses; // ≈ Rp58.095
    const totalHours = 0.5 + 0.75 + 0.1 + seconds / 60 / 60; // ≈ 1,4547 jam
    const fitness = 1 / (Math.abs(3_000_000 - totalCost) / 100000 + Math.abs(totalHours - 30));

    const r = evaluateV1([F.NM, F.MS, F.IJ], ctx);
    expect(r.travelExpenses).toBe(travelExpenses);
    expect(r.totalCost).toBe(totalCost);
    expect(r.totalHours).toBe(totalHours);
    expect(r.travelHours).toBe(seconds / 60 / 60);
    expect(r.fitness).toBe(fitness);
    expect(r.totalCost).toBeCloseTo(58095, 6);
    expect(r.fitness).toBeCloseTo(0.017252, 6);
  });

  it('rute memakai arah asal→tujuan (matriks asimetris)', () => {
    // MS→NM = 566 m / 54 s, berbeda dari NM→MS = 403 m / 39 s.
    expect(travelTotals([F.MS, F.NM], ds.matrices)).toEqual({ meters: 566, seconds: 54 });
    expect(travelTotals([F.NM, F.MS], ds.matrices)).toEqual({ meters: 403, seconds: 39 });
  });

  it('sel -1 (Nofri kasur) diganti 15000 m / 1300 s', () => {
    expect(travelTotals([F.NM, F.NK, F.IJ], ds.matrices)).toEqual({ meters: 30000, seconds: 2600 });
    expect(evaluateV1([F.NM, F.NK, F.IJ], ctx).travelExpenses).toBe(150000);
  });

  it('sel 0 di luar diagonal juga diganti nilai pengganti (perilaku upstream)', () => {
    // Irian Jaya Liberation Monument → Taman Lapangan Banteng bernilai 0 m / 0 s di matriks.
    expect(travelTotals([F.IJ, F.TLB], ds.matrices)).toEqual({ meters: 15000, seconds: 1300 });
  });

  it('gen duplikat berurutan membaca diagonal 0 → ikut memakai nilai pengganti', () => {
    expect(travelTotals([F.NM, F.NM], ds.matrices)).toEqual({ meters: 15000, seconds: 1300 });
  });

  it('jarak tak masuk akal dipakai apa adanya (tidak dihitung ulang)', () => {
    // NM → Museum of East Timor = 3.096.350 m di distanceMatrix.csv.
    expect(evaluateV1([F.NM, F.ET], ctx).travelExpenses).toBe((3096350 / 1000) * 5000);
  });

  it('kromosom kosong dan satu gen tidak memiliki biaya perjalanan', () => {
    const empty = evaluateV1([], ctx);
    expect(empty).toMatchObject({ totalCost: 0, totalHours: 0, travelExpenses: 0 });
    expect(empty.fitness).toBe(1 / (3_000_000 / 100000 + 30));
    expect(evaluateV1([F.NM], ctx)).toMatchObject({ totalCost: 40000, totalHours: 0.5, travelExpenses: 0 });
  });
});

describe('evaluateV3', () => {
  it('menambah (jumlah gen yang memiliki SEMUA tag preferensi) / jumlah gen', () => {
    const genes = [F.NM, F.MS, F.IJ];
    const base = evaluateV1(genes, ctx).fitness;
    // kids-friendly + history: NM ✓, MS ✓, IJ ✗ (hanya history) → 2/3.
    expect(evaluateV3(genes, ctx, ['kids-friendly', 'history']).fitness).toBe(base + 2 / 3);
    // history saja: ketiganya ✓ → 3/3.
    expect(evaluateV3(genes, ctx, ['history']).fitness).toBe(base + 1);
  });
});
