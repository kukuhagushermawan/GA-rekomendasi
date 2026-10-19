import { describe, expect, it } from 'vitest';
import { buildProblem, evaluateRoute, splitIntoDays, type TripInput } from '@/lib/ga';
import { loadFixture } from './helpers';

/**
 * Fixture data asli (7 atraksi). Dengan pengecualian otomatis, Nofri kasur (tidak terjangkau) dan
 * Museum of East Timor (jarak > 100 km) keluar dari kandidat, sehingga kandidat lokal:
 *   0 National Monument (Rp20.000, 0,5 j) · 1 Irian Jaya Liberation Monument (Rp0, 0,1 j)
 *   2 Merdeka Square, Jakarta (Rp0, 0,75 j) · 3 Taman Lapangan Banteng (Rp0, 1,5 j)
 *   4 Monumen Patung Dirgantara (Rp0, 0 j)
 * Nilai harapan diturunkan dengan tangan dari sel CSV fixture.
 */
const ds = loadFixture();
const L = { NM: 0, IJ: 1, MS: 2, TLB: 3, MPD: 4 } as const;
const trip = (over: Partial<TripInput> = {}): TripInput => ({
  budget: 60_000,
  days: 1,
  hoursPerDay: 2,
  people: 2,
  tagWeights: {},
  ...over,
});

// Rute NM → MS → IJ: jarak 403 + 3216 m, durasi 39 + 338 s.
const ROUTE = [L.NM, L.MS, L.IJ];
const KM = (403 + 3216) / 1000;
const TRAVEL_H = 39 / 3600 + 338 / 3600;
const TICKET_COST = 20000 * 2;
const TRANSPORT = KM * 5000;
const COST = TICKET_COST + TRANSPORT; // ≈ Rp58.095
const HOURS = 0.5 + 0.75 + 0.1 + TRAVEL_H; // ≈ 1,4547 jam

describe('buildProblem', () => {
  it('mengecualikan atraksi bermasalah menurut audit tanpa mengubah data', () => {
    const p = buildProblem(ds, trip());
    expect(p.excluded.map((e) => [e.name, e.reason])).toEqual([
      ['Museum of East Timor', 'jarak-tidak-masuk-akal'],
      ['Nofri kasur', 'tidak-terjangkau'],
    ]);
    expect(p.n).toBe(5);
    expect(buildProblem(ds, trip(), { excludeSuspect: false }).n).toBe(7);
  });

  it('memfilter kandidat dengan requireAnyTag', () => {
    const p = buildProblem(ds, trip(), { requireAnyTag: ['kids-friendly'] });
    expect([...p.candidates].map((i) => ds.attractions[i]?.name)).toEqual(['National Monument', 'Merdeka Square, Jakarta']);
  });

  it('menolak masukan tidak sah', () => {
    expect(() => buildProblem(ds, trip({ budget: 0 }))).toThrow();
    expect(() => buildProblem(ds, trip({ days: 0 }))).toThrow();
  });
});

describe('evaluateRoute — biaya, durasi, validitas', () => {
  it('menghitung biaya dan durasi dari data asli', () => {
    const e = evaluateRoute(buildProblem(ds, trip()), ROUTE);
    expect(e.ticketCost).toBe(TICKET_COST);
    expect(e.distanceKm).toBeCloseTo(KM, 12);
    expect(e.transportCost).toBeCloseTo(TRANSPORT, 9);
    expect(e.totalCost).toBeCloseTo(58095, 6);
    expect(e.travelHours).toBeCloseTo(TRAVEL_H, 12);
    expect(e.totalHours).toBeCloseTo(HOURS, 12);
  });

  it('VALID bila biaya ≤ anggaran dan durasi ≤ hari × jam/hari', () => {
    expect(evaluateRoute(buildProblem(ds, trip()), ROUTE).valid).toBe(true);
    // Anggaran = biaya (dibulatkan ke atas ke rupiah) tetap valid.
    expect(evaluateRoute(buildProblem(ds, trip({ budget: Math.ceil(COST) })), ROUTE).valid).toBe(true);
  });

  it('TIDAK VALID bila biaya melebihi anggaran', () => {
    const e = evaluateRoute(buildProblem(ds, trip({ budget: 58_000 })), ROUTE);
    expect(e.valid).toBe(false);
    expect(e.costError).toBeGreaterThan(0);
  });

  it('TIDAK VALID bila durasi melebihi batas jam', () => {
    const e = evaluateRoute(buildProblem(ds, trip({ hoursPerDay: 1.4 })), ROUTE);
    expect(e.valid).toBe(false);
    expect(e.durationError).toBeGreaterThan(0);
  });

  it('biaya taksi dikalikan jumlah kendaraan (4 kursi per kendaraan)', () => {
    const e = evaluateRoute(buildProblem(ds, trip({ people: 5 })), ROUTE);
    expect(e.ticketCost).toBe(20000 * 5);
    expect(e.transportCost).toBeCloseTo(TRANSPORT * 2, 9);
  });

  it('sel 0 di luar diagonal memakai nilai pengganti upstream (15 km, 1300 s)', () => {
    // Irian Jaya Liberation Monument → Taman Lapangan Banteng bernilai 0 di kedua matriks.
    const e = evaluateRoute(buildProblem(ds, trip()), [L.IJ, L.TLB]);
    expect(e.distanceKm).toBe(15);
    expect(e.travelHours).toBe(1300 / 3600);
  });

  it('rute kosong: biaya dan durasi nol', () => {
    const e = evaluateRoute(buildProblem(ds, trip()), []);
    expect(e).toMatchObject({ totalCost: 0, totalHours: 0, preference: 0, valid: true });
  });
});

