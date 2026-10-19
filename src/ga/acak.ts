/**
 * Generator angka acak ber-seed (mulberry32): seed yang sama → hasil GA yang sama,
 * sehingga setiap eksperimen dapat direproduksi.
 */
export interface Rng {
  /** Bilangan riil di [0, 1). */
  next(): number;
  /** Bilangan bulat di [min, max], inklusif kedua ujung. */
  int(min: number, max: number): number;
  /** Bilangan bulat di [0, n). */
  below(n: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const below = (n: number): number => {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError(`below(n) butuh n bulat > 0, didapat ${n}`);
    return Math.floor(next() * n);
  };

  return {
    next,
    below,
    int: (min, max) => {
      if (max < min) throw new RangeError(`int(${min}, ${max}): rentang kosong`);
      return min + below(max - min + 1);
    },
    pick: (items) => {
      if (items.length === 0) throw new RangeError('pick() pada larik kosong');
      return items[below(items.length)] as (typeof items)[number];
    },
  };
}
