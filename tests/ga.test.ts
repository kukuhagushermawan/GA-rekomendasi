import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/ga/acak';
import { DATA_FILES, buildDataset, parseAttractions, parseCsv, type RawFiles } from '@/ga/data';
import { buildProblem, evaluateRoute, splitIntoDays, type TripInput } from '@/ga/fitness';
import { DEFAULT_CONFIG, greedySeedRoute, runGA, setDifference } from '@/ga/ga';
import { decode, fromRoute, randomChromosome, writeRoute, type Chromosome } from '@/ga/kromosom';
import {
  addMutation,
  insertMutation,
  mutate,
  onePointCrossover,
  orderCrossover,
  orderCrossoverPair,
  removeMutation,
  rouletteSampler,
  swapMutation,
  tournamentSelect,
  uniformCrossover,
} from '@/ga/operator';
import { compareMethods, greedyCheapest, greedyNearest, randomSearch } from '@/ga/pembanding';

// ---- Data asli ----------------------------------------------------------------------------------------

const read = (url: string) => readFileSync(path.join(import.meta.dirname, '..', 'public', url), 'utf8');
const files: RawFiles = { attractions: read(DATA_FILES.attractions), distance: read(DATA_FILES.distance), duration: read(DATA_FILES.duration) };
const dataset = buildDataset(files);
const byName = (name: string) => dataset.attractions.find((a) => a.name === name)?.index as number;

describe('data', () => {
  it('memuat 201 atraksi; matriks berisi label tambahan "Jakarta"', () => {
    expect(dataset.attractions).toHaveLength(201);
    expect(dataset.extraLabels).toEqual(['Jakarta']);
  });

  it('matriks dibaca berdasarkan nama, apa adanya (meter / detik, asimetris)', () => {
    const cell = (from: string, to: string) => byName(from) * dataset.size + byName(to);
    expect(dataset.distanceM[cell('National Monument', 'Merdeka Square, Jakarta')]).toBe(403);
    expect(dataset.durationS[cell('National Monument', 'Merdeka Square, Jakarta')]).toBe(39);
    expect(dataset.distanceM[cell('Merdeka Square, Jakarta', 'National Monument')]).toBe(566);
  });

  it('parser CSV membaca kutip di tengah field secara literal (seperti Python)', () => {
    expect(parseCsv('origin,Taman Kota "Cattleya",x\n"a, b",2,3\n')).toEqual([
      ['origin', 'Taman Kota "Cattleya"', 'x'],
      ['a, b', '2', '3'],
    ]);
  });

  it('menerima daftar atraksi format CSV dan menolak HTM yang tidak valid', () => {
    const csv = 'name,ticketPrice,visitDuration,tags,lat,lng\nMonas,20000,0.5,history|kids-friendly,-6.17,106.82\n';
    expect(parseAttractions(csv)[0]).toMatchObject({ id: 'ID001', ticket: 20000, visitHours: 0.5, tags: ['history', 'kids-friendly'] });
    expect(() => parseAttractions(csv.replace('20000', 'Rp20.000'))).toThrow(/ticketPrice/);
  });
});

// ---- Fitness & validasi ---------------------------------------------------------------------------------

/**
 * Rute National Monument → Merdeka Square → Irian Jaya Liberation Monument (data asli):
 *   jarak 403 + 3216 m, tempuh 39 + 338 detik, HTM Rp20.000 + 0 + 0, kunjungan 0,5 + 0,75 + 0,1 jam.
 */
const trip = (over: Partial<TripInput> = {}): TripInput => ({ budget: 60_000, days: 1, hoursPerDay: 2, people: 2, tagWeights: {}, ...over });
const problemFor = (over: Partial<TripInput> = {}) => buildProblem(dataset, trip(over));
const local = (problem: ReturnType<typeof problemFor>, name: string) => problem.candidates.indexOf(byName(name));
const routeOf = (problem: ReturnType<typeof problemFor>) =>
  ['National Monument', 'Merdeka Square, Jakarta', 'Irian Jaya Liberation Monument'].map((n) => local(problem, n));
const COST = 20000 * 2 + ((403 + 3216) / 1000) * 5000; // ≈ Rp58.095
const HOURS = 0.5 + 0.75 + 0.1 + (39 + 338) / 3600; // ≈ 1,4547 jam