describe('evaluateRoute — fitness', () => {
  it('fitness = 1 / (ε + |C−B|/B + |D−T|/T) untuk rencana valid tanpa preferensi', () => {
    const B = 60_000;
    const T = 2;
    const expected = 1 / (0.01 + Math.abs(COST - B) / B + Math.abs(HOURS - T) / T);
    const e = evaluateRoute(buildProblem(ds, trip()), ROUTE);
    expect(e.components.violation).toBe(0);
    expect(e.components.schedulePenalty).toBe(0);
    expect(e.components.bonusFactor).toBe(1);
    expect(e.fitness).toBeCloseTo(expected, 12);
    expect(e.fitness).toBeCloseTo(3.18077, 4);
  });

  it('menambahkan penalti pelanggaran (bobot 10) saat melebihi anggaran', () => {
    const B = 58_000;
    const over = (COST - B) / B;
    const e = evaluateRoute(buildProblem(ds, trip({ budget: B })), ROUTE);
    expect(e.components.violation).toBeCloseTo(10 * over, 12);
    expect(e.fitness).toBeCloseTo(1 / (0.01 + over + Math.abs(HOURS - 2) / 2 + 10 * over), 12);
  });

  it('rencana yang melanggar batas mendapat fitness lebih rendah daripada pelanggaran nol dengan selisih sama', () => {
    // Biaya 1% di atas anggaran vs 1% di bawah anggaran: selisih relatif sama, tetapi yang melanggar kalah.
    const under = evaluateRoute(buildProblem(ds, trip({ budget: Math.round(COST / 0.99) })), ROUTE);
    const over = evaluateRoute(buildProblem(ds, trip({ budget: Math.round(COST / 1.01) })), ROUTE);
    expect(under.valid).toBe(true);
    expect(over.valid).toBe(false);
    expect(under.fitness).toBeGreaterThan(over.fitness);
  });

  it('bonus preferensi = 1 + w_p × rata-rata skor preferensi destinasi', () => {
    // museum=1, kids-friendly=0,5 → NM (kids-friendly, history) 0,5 · MS (kids-friendly, …) 0,5 · IJ (history) 0.
    const e = evaluateRoute(buildProblem(ds, trip({ tagWeights: { museum: 1, 'kids-friendly': 0.5 } })), ROUTE);
    expect(e.preference).toBeCloseTo(1 / 3, 12);
    expect(e.components.bonusFactor).toBeCloseTo(1 + 1 / 3, 12);
  });

  it('bobot nol mengembalikan rumus slide murni', () => {
    const weights = { cost: 1, duration: 1, violation: 0, schedule: 0, preference: 0, epsilon: 1e-9 };
    const e = evaluateRoute(buildProblem(ds, trip({ budget: 58_000 }), { weights }), ROUTE);
    expect(e.fitness).toBeCloseTo(1 / (1e-9 + Math.abs(COST - 58_000) / 58_000 + Math.abs(HOURS - 2) / 2), 9);
  });
});

describe('splitIntoDays', () => {
  it('memecah rute saat jam hari berjalan + tempuh + kunjungan melebihi batas', () => {
    // H = 1 jam: NM 0,5 → MS (+39 s + 0,75 j) melewati 1 jam → hari 2; IJ (+338 s + 0,1 j) masih muat di hari 2.
    const p = buildProblem(ds, trip({ days: 3, hoursPerDay: 1 }));
    const s = splitIntoDays(p, ROUTE);
    expect(s.days.map((d) => d.stops.map((x) => x.candidate))).toEqual([[L.NM], [L.MS, L.IJ]]);
    expect(s.days[1]?.hours).toBeCloseTo(39 / 3600 + 0.75 + 338 / 3600 + 0.1, 12);
    expect(s.days.reduce((sum, d) => sum + d.hours, 0)).toBeCloseTo(HOURS, 12);
    expect(s.span).toBeCloseTo(1 + (s.days[1]?.hours ?? 0), 12);
    expect(s.fits).toBe(true);
    expect(s.overflowHours).toBe(0);
  });

  it('tidak muat bila butuh lebih banyak hari daripada yang tersedia', () => {
    const p = buildProblem(ds, trip({ days: 1, hoursPerDay: 1 }));
    const s = splitIntoDays(p, ROUTE);
    expect(s.days).toHaveLength(2);
    expect(s.fits).toBe(false);
    expect(s.overflowHours).toBeCloseTo(s.span - 1, 12);
  });

  it('menandai hari yang melebihi batas bila satu destinasi lebih lama dari jam per hari', () => {
    const p = buildProblem(ds, trip({ days: 2, hoursPerDay: 1 }));
    const s = splitIntoDays(p, [L.TLB]);
    expect(s.days[0]?.overLimit).toBe(true);
    expect(s.fits).toBe(false);
    expect(s.overflowHours).toBeCloseTo(0.5, 12);
  });
});
