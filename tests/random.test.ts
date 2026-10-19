import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/random';

describe('createRng', () => {
  it('seed yang sama menghasilkan barisan yang sama', () => {
    const a = createRng(123);
    const b = createRng(123);
    expect(Array.from({ length: 50 }, () => a.next())).toEqual(Array.from({ length: 50 }, () => b.next()));
  });

  it('seed berbeda menghasilkan barisan berbeda', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 10 }, () => a.next())).not.toEqual(Array.from({ length: 10 }, () => b.next()));
  });

  it('next() di [0, 1); int(min, max) inklusif kedua ujung; below(n) di [0, n)', () => {
    const rng = createRng(7);
    const ints = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      ints.add(rng.int(1, 4));
      const b = rng.below(3);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(3);
    }
    expect([...ints].sort()).toEqual([1, 2, 3, 4]);
  });

  it('menolak rentang kosong', () => {
    const rng = createRng(0);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
    expect(() => rng.below(0)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});
