import { describe, expect, it } from 'vitest';
import { ksTwoSample, mean, quantile, stdDev, summarize } from '@/lib/stats';

describe('statistik deskriptif', () => {
  it('mean, simpangan baku sampel, kuantil', () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(xs)).toBe(5);
    expect(stdDev(xs)).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(quantile(xs, 0.5)).toBe(4.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(summarize(xs)).toMatchObject({ n: 8, min: 2, max: 9, median: 4.5 });
    expect(stdDev([3])).toBe(0);
  });
});

describe('ksTwoSample', () => {
  it('D = 0 dan p = 1 untuk sampel identik', () => {
    expect(ksTwoSample([1, 2, 3, 4], [1, 2, 3, 4])).toEqual({ d: 0, p: 1 });
  });

  it('D = 1 dan p kecil untuk sampel yang terpisah total', () => {
    const a = Array.from({ length: 30 }, (_, i) => i);
    const b = Array.from({ length: 30 }, (_, i) => 100 + i);
    const r = ksTwoSample(a, b);
    expect(r.d).toBe(1);
    expect(r.p).toBeLessThan(1e-6);
  });

  it('menghitung D dengan benar pada sampel yang bertumpang tindih', () => {
    // F_a melompat di 1,2,3; F_b di 2,3,4 → selisih maksimum 1/3.
    expect(ksTwoSample([1, 2, 3], [2, 3, 4]).d).toBeCloseTo(1 / 3, 12);
  });
});