describe('fitness dan validasi', () => {
  it('menghitung biaya (HTM × orang + taksi Rp5.000/km) dan durasi (kunjungan + tempuh)', () => {
    const p = problemFor();
    const e = evaluateRoute(p, routeOf(p));
    expect(e.ticketCost).toBe(40000);
    expect(e.totalCost).toBeCloseTo(COST, 6);
    expect(e.totalHours).toBeCloseTo(HOURS, 9);
  });

  it('VALID bila biaya ≤ anggaran dan durasi ≤ hari × jam/hari', () => {
    const p = problemFor();
    expect(evaluateRoute(p, routeOf(p)).valid).toBe(true);
  });

  it('TIDAK VALID bila biaya melebihi anggaran', () => {
    const p = problemFor({ budget: 58_000 });
    expect(evaluateRoute(p, routeOf(p)).valid).toBe(false);
  });

  it('TIDAK VALID bila durasi melebihi batas jam', () => {
    const p = problemFor({ hoursPerDay: 1.4 });
    expect(evaluateRoute(p, routeOf(p)).valid).toBe(false);
  });

  it('fitness = 1 / (0,01 + |C−B|/B + |D−T|/T) untuk rencana valid tanpa preferensi', () => {
    const p = problemFor();
    const expected = 1 / (0.01 + Math.abs(COST - 60_000) / 60_000 + Math.abs(HOURS - 2) / 2);
    expect(evaluateRoute(p, routeOf(p)).fitness).toBeCloseTo(expected, 9);
  });

  it('pelanggaran batas dikenai penalti: lebih buruk dari selisih yang sama di bawah anggaran', () => {
    const under = problemFor({ budget: Math.round(COST / 0.99) });
    const over = problemFor({ budget: Math.round(COST / 1.01) });
    const eu = evaluateRoute(under, routeOf(under));
    const eo = evaluateRoute(over, routeOf(over));
    expect(eu.valid && !eo.valid).toBe(true);
    expect(eu.fitness).toBeGreaterThan(eo.fitness);
  });

  it('bonus preferensi: museum=1, ramah anak=0,5 → skor (0,5 + 0,5 + 0) / 3', () => {
    const p = problemFor({ tagWeights: { museum: 1, 'kids-friendly': 0.5 } });
    const e = evaluateRoute(p, routeOf(p));
    expect(e.preference).toBeCloseTo(1 / 3, 12);
    const plain = problemFor();
    expect(e.fitness).toBeCloseTo(evaluateRoute(plain, routeOf(plain)).fitness * (1 + 1 / 3), 9);
  });

  it('lebih dari 4 orang butuh 2 taksi', () => {
    const p = problemFor({ people: 5 });
    expect(evaluateRoute(p, routeOf(p)).transportCost).toBeCloseTo(((403 + 3216) / 1000) * 5000 * 2, 6);
  });

  it('jadwal dipecah per hari sesuai batas jam/hari', () => {
    const p = problemFor({ days: 3, hoursPerDay: 1 });
    const s = splitIntoDays(p, routeOf(p));
    // NM 0,5 j | MS (+39 s + 0,75 j) tidak muat → hari 2, IJ masih muat di hari 2.
    expect(s.days.map((d) => d.stops.length)).toEqual([1, 2]);
    expect(s.days.reduce((sum, d) => sum + d.hours, 0)).toBeCloseTo(HOURS, 9);
    expect(s.fits).toBe(true);
    expect(splitIntoDays(problemFor({ days: 1, hoursPerDay: 1 }), routeOf(p)).fits).toBe(false);
  });

  it('8 atraksi bermasalah tidak menjadi kandidat', () => {
    const p = problemFor();
    expect(p.n).toBe(193);
    expect(p.excluded.map((e) => e.name)).toContain('Nofri kasur');
  });
});

// ---- Kromosom & operator --------------------------------------------------------------------------------

const isPermutation = (arr: ArrayLike<number>, n: number) =>
  arr.length === n && Array.from(arr).sort((a, b) => a - b).every((v, i) => v === i);
const chromosome = (order: number[], selected: number[]): Chromosome => {
  const mask = new Uint8Array(order.length);
  for (const g of selected) mask[g] = 1;
  return { mask, order: Int32Array.from(order) };
};

describe('kromosom', () => {
  it('decode mengambil gen terpilih sesuai urutan', () => {
    expect(decode(chromosome([4, 0, 3, 1, 2], [1, 3, 4]))).toEqual([4, 3, 1]);
  });

  it('writeRoute mengubah urutan gen terpilih tanpa memindahkan posisinya', () => {
    const c = chromosome([4, 0, 3, 1, 2], [1, 3, 4]);
    writeRoute(c, [1, 4, 3]);
    expect(Array.from(c.order)).toEqual([1, 0, 4, 3, 2]);
  });

  it('fromRoute menghasilkan permutasi sah yang terdekode tepat ke rute', () => {
    const c = fromRoute(12, [7, 2, 9, 0], createRng(1));
    expect(isPermutation(c.order, 12)).toBe(true);
    expect(decode(c)).toEqual([7, 2, 9, 0]);
  });
});

