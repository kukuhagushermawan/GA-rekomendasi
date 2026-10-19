import type { Rng } from './acak';

/**
 * LANGKAH 1 — REPRESENTASI KROMOSOM
 * Masalah ini gabungan Knapsack (memilih destinasi) + TSP (mengurutkan rute), jadi kromosom punya dua bagian:
 *
 *   mask  = [0,1,0,1,1]   → kandidat 1, 3, 4 dipilih          (bagian Knapsack)
 *   order = [4,0,3,1,2]   → urutan relatif semua kandidat     (bagian TSP)
 *   rute  = elemen `order` yang mask-nya 1 → 4 → 3 → 1
 *
 * Setiap kromosom selalu terdekode menjadi rute tanpa duplikat, sehingga tidak perlu perbaikan.
 */
export interface Chromosome {
  mask: Uint8Array;
  order: Int32Array;
}

/** Dekode kromosom → rute (daftar indeks kandidat berurutan). */
export function decode(c: Chromosome): number[] {
  const route: number[] = [];
  for (let i = 0; i < c.order.length; i++) {
    const g = c.order[i] as number;
    if (c.mask[g] === 1) route.push(g);
  }
  return route;
}

/** Menulis ulang urutan gen terpilih (route = permutasi gen yang sedang terpilih); posisinya tetap. */
export function writeRoute(c: Chromosome, route: readonly number[]): void {
  let k = 0;
  for (let i = 0; i < c.order.length; i++) {
    if (c.mask[c.order[i] as number] === 1) c.order[i] = route[k++] as number;
  }
}

export const cloneChromosome = (c: Chromosome): Chromosome => ({ mask: c.mask.slice(), order: c.order.slice() });

/** Pengacakan Fisher–Yates. */
export function shuffle<T extends Int32Array | number[]>(arr: T, rng: Rng): T {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.below(i + 1);
    const tmp = arr[i] as number;
    arr[i] = arr[j] as number;
    arr[j] = tmp;
  }
  return arr;
}

const range = (n: number) => Int32Array.from({ length: n }, (_, i) => i);

/** Kromosom acak: `k` kandidat terpilih dengan urutan acak. */
export function randomChromosome(n: number, k: number, rng: Rng): Chromosome {
  const mask = new Uint8Array(n);
  const picks = shuffle(range(n), rng);
  for (let i = 0; i < Math.min(k, n); i++) mask[picks[i] as number] = 1;
  return { mask, order: shuffle(range(n), rng) };
}

/** Menyandikan rute ke kromosom: gen rute ditaruh di posisi acak (terurut) di `order`. */
export function fromRoute(n: number, route: readonly number[], rng: Rng): Chromosome {
  const mask = new Uint8Array(n);
  for (const g of route) mask[g] = 1;
  const slots = shuffle(range(n), rng).slice(0, route.length).sort();
  const others = shuffle(Array.from({ length: n }, (_, i) => i).filter((g) => mask[g] === 0), rng);
  const order = new Int32Array(n).fill(-1);
  slots.forEach((slot, k) => (order[slot] = route[k] as number));
  let o = 0;
  for (let p = 0; p < n; p++) if (order[p] === -1) order[p] = others[o++] as number;
  return { mask, order };
}
