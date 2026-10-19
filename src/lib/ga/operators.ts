import type { Rng } from '../random';
import { decode, writeRoute, type Chromosome } from './chromosome';

// ---- Seleksi -----------------------------------------------------------------------------------------

/** Turnamen: ambil `k` individu acak (dengan pengembalian), menangkan yang fitness-nya tertinggi. */
export function tournamentSelect(fitness: ArrayLike<number>, k: number, rng: Rng): number {
  let best = rng.below(fitness.length);
  for (let i = 1; i < k; i++) {
    const challenger = rng.below(fitness.length);
    if ((fitness[challenger] as number) > (fitness[best] as number)) best = challenger;
  }
  return best;
}

/**
 * Roulette wheel: peluang terpilih sebanding fitness (fitness selalu > 0 pada fungsi ini).
 * Kumulatif dihitung sekali per generasi; tiap putaran memakai pencarian biner.
 */
export function rouletteSampler(fitness: ArrayLike<number>): (rng: Rng) => number {
  const cumulative = new Float64Array(fitness.length);
  let total = 0;
  for (let i = 0; i < fitness.length; i++) {
    total += Math.max(0, fitness[i] as number);
    cumulative[i] = total;
  }
  return (rng) => {
    if (total <= 0) return rng.below(fitness.length);
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

// ---- Crossover ---------------------------------------------------------------------------------------

/** Uniform crossover pada mask pemilihan: tiap bit ditukar dengan peluang 0,5. */
export function uniformMaskCrossover(a: Uint8Array, b: Uint8Array, rng: Rng): [Uint8Array, Uint8Array] {
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

/** One-point crossover pada mask pemilihan: ekor setelah titik potong ditukar. */
export function onePointMaskCrossover(a: Uint8Array, b: Uint8Array, rng: Rng): [Uint8Array, Uint8Array] {
  if (a.length < 2) return [a.slice(), b.slice()];
  const cut = rng.int(1, a.length - 1);
  const c1 = a.slice();
  const c2 = b.slice();
  c1.set(b.subarray(cut), cut);
  c2.set(a.subarray(cut), cut);
  return [c1, c2];
}

/**
 * Order crossover (OX1, Davis 1985) pada permutasi `order`: segmen [i, j] disalin dari induk pertama,
 * posisi lain diisi gen induk kedua sesuai urutan kemunculannya mulai setelah j (melingkar).
 * Anak selalu berupa permutasi yang sah.
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
    if (taken[g] === 1) continue;
    child[write] = g;
    taken[g] = 1;
    write = (write + 1) % n;
  }
  return child;
}

export function orderCrossoverPair(p1: Int32Array, p2: Int32Array, rng: Rng): [Int32Array, Int32Array] {
  const n = p1.length;
  let i = rng.below(n);
  let j = rng.below(n);
  if (i > j) [i, j] = [j, i];
  return [orderCrossover(p1, p2, i, j), orderCrossover(p2, p1, i, j)];
}

// ---- Mutasi ------------------------------------------------------------------------------------------

export type MutationKind = 'swap' | 'insert' | 'add' | 'remove';

/** Tukar posisi dua destinasi di rute. */
export function swapMutation(c: Chromosome, rng: Rng): boolean {
  const route = decode(c);
  if (route.length < 2) return false;
  const a = rng.below(route.length);
  let b = rng.below(route.length - 1);
  if (b >= a) b++;
  [route[a], route[b]] = [route[b] as number, route[a] as number];
  writeRoute(c, route);
  return true;
}

/** Pindahkan satu destinasi ke posisi lain di rute. */
export function insertMutation(c: Chromosome, rng: Rng): boolean {
  const route = decode(c);
  if (route.length < 2) return false;
  const from = rng.below(route.length);
  let to = rng.below(route.length - 1);
  if (to >= from) to++;
  const [g] = route.splice(from, 1);
  route.splice(to, 0, g as number);
  writeRoute(c, route);
  return true;
}

/** Informasi masalah yang dipakai mutasi tambah-lokal. */
export interface MutationContext {
  /** Tetangga terdekat per kandidat, row-major `neighborCount` kolom. */
  neighbors: Int32Array;
  neighborCount: number;
  /** Peluang mutasi tambah memilih tetangga terdekat salah satu destinasi rute (sisanya acak global). */
  localAddRate: number;
}

/**
 * Tambah satu destinasi yang belum dipilih.
 * - Lokal (peluang `localAddRate`): pilih destinasi rute secara acak sebagai jangkar, ambil salah satu
 *   tetangga terdekatnya yang belum dipilih, sisipkan tepat setelah jangkar.
 * - Global: kandidat acak mana pun; letaknya di rute mengikuti posisinya di `order`.
 */
export function addMutation(c: Chromosome, rng: Rng, ctx?: MutationContext): boolean {
  if (ctx && rng.next() < ctx.localAddRate) {
    const route = decode(c);
    if (route.length > 0) {
      const anchorPos = rng.below(route.length);
      const anchor = route[anchorPos] as number;
      const options: number[] = [];
      for (let k = 0; k < ctx.neighborCount; k++) {
        const g = ctx.neighbors[anchor * ctx.neighborCount + k] as number;
        if (c.mask[g] === 0) options.push(g);
      }
      if (options.length > 0) {
        const g = rng.pick(options);
        c.mask[g] = 1;
        const withG = decode(c).filter((x) => x !== g);
        withG.splice(withG.indexOf(anchor) + 1, 0, g);
        writeRoute(c, withG);
        return true;
      }
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
  const selected: number[] = [];
  for (let g = 0; g < c.mask.length; g++) if (c.mask[g] === 1) selected.push(g);
  if (selected.length === 0) return false;
  c.mask[rng.pick(selected)] = 0;
  return true;
}

const MUTATIONS: Record<MutationKind, (c: Chromosome, rng: Rng, ctx?: MutationContext) => boolean> = {
  swap: swapMutation,
  insert: insertMutation,
  add: addMutation,
  remove: removeMutation,
};

/**
 * Mutasi per gen: untuk tiap destinasi di rute (minimal satu percobaan agar rute kosong tetap bisa
 * bertambah), dengan peluang `rate` satu operator dipilih acak di antara yang dapat diterapkan.
 * Mengembalikan daftar operator yang benar-benar diterapkan.
 */
export function mutate(c: Chromosome, rate: number, rng: Rng, ctx?: MutationContext): MutationKind[] {
  const applied: MutationKind[] = [];
  let length = 0;
  for (let g = 0; g < c.mask.length; g++) length += c.mask[g] as number;
  const trials = Math.max(1, length);
  for (let t = 0; t < trials; t++) {
    if (rng.next() >= rate) continue;
    const selected = c.mask.reduce((sum, bit) => sum + bit, 0);
    const options: MutationKind[] = [];
    if (selected >= 2) options.push('swap', 'insert');
    if (selected < c.mask.length) options.push('add');
    if (selected >= 1) options.push('remove');
    if (options.length === 0) continue;
    const kind = rng.pick(options);
    if (MUTATIONS[kind](c, rng, ctx)) applied.push(kind);
  }
  return applied;
}
