import type { Rng } from './acak';
import { decode, writeRoute, type Chromosome } from './kromosom';

/** LANGKAH 3 — OPERATOR GENETIKA: seleksi, crossover, mutasi. */

// ---- Seleksi ------------------------------------------------------------------------------------------

/** Turnamen: ambil k individu acak, pilih yang fitness-nya tertinggi. */
export function tournamentSelect(fitness: ArrayLike<number>, k: number, rng: Rng): number {
  let best = rng.below(fitness.length);
  for (let i = 1; i < k; i++) {
    const challenger = rng.below(fitness.length);
    if ((fitness[challenger] as number) > (fitness[best] as number)) best = challenger;
  }
  return best;
}

/** Roulette wheel: peluang terpilih sebanding dengan fitness. */
export function rouletteSampler(fitness: ArrayLike<number>): (rng: Rng) => number {
  const cumulative = new Float64Array(fitness.length);
  let total = 0;
  for (let i = 0; i < fitness.length; i++) cumulative[i] = total += Math.max(0, fitness[i] as number);
  return (rng) => {
    const r = rng.next() * total;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cumulative[mid] as number) > r) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
}

// ---- Crossover ----------------------------------------------------------------------------------------

/** Uniform crossover (bagian pemilihan): tiap bit ditukar dengan peluang ½. */
export function uniformCrossover(a: Uint8Array, b: Uint8Array, rng: Rng): [Uint8Array, Uint8Array] {
  const c1 = a.slice();
  const c2 = b.slice();
  for (let i = 0; i < a.length; i++) {
    if (rng.next() < 0.5) {
      c1[i] = b[i] as number;
      c2[i] = a[i] as number;
    }
  }
  return [c1, c2];
}

/** One-point crossover (bagian pemilihan): ekor setelah titik potong ditukar. */
export function onePointCrossover(a: Uint8Array, b: Uint8Array, rng: Rng): [Uint8Array, Uint8Array] {
  const cut = rng.int(1, Math.max(1, a.length - 1));
  const c1 = a.slice();
  const c2 = b.slice();
  c1.set(b.subarray(cut), cut);
  c2.set(a.subarray(cut), cut);
  return [c1, c2];
}

/**
 * Order crossover / OX (bagian urutan): segmen [i..j] disalin dari induk 1, sisanya diisi gen induk 2
 * sesuai urutan kemunculannya mulai setelah j. Anak selalu permutasi yang sah.
 *   P1 = 1 2 3 | 4 5 6 7 | 8 9,  P2 = 4 5 2 | 1 8 7 6 | 9 3  →  anak = 2 1 8 | 4 5 6 7 | 9 3
 */
export function orderCrossover(p1: Int32Array, p2: Int32Array, i: number, j: number): Int32Array {
  const n = p1.length;
  const child = new Int32Array(n);
  const taken = new Uint8Array(n);
  for (let k = i; k <= j; k++) {
    child[k] = p1[k] as number;
    taken[p1[k] as number] = 1;
  }
  let write = (j + 1) % n;
  for (let step = 0; step < n; step++) {
    const g = p2[(j + 1 + step) % n] as number;
    if (taken[g]) continue;
    child[write] = g;
    write = (write + 1) % n;
  }
  return child;
}

export function orderCrossoverPair(p1: Int32Array, p2: Int32Array, rng: Rng): [Int32Array, Int32Array] {
  let i = rng.below(p1.length);
  let j = rng.below(p1.length);
  if (i > j) [i, j] = [j, i];
  return [orderCrossover(p1, p2, i, j), orderCrossover(p2, p1, i, j)];
}

// ---- Mutasi --------------------------------------------------------------------------------------------

export type MutationKind = 'swap' | 'insert' | 'tambah' | 'hapus';

/** Tetangga terdekat tiap kandidat, dipakai mutasi "tambah". */
export interface Neighbors {
  list: Int32Array;
  count: number;
}

const pickTwo = (n: number, rng: Rng): [number, number] => {
  const a = rng.below(n);
  let b = rng.below(n - 1);
  if (b >= a) b++;
  return [a, b];
};

/** Swap: tukar posisi dua destinasi. */
export function swapMutation(c: Chromosome, rng: Rng): boolean {
  const route = decode(c);
  if (route.length < 2) return false;
  const [a, b] = pickTwo(route.length, rng);
  [route[a], route[b]] = [route[b] as number, route[a] as number];
  writeRoute(c, route);
  return true;
}

/** Insert: pindahkan satu destinasi ke posisi lain. */
export function insertMutation(c: Chromosome, rng: Rng): boolean {
  const route = decode(c);
  if (route.length < 2) return false;
  const [from, to] = pickTwo(route.length, rng);
  const [g] = route.splice(from, 1);
  route.splice(to, 0, g as number);
  writeRoute(c, route);
  return true;
}

/**
 * Tambah destinasi. Dengan peluang 80% dipilih salah satu dari 10 tetangga terdekat sebuah destinasi
 * di rute dan disisipkan tepat setelahnya (tidak membuat rute memutar jauh); sisanya kandidat acak.
 */
export function addMutation(c: Chromosome, rng: Rng, neighbors?: Neighbors, localRate = 0.8): boolean {
  const route = decode(c);
  if (neighbors && route.length > 0 && rng.next() < localRate) {
    const anchor = rng.pick(route);
    const options: number[] = [];
    for (let k = 0; k < neighbors.count; k++) {
      const g = neighbors.list[anchor * neighbors.count + k] as number;
      if (c.mask[g] === 0) options.push(g);
    }
    if (options.length > 0) {
      const g = rng.pick(options);
      c.mask[g] = 1;
      const next = decode(c).filter((x) => x !== g);
      next.splice(next.indexOf(anchor) + 1, 0, g);
      writeRoute(c, next);
      return true;
    }
  }
  const unselected: number[] = [];
  for (let g = 0; g < c.mask.length; g++) if (c.mask[g] === 0) unselected.push(g);
  if (unselected.length === 0) return false;
  c.mask[rng.pick(unselected)] = 1;
  return true;
}

/** Hapus satu destinasi dari rute. */
export function removeMutation(c: Chromosome, rng: Rng): boolean {
  const route = decode(c);
  if (route.length === 0) return false;
  c.mask[rng.pick(route)] = 0;
  return true;
}

/**
 * Untuk setiap destinasi di rute (minimal sekali), dengan peluang `rate` dijalankan satu mutasi acak
 * di antara yang bisa diterapkan.
 */
export function mutate(c: Chromosome, rate: number, rng: Rng, neighbors?: Neighbors): MutationKind[] {
  const applied: MutationKind[] = [];
  const trials = Math.max(1, decode(c).length);
  for (let t = 0; t < trials; t++) {
    if (rng.next() >= rate) continue;
    const length = c.mask.reduce((s, bit) => s + bit, 0);
    const options: MutationKind[] = [];
    if (length >= 2) options.push('swap', 'insert');
    if (length < c.mask.length) options.push('tambah');
    if (length >= 1) options.push('hapus');
    if (options.length === 0) continue;
    const kind = rng.pick(options);
    const ok =
      kind === 'swap'
        ? swapMutation(c, rng)
        : kind === 'insert'
          ? insertMutation(c, rng)
          : kind === 'tambah'
            ? addMutation(c, rng, neighbors)
            : removeMutation(c, rng);
    if (ok) applied.push(kind);
  }
  return applied;
}
