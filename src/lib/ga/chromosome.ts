import type { Rng } from '../random';

/**
 * Kromosom dua bagian (docs/desain_ga.md §2):
 * - `mask[g]` = 1 bila kandidat g dipilih (bagian Knapsack);
 * - `order`   = permutasi seluruh kandidat 0..n-1 (bagian TSP).
 * Rute = elemen `order` yang mask-nya 1, sesuai urutan kemunculan. Setiap kromosom selalu
 * terdekode menjadi rute tanpa duplikat.
 */
export interface Chromosome {
  mask: Uint8Array;
  order: Int32Array;
}

export function decode(c: Chromosome): number[] {
  const route: number[] = [];
  for (let i = 0; i < c.order.length; i++) {
    const g = c.order[i] as number;
    if (c.mask[g] === 1) route.push(g);
  }
  return route;
}

export const cloneChromosome = (c: Chromosome): Chromosome => ({ mask: c.mask.slice(), order: c.order.slice() });

/** Fisher–Yates. */
export function shuffleInPlace<T extends Int32Array | number[]>(arr: T, rng: Rng): T {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.below(i + 1);
    const tmp = arr[i] as number;
    arr[i] = arr[j] as number;
    arr[j] = tmp;
  }
  return arr;
}

/** Kromosom acak dengan `k` kandidat terpilih dan urutan acak. */
export function randomChromosome(n: number, k: number, rng: Rng): Chromosome {
  const order = shuffleInPlace(Int32Array.from({ length: n }, (_, i) => i), rng);
  const mask = new Uint8Array(n);
  const picks = shuffleInPlace(Int32Array.from({ length: n }, (_, i) => i), rng);
  for (let i = 0; i < Math.min(k, n); i++) mask[picks[i] as number] = 1;
  return { mask, order };
}

/**
 * Menyandikan rute ke kromosom: gen rute ditempatkan pada posisi acak (terurut) di `order`,
 * sisanya diisi kandidat lain secara acak — agar posisi gen terpilih tidak selalu di depan.
 */
export function fromRoute(n: number, route: readonly number[], rng: Rng): Chromosome {
  const mask = new Uint8Array(n);
  for (const g of route) mask[g] = 1;
  const positions = shuffleInPlace(Int32Array.from({ length: n }, (_, i) => i), rng)
    .slice(0, route.length)
    .sort();
  const others = shuffleInPlace(Int32Array.from({ length: n }, (_, i) => i).filter((g) => mask[g] === 0), rng);
  const order = new Int32Array(n);
  const isRouteSlot = new Uint8Array(n);
  positions.forEach((p, k) => {
    order[p] = route[k] as number;
    isRouteSlot[p] = 1;
  });
  let o = 0;
  for (let p = 0; p < n; p++) if (isRouteSlot[p] === 0) order[p] = others[o++] as number;
  return { mask, order };
}

/**
 * Menulis ulang urutan gen terpilih: `route` harus permutasi dari gen yang sedang terpilih.
 * Posisi-posisi gen terpilih di `order` tetap; hanya isinya yang dipermutasi.
 */
export function writeRoute(c: Chromosome, route: readonly number[]): void {
  let k = 0;
  for (let i = 0; i < c.order.length; i++) {
    if (c.mask[c.order[i] as number] === 1) c.order[i] = route[k++] as number;
  }
}
