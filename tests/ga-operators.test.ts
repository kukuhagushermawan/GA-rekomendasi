import { describe, expect, it } from 'vitest';
import {
  addMutation,
  decode,
  fromRoute,
  insertMutation,
  mutate,
  onePointMaskCrossover,
  orderCrossover,
  orderCrossoverPair,
  randomChromosome,
  removeMutation,
  rouletteSampler,
  swapMutation,
  tournamentSelect,
  uniformMaskCrossover,
  writeRoute,
  type Chromosome,
} from '@/lib/ga';
import { createRng } from '@/lib/random';

/** Uji operator pada permutasi bilangan bulat abstrak (bukan data destinasi). */
const isPermutation = (arr: ArrayLike<number>, n: number) =>
  arr.length === n && [...Array.from(arr)].sort((a, b) => a - b).every((v, i) => v === i);

const chromosome = (order: number[], selected: number[]): Chromosome => {
  const mask = new Uint8Array(order.length);
  for (const g of selected) mask[g] = 1;
  return { mask, order: Int32Array.from(order) };
};

describe('kromosom dua bagian', () => {
  it('decode mengambil gen terpilih sesuai urutan di order', () => {
    expect(decode(chromosome([4, 0, 3, 1, 2], [1, 3, 4]))).toEqual([4, 3, 1]);
    expect(decode(chromosome([0, 1, 2], []))).toEqual([]);
  });

  it('writeRoute mempermutasi gen terpilih tanpa memindahkan posisinya', () => {
    const c = chromosome([4, 0, 3, 1, 2], [1, 3, 4]);
    writeRoute(c, [1, 4, 3]);
    expect(Array.from(c.order)).toEqual([1, 0, 4, 3, 2]);
    expect(decode(c)).toEqual([1, 4, 3]);
  });

  it('fromRoute menghasilkan permutasi sah yang terdekode tepat ke rute', () => {
    const rng = createRng(1);
    for (let t = 0; t < 50; t++) {
      const route = [7, 2, 9, 0, 5];
      const c = fromRoute(12, route, rng);
      expect(isPermutation(c.order, 12)).toBe(true);
      expect(decode(c)).toEqual(route);
    }
  });

  it('randomChromosome memilih tepat k gen', () => {
    const c = randomChromosome(20, 6, createRng(2));
    expect(isPermutation(c.order, 20)).toBe(true);
    expect(decode(c)).toHaveLength(6);
  });
});

describe('order crossover (OX)', () => {
  it('mereproduksi contoh klasik Davis (1985)', () => {
    // P1 = 1 2 3 | 4 5 6 7 | 8 9, P2 = 4 5 2 | 1 8 7 6 | 9 3 → anak = 2 1 8 4 5 6 7 9 3 (dikurangi 1).
    const p1 = Int32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const p2 = Int32Array.from([3, 4, 1, 0, 7, 6, 5, 8, 2]);
    expect(Array.from(orderCrossover(p1, p2, 3, 6))).toEqual([1, 0, 7, 3, 4, 5, 6, 8, 2]);
  });

  it('selalu menghasilkan permutasi sah dan mempertahankan segmen induk pertama', () => {
    const rng = createRng(3);
    for (let t = 0; t < 300; t++) {
      const n = 2 + rng.below(30);
      const p1 = randomChromosome(n, 0, rng).order;
      const p2 = randomChromosome(n, 0, rng).order;
      let i = rng.below(n);
      let j = rng.below(n);
      if (i > j) [i, j] = [j, i];
      const child = orderCrossover(p1, p2, i, j);
      expect(isPermutation(child, n)).toBe(true);
      expect(Array.from(child.slice(i, j + 1))).toEqual(Array.from(p1.slice(i, j + 1)));
      const [c1, c2] = orderCrossoverPair(p1, p2, rng);
      expect(isPermutation(c1, n) && isPermutation(c2, n)).toBe(true);
    }
  });
});

describe('crossover mask pemilihan', () => {
  const a = Uint8Array.from([1, 1, 1, 1, 0, 0, 0, 0]);
  const b = Uint8Array.from([0, 0, 0, 0, 1, 1, 1, 1]);

  it('uniform: tiap bit anak berasal dari salah satu induk di posisi yang sama', () => {
    const [c1, c2] = uniformMaskCrossover(a, b, createRng(4));
    for (let i = 0; i < a.length; i++) {
      expect((c1[i] as number) + (c2[i] as number)).toBe((a[i] as number) + (b[i] as number));
      expect([a[i], b[i]]).toContain(c1[i]);
    }
  });

  it('one-point: awalan dari induk sendiri, akhiran dari induk lain', () => {
    const [c1, c2] = onePointMaskCrossover(a, b, createRng(5));
    const cut = Array.from(c1).findIndex((bit, i) => bit !== a[i]);
    expect(cut).toBeGreaterThan(0);
    expect(Array.from(c1)).toEqual([...a.slice(0, cut), ...b.slice(cut)]);
    expect(Array.from(c2)).toEqual([...b.slice(0, cut), ...a.slice(cut)]);
  });
});