describe('crossover', () => {
  it('OX mereproduksi contoh klasik Davis (1985)', () => {
    // P1 = 1 2 3 | 4 5 6 7 | 8 9, P2 = 4 5 2 | 1 8 7 6 | 9 3 → 2 1 8 4 5 6 7 9 3 (dikurangi 1).
    const child = orderCrossover(Int32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]), Int32Array.from([3, 4, 1, 0, 7, 6, 5, 8, 2]), 3, 6);
    expect(Array.from(child)).toEqual([1, 0, 7, 3, 4, 5, 6, 8, 2]);
  });

  it('OX selalu menghasilkan permutasi sah', () => {
    const rng = createRng(2);
    for (let t = 0; t < 200; t++) {
      const n = 2 + rng.below(30);
      const [c1, c2] = orderCrossoverPair(randomChromosome(n, 0, rng).order, randomChromosome(n, 0, rng).order, rng);
      expect(isPermutation(c1, n) && isPermutation(c2, n)).toBe(true);
    }
  });

  it('uniform & one-point: tiap bit anak berasal dari induk di posisi yang sama', () => {
    const a = Uint8Array.from([1, 1, 1, 1, 0, 0, 0, 0]);
    const b = Uint8Array.from([0, 0, 0, 0, 1, 1, 1, 1]);
    for (const cross of [uniformCrossover, onePointCrossover]) {
      const [c1, c2] = cross(a, b, createRng(3));
      for (let i = 0; i < a.length; i++) expect((c1[i] as number) + (c2[i] as number)).toBe(1);
    }
    const [c1] = onePointCrossover(a, b, createRng(4));
    const cut = Array.from(c1).findIndex((bit, i) => bit !== a[i]);
    expect(Array.from(c1)).toEqual([...a.slice(0, cut), ...b.slice(cut)]);
  });
});

describe('mutasi', () => {
  const fresh = () => chromosome([5, 0, 3, 8, 1, 7, 2, 6, 4, 9], [0, 3, 8, 1, 7]);
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

  it('swap & insert mengubah urutan tanpa mengubah himpunan destinasi', () => {
    for (const op of [swapMutation, insertMutation]) {
      const c = fresh();
      const before = decode(c);
      expect(op(c, createRng(5))).toBe(true);
      expect(decode(c)).not.toEqual(before);
      expect(sorted(decode(c))).toEqual(sorted(before));
    }
  });

  it('tambah menambah satu destinasi, hapus mengurangi satu', () => {
    const c = fresh();
    addMutation(c, createRng(6));
    expect(decode(c)).toHaveLength(6);
    removeMutation(c, createRng(7));
    expect(decode(c)).toHaveLength(5);
  });

  it('tambah-lokal menyisipkan tetangga terdekat tepat setelah jangkarnya', () => {
    // Tetangga kandidat g adalah g+1.
    const neighbors = { list: Int32Array.from({ length: 10 }, (_, g) => (g + 1) % 10), count: 1 };
    const c = chromosome([0, 2, 4, 6, 8, 1, 3, 5, 7, 9], [0, 2, 4]);
    addMutation(c, createRng(8), neighbors, 1);
    const route = decode(c);
    const added = route.find((g) => ![0, 2, 4].includes(g)) as number;
    expect(route[route.indexOf(added) - 1]).toBe(added - 1);
  });

  it('laju 0 tidak mengubah apa pun; kromosom tetap sah setelah ratusan mutasi', () => {
    const rng = createRng(9);
    const c = fresh();
    expect(mutate(c, 0, rng)).toEqual([]);
    const r = randomChromosome(30, 8, rng);
    for (let t = 0; t < 300; t++) mutate(r, 0.5, rng);
    expect(isPermutation(r.order, 30)).toBe(true);
  });
});

describe('seleksi', () => {
  const frequencies = (draw: () => number, size: number, trials: number) => {
    const counts = new Array<number>(size).fill(0);
    for (let t = 0; t < trials; t++) {
      const i = draw();
      counts[i] = (counts[i] ?? 0) + 1;
    }
    return counts.map((c) => c / trials);
  };

  it('turnamen k = 3: individu terbaik menang ±48,8%, terburuk ±0,8%', () => {
    const rng = createRng(10);
    const freq = frequencies(() => tournamentSelect([1, 2, 3, 4, 5], 3, rng), 5, 10_000);
    expect(freq[4]).toBeCloseTo(0.488, 1);
    expect(freq[0]).toBeLessThan(0.02);
  });

  it('roulette: frekuensi sebanding fitness', () => {
    const rng = createRng(11);
    const spin = rouletteSampler([1, 2, 7]);
    const freq = frequencies(() => spin(rng), 3, 20_000);
    expect(freq[0]).toBeCloseTo(0.1, 1);
    expect(freq[2]).toBeCloseTo(0.7, 1);
  });
});

