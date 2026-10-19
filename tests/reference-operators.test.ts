import { describe, expect, it } from 'vitest';
import {
  crossv2,
  cutter,
  daySuggestion,
  evaluateV1,
  generateDynamic,
  getDuplicateIndex,
  getTaggedDest,
  optimizeRouteApprox,
  routeDistanceMatrix,
  runType8,
  selection,
  type Evaluated,
} from '@/lib/reference';
import { loadRawDir } from '@/lib/data/node';
import { createRng } from '@/lib/random';
import { F, RAW_DIR, loadFixture } from './helpers';

const ds = loadFixture();
const { attractions, matrices } = ds;

describe('getTaggedDest', () => {
  it('memilih atraksi dengan minimal satu tag yang cocok, urutan berkas', () => {
    expect(getTaggedDest(attractions, ['museum'])).toEqual([F.ET]);
    expect(getTaggedDest(attractions, ['beach', 'history'])).toEqual([F.NM, F.IJ, F.MS, F.TLB, F.MPD]);
    expect(getTaggedDest(attractions, ['beach'])).toEqual([]);
  });
});

describe('getDuplicateIndex', () => {
  it('mengembalikan indeks kemunculan kedua dan seterusnya', () => {
    expect(getDuplicateIndex([1, 2, 1, 3, 2, 1])).toEqual([2, 4, 5]);
    expect(getDuplicateIndex([])).toEqual([]);
  });
});

describe('cutter', () => {
  it('memotong sebelum gen yang membuat jam kumulatif ≥ hari × 10', () => {
    // days 0,2 → ambang 2 jam: NM 0,5 j (lolos), TLB 0,5+1,5 = 2,0 j (≥ 2 → berhenti).
    expect(cutter([F.NM, F.TLB, F.NK], attractions, 0.2, 3_000_000, 2)).toEqual([F.NM]);
  });

  it('memotong saat HTM × orang ≥ budget (biaya taksi tidak dihitung)', () => {
    // NM Rp20.000 × 2 = Rp40.000 ≥ budget Rp40.000 → kosong.
    expect(cutter([F.NM, F.IJ], attractions, 3, 40000, 2)).toEqual([]);
    expect(cutter([F.NM, F.IJ], attractions, 3, 40001, 2)).toEqual([F.NM, F.IJ]);
  });
});

describe('generateDynamic', () => {
  it('membuat 40 kromosom yang mengisi sampai ambang hari × 7 jam (duplikat diperbolehkan)', () => {
    const pool = getTaggedDest(attractions, ['history']);
    const population = generateDynamic(pool, attractions, 1, 3_000_000, 2, 0.75, createRng(1));
    expect(population).toHaveLength(40);
    for (const genes of population) {
      const hours = genes.reduce((sum, g) => sum + (attractions[g]?.visitHours ?? 0), 0);
      expect(hours).toBeGreaterThanOrEqual(7);
      expect(genes.every((g) => pool.includes(g))).toBe(true);
    }
    // Dengan 5 kandidat dan ambang 7 jam, duplikat tidak terhindarkan — bug upstream yang diport apa adanya.
    expect(population.some((genes) => new Set(genes).size < genes.length)).toBe(true);
  });
});

describe('selection (bug upstream: fitness ch1 dibandingkan dengan TOTAL BIAYA ch2)', () => {
  const entry = (genes: number[], fitness: number, totalCost: number): Evaluated => ({
    genes,
    fitness,
    totalCost,
    totalHours: 0,
    travelExpenses: 0,
    travelHours: 0,
  });

  it('pemenang selalu ch2 bila biaya > fitness, sehingga kromosom terburuk tetap sering terpilih', () => {
    const best = entry([F.NM], 0.9, 2_000_000);
    const worst = entry([F.IJ], 0.01, 1_500_000);
    const picked = selection([best, worst], createRng(3));
    expect(picked).toHaveLength(40);
    const worstCount = picked.filter((p) => p.genes === worst.genes).length;
    // Tanpa tekanan seleksi, sekitar separuh hasil adalah kromosom terburuk.
    expect(worstCount).toBeGreaterThan(10);
    expect(worstCount).toBeLessThan(30);
  });

  it('menghasilkan salinan dangkal (genes dipakai bersama seperti list.copy())', () => {
    const a = entry([F.NM], 0.5, 10);
    const b = entry([F.IJ], 0.4, 20);
    for (const p of selection([a, b], createRng(4))) {
      expect(p === a || p === b).toBe(false);
      expect(p.genes === a.genes || p.genes === b.genes).toBe(true);
    }
  });
});