describe('mutasi', () => {
  const fresh = () => chromosome([5, 0, 3, 8, 1, 7, 2, 6, 4, 9], [0, 3, 8, 1, 7]);

  it('swap menukar tepat dua destinasi; himpunan tetap', () => {
    const c = fresh();
    const before = decode(c);
    expect(swapMutation(c, createRng(6))).toBe(true);
    const after = decode(c);
    expect([...after].sort()).toEqual([...before].sort());
    expect(after.filter((g, i) => g !== before[i])).toHaveLength(2);
  });

  it('insert memindahkan satu destinasi; himpunan tetap', () => {
    const c = fresh();
    const before = decode(c);
    expect(insertMutation(c, createRng(7))).toBe(true);
    const after = decode(c);
    expect([...after].sort()).toEqual([...before].sort());
    expect(after).not.toEqual(before);
  });

  it('add menambah satu destinasi baru, remove menghapus satu', () => {
    const c = fresh();
    const before = decode(c);
    expect(addMutation(c, createRng(8))).toBe(true);
    const added = decode(c);
    expect(added).toHaveLength(before.length + 1);
    expect(before.every((g) => added.includes(g))).toBe(true);
    expect(removeMutation(c, createRng(9))).toBe(true);
    expect(decode(c)).toHaveLength(before.length);
  });

  it('add lokal menyisipkan tetangga terdekat tepat setelah jangkarnya', () => {
    // Tetangga (2 per kandidat) disusun agar tiap kandidat punya tepat satu tetangga yang belum dipilih.
    const neighbors = Int32Array.from(Array.from({ length: 10 }, (_, g) => [g, (g + 1) % 10]).flat());
    const c = chromosome([0, 2, 4, 6, 8, 1, 3, 5, 7, 9], [0, 2, 4]);
    expect(addMutation(c, createRng(10), { neighbors, neighborCount: 2, localAddRate: 1 })).toBe(true);
    const route = decode(c);
    expect(route).toHaveLength(4);
    const added = route.find((g) => ![0, 2, 4].includes(g)) as number;
    expect(route[route.indexOf(added) - 1]).toBe(added - 1);
  });

  it('operator tidak berlaku pada kromosom yang terlalu pendek atau penuh', () => {
    expect(swapMutation(chromosome([0, 1, 2], [1]), createRng(11))).toBe(false);
    expect(removeMutation(chromosome([0, 1, 2], []), createRng(12))).toBe(false);
    expect(addMutation(chromosome([0, 1, 2], [0, 1, 2]), createRng(13))).toBe(false);
  });

  it('laju 0 tidak mengubah apa pun; laju 1 selalu mengubah', () => {
    const rng = createRng(14);
    const c = fresh();
    expect(mutate(c, 0, rng)).toEqual([]);
    expect(Array.from(c.order)).toEqual(Array.from(fresh().order));
    for (let t = 0; t < 20; t++) expect(mutate(fresh(), 1, rng).length).toBeGreaterThan(0);
  });

  it('rute kosong tetap bisa bertambah lewat mutasi', () => {
    const c = chromosome([0, 1, 2, 3], []);
    mutate(c, 1, createRng(15));
    expect(decode(c).length).toBeGreaterThan(0);
  });

  it('kromosom tetap sah setelah banyak mutasi acak', () => {
    const rng = createRng(16);
    const c = randomChromosome(30, 8, rng);
    for (let t = 0; t < 500; t++) mutate(c, 0.5, rng);
    expect(isPermutation(c.order, 30)).toBe(true);
    expect(new Set(decode(c)).size).toBe(decode(c).length);
  });
});

describe('seleksi', () => {
  it('turnamen dengan ukuran besar memilih individu terbaik', () => {
    const rng = createRng(17);
    expect(tournamentSelect([1, 5, 3, 2], 64, rng)).toBe(1);
  });

  /** Proporsi kemunculan tiap indeks dari `trials` kali pemanggilan `draw`. */
  const frequencies = (draw: () => number, size: number, trials: number): number[] => {
    const counts = new Array<number>(size).fill(0);
    for (let t = 0; t < trials; t++) {
      const i = draw();
      counts[i] = (counts[i] ?? 0) + 1;
    }
    return counts.map((c) => c / trials);
  };

  it('turnamen k = 3 (dengan pengembalian): frekuensi menang sesuai teori', () => {
    const rng = createRng(18);
    const freq = frequencies(() => tournamentSelect([1, 2, 3, 4, 5], 3, rng), 5, 10_000);
    // Peluang terburuk menang = (1/5)^3 = 0,8%; terbaik = 1 − (4/5)^3 = 48,8%.
    expect(freq[0]).toBeLessThan(0.02);
    expect(freq[4]).toBeCloseTo(0.488, 1);
  });

  it('roulette wheel: frekuensi sebanding fitness', () => {
    const rng = createRng(19);
    const spin = rouletteSampler([1, 2, 7]);
    const freq = frequencies(() => spin(rng), 3, 20_000);
    expect(freq[0]).toBeCloseTo(0.1, 1);
    expect(freq[1]).toBeCloseTo(0.2, 1);
    expect(freq[2]).toBeCloseTo(0.7, 1);
  });
});