// ---- Loop GA ------------------------------------------------------------------------------------------

const slide = buildProblem(dataset, { budget: 1_000_000, days: 5, hoursPerDay: 7, people: 2, tagWeights: { museum: 1 } });
const SMALL = { populationSize: 40, maxGenerations: 60, stagnationLimit: 0 };

describe('algoritma genetika', () => {
  it('greedy seeding selalu menghasilkan rute valid', () => {
    const rng = createRng(12);
    for (let t = 0; t < 30; t++) {
      const e = evaluateRoute(slide, greedySeedRoute(slide, rng));
      expect(e.valid && e.scheduleFits).toBe(true);
    }
  });

  it('elitisme: fitness terbaik tidak pernah turun', () => {
    for (const selection of ['tournament', 'roulette'] as const) {
      for (const seed of [1, 2, 3]) {
        const { history } = runGA(slide, { ...SMALL, selection, eliteCount: 1 }, createRng(seed));
        for (let g = 1; g < history.length; g++) {
          expect(history[g]?.bestFitness).toBeGreaterThanOrEqual(history[g - 1]?.bestFitness ?? Infinity);
        }
      }
    }
  });

  it('tanpa elitisme fitness terbaik bisa turun (uji di atas bermakna)', () => {
    const drops = [1, 2, 3, 4, 5].some((seed) => {
      const { history } = runGA(slide, { ...SMALL, selection: 'roulette', eliteCount: 0 }, createRng(seed));
      return history.some((h, g) => g > 0 && h.bestFitness < (history[g - 1]?.bestFitness ?? 0));
    });
    expect(drops).toBe(true);
  });

  it('deterministik untuk seed yang sama', () => {
    const a = runGA(slide, SMALL, createRng(7));
    const b = runGA(slide, SMALL, createRng(7));
    expect(b.history).toEqual(a.history);
    expect(b.top.map((p) => p.route)).toEqual(a.top.map((p) => p.route));
  });

  it('memperbaiki solusi terbaik populasi awal', () => {
    const { history } = runGA(slide, DEFAULT_CONFIG, createRng(1));
    expect(history.at(-1)?.bestFitness).toBeGreaterThan(history[0]?.bestFitness ?? Infinity);
  });

  it('top-5: valid lebih dulu, berbeda minimal 2 destinasi, tanpa duplikat', () => {
    const { top } = runGA(slide, SMALL, createRng(8));
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(5);
    const valid = top.map((p) => p.evaluation.valid);
    expect(valid).toEqual([...valid].sort((x, y) => Number(y) - Number(x)));
    top.forEach((p, i) => {
      expect(new Set(p.route).size).toBe(p.route.length);
      for (let j = 0; j < i; j++) expect(setDifference(top[j]?.route ?? [], p.route)).toBeGreaterThanOrEqual(2);
    });
  });

  it('berhenti karena stagnasi atau saat dibatalkan', () => {
    const stagnant = runGA(slide, { populationSize: 20, maxGenerations: 500, stagnationLimit: 5 }, createRng(9));
    expect(stagnant.stopReason).toBe('stagnasi');
    let calls = 0;
    const cancelled = runGA(slide, SMALL, createRng(9), { shouldStop: () => ++calls > 3 });
    expect(cancelled.stopReason).toBe('dibatalkan');
    expect(cancelled.generations).toBe(3);
  });

  it('menolak parameter tidak sah', () => {
    expect(() => runGA(slide, { populationSize: 10, eliteCount: 10 }, createRng(1))).toThrow();
    expect(() => runGA(slide, { crossoverRate: 1.5 }, createRng(1))).toThrow();
  });
});

describe('pembanding', () => {
  it('greedy termurah & terdekat menghasilkan rute valid tanpa duplikat', () => {
    for (const r of [greedyCheapest(slide), greedyNearest(slide, createRng(10))]) {
      expect(r.route.length).toBeGreaterThan(0);
      expect(new Set(r.route).size).toBe(r.route.length);
      expect(r.evaluation.valid).toBe(true);
    }
  });

  it('pencarian acak memakai jumlah evaluasi yang diminta', () => {
    expect(randomSearch(slide, 500, createRng(11)).evaluations).toBe(500);
  });

  it('GA lebih baik dari pencarian acak dengan jumlah evaluasi sama', () => {
    const summary = compareMethods(slide, [1, 2, 3], SMALL);
    const ga = summary.find((s) => s.method === 'ga');
    const acak = summary.find((s) => s.method === 'acak');
    expect(summary).toHaveLength(4);
    expect(ga?.meanEvaluations).toBe(acak?.meanEvaluations);
    expect(ga?.meanFitness).toBeGreaterThan(acak?.meanFitness ?? Infinity);
  });
});
