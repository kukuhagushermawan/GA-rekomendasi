/** Statistik deskriptif dan uji Kolmogorov–Smirnov dua sampel untuk eksperimen & validasi silang. */

export const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Simpangan baku sampel (pembagi n − 1). */
export function stdDev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Kuantil dengan interpolasi linear (metode R-7 / Excel). */
export function quantile(xs: readonly number[], q: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo);
}

export interface Summary {
  n: number;
  mean: number;
  sd: number;
  min: number;
  median: number;
  max: number;
}

export const summarize = (xs: readonly number[]): Summary => ({
  n: xs.length,
  mean: mean(xs),
  sd: stdDev(xs),
  min: Math.min(...xs),
  median: quantile(xs, 0.5),
  max: Math.max(...xs),
});

/**
 * Uji KS dua sampel. Mengembalikan statistik D dan p-value asimtotik (Numerical Recipes §14.3):
 * p = Q_KS((√nₑ + 0,12 + 0,11/√nₑ) · D), nₑ = n₁n₂/(n₁+n₂).
 */
export function ksTwoSample(a: readonly number[], b: readonly number[]): { d: number; p: number } {
  const xs = [...a].sort((x, y) => x - y);
  const ys = [...b].sort((x, y) => x - y);
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < xs.length && j < ys.length) {
    const v = Math.min(xs[i] as number, ys[j] as number);
    while (i < xs.length && (xs[i] as number) <= v) i++;
    while (j < ys.length && (ys[j] as number) <= v) j++;
    d = Math.max(d, Math.abs(i / xs.length - j / ys.length));
  }
  const ne = Math.sqrt((xs.length * ys.length) / (xs.length + ys.length));
  const lambda = (ne + 0.12 + 0.11 / ne) * d;
  let p = 0;
  for (let k = 1; k <= 100; k++) {
    const term = 2 * (k % 2 === 1 ? 1 : -1) * Math.exp(-2 * k * k * lambda * lambda);
    p += term;
    if (Math.abs(term) < 1e-12) break;
  }
  return { d, p: Math.min(1, Math.max(0, lambda === 0 ? 1 : p)) };
}