describe('crossv2', () => {
  const pool = getTaggedDest(attractions, ['history']);

  it('mengembalikan induk apa adanya bila salah satu ≤ 1 gen', () => {
    const p1 = [F.NM];
    const p2 = [F.IJ, F.MS];
    const [c1, c2] = crossv2(pool, p1, p2, attractions, 3, 3_000_000, 2, createRng(5));
    expect(c1).toBe(p1);
    expect(c2).toBe(p2);
  });

  it('anak adalah hasil cutter: tidak melewati ambang jam dan budget', () => {
    const rng = createRng(6);
    for (let t = 0; t < 200; t++) {
      const p1 = [F.NM, F.IJ, F.MS, F.TLB];
      const p2 = [F.TLB, F.MPD, F.NM, F.IJ, F.MS];
      for (const child of crossv2(pool, p1, p2, attractions, 0.3, 3_000_000, 2, rng)) {
        const hours = child.reduce((sum, g) => sum + (attractions[g]?.visitHours ?? 0), 0);
        expect(hours).toBeLessThan(3);
        expect(child.every((g) => pool.includes(g))).toBe(true);
      }
    }
  });
});

describe('RouteOptimizer (aproksimasi) dan day_suggestion', () => {
  it('matriks rute mengganti sel -1 dan 0 (termasuk diagonal) dengan 15000', () => {
    expect(routeDistanceMatrix([F.NM, F.NK, F.MS], matrices)).toEqual([
      [15000, 15000, 403],
      [15000, 15000, 15000],
      [566, 15000, 15000],
    ]);
  });

  it('rute dimulai dari depot (gen pertama), berupa permutasi, dan totalDist = panjang tur tertutup', () => {
    const genes = [F.NM, F.MPD, F.MS, F.IJ];
    const route = optimizeRouteApprox(genes, attractions, matrices);
    expect(route.routeList[0]).toBe(0);
    expect([...route.routeList].sort()).toEqual([0, 1, 2, 3]);
    const dm = routeDistanceMatrix(genes, matrices);
    const closed = route.routeList.reduce(
      (sum, from, k) => sum + (dm[from]?.[route.routeList[(k + 1) % route.routeList.length] as number] ?? 0),
      0,
    );
    expect(route.totalDist).toBe(closed);
    const identity = (dm[0]?.[1] ?? 0) + (dm[1]?.[2] ?? 0) + (dm[2]?.[3] ?? 0) + (dm[3]?.[0] ?? 0);
    expect(route.totalDist).toBeLessThanOrEqual(identity);
  });

  it('memecah hari setelah lebih dari 10 jam', () => {
    // 8 × Taman Lapangan Banteng (1,5 j); tempuh diagonal 0 → jam: 1,5 3 4,5 6 7,5 9 | 10,5 → hari baru.
    const genes = Array<number>(8).fill(F.TLB);
    const days = daySuggestion(genes, [0, 1, 2, 3, 4, 5, 6, 7], attractions, matrices);
    expect(days.map((d) => d.length)).toEqual([6, 2]);
  });

  it('bug upstream: tempuh dibaca dari gen kromosom ke-(posisi−1), bukan simpul sebelumnya di rute', () => {
    // Rute NM → MS → ET. Seharusnya MS→ET ≈ 81 jam (293.429 s) sehingga ET pindah hari,
    // tetapi upstream membaca ET→ET (diagonal 0), jadi ketiganya tetap di hari yang sama.
    const genes = [F.NM, F.ET, F.MS];
    expect(daySuggestion(genes, [0, 2, 1], attractions, matrices)).toEqual([
      ['National Monument', 'Merdeka Square Jakarta', 'Museum of East Timor'],
    ]);
  });
});

describe('runType8', () => {
  const run = (seed: number) =>
    runType8({ attractions, matrices, nPeople: 2, budget: 3_000_000, days: 3, tags: ['history'], rng: createRng(seed) });

  it('deterministik untuk seed yang sama', () => {
    expect(run(42)).toEqual(run(42));
  });

  it('mengembalikan 1 + jumlah generasi entri, terurut menurun, dengan nilai sesuai evaluateV1', () => {
    const result = run(7);
    expect(result.generationsRun).toBeLessThanOrEqual(8);
    expect(result.results).toHaveLength(result.generationsRun + 1);
    for (let i = 1; i < result.results.length; i++) {
      expect(result.results[i - 1]?.fitness).toBeGreaterThanOrEqual(result.results[i]?.fitness ?? Infinity);
    }
    const ctx = { attractions, matrices, budget: 3_000_000, nPeople: 2, days: 3 };
    for (const r of result.results) expect(evaluateV1(r.genes, ctx)).toEqual(r);
  });

  it('berjalan pada data asli dengan parameter default main.py', () => {
    const real = loadRawDir(RAW_DIR).dataset;
    const result = runType8({
      attractions: real.attractions,
      matrices: real.matrices,
      nPeople: 2,
      budget: 3_000_000,
      days: 3,
      tags: ['museum', 'beach', 'kids-friendly'],
      rng: createRng(2021),
    });
    expect(result.eligibleCount).toBeGreaterThan(0);
    expect(result.results).toHaveLength(result.generationsRun + 1);
    expect(result.results.every((r) => Number.isFinite(r.fitness) && r.fitness > 0)).toBe(true);
  });
});
