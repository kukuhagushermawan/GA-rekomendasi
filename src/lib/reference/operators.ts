import type { Attraction } from '../data/schema';
import type { Rng } from '../random';
import { UPSTREAM } from './constants';
import type { Evaluated } from './evaluate';

/**
 * Port perilaku operator GA di utils.py (GPL-3.0), TERMASUK bug-nya, agar bisa dibandingkan dengan
 * newresults.txt. Bug didokumentasikan di docs/audit_referensi.md §4 dan ditandai `UPSTREAM-BUG` di sini.
 * Gen = indeks atraksi pada `Dataset.attractions`.
 */

/** Batas iterasi pengaman untuk loop yang di Python berpotensi tak berujung. */
const GUARD = 100_000;

/** getTaggedDest: atraksi yang memiliki minimal SATU tag preferensi, urutan sesuai berkas. */
export function getTaggedDest(attractions: readonly Attraction[], tags: readonly string[]): number[] {
  const eligible: number[] = [];
  attractions.forEach((a, i) => {
    if (tags.some((t) => a.tags.includes(t))) eligible.push(i);
  });
  return eligible;
}

/**
 * generateDynamic: 40 kromosom, tiap kromosom diisi acak dari `genePool` sampai jam kunjungan ≥ days×7
 * ATAU total HTM×orang ≥ budget×costRate.
 * UPSTREAM-BUG: pengecekan duplikat memakai `x in spots` (int vs objek Destination) sehingga selalu lolos —
 * kromosom awal boleh berisi atraksi yang sama berulang. Diport apa adanya (satu undian per gen).
 */
export function generateDynamic(
  genePool: readonly number[],
  attractions: readonly Attraction[],
  days: number,
  budget: number,
  nPeople: number,
  costRate: number,
  rng: Rng,
): number[][] {
  const budgetThreshold = budget * costRate;
  const durationThreshold = days * UPSTREAM.INIT_HOURS_PER_DAY;
  const population: number[][] = [];
  for (let i = 0; i < UPSTREAM.POPULATION_SIZE; i++) {
    let tDuration = 0;
    let tBudget = 0;
    const spots: number[] = [];
    for (let guard = 0; tDuration < durationThreshold && tBudget < budgetThreshold; guard++) {
      if (guard >= GUARD) throw new Error('generateDynamic: genePool tidak pernah mencapai ambang (durasi & harga 0)');
      const gene = genePool[rng.int(0, genePool.length - 1)] as number;
      const a = attractions[gene] as Attraction;
      tDuration += a.visitHours;
      tBudget += a.ticketPriceIdr * nPeople;
      spots.push(gene);
    }
    population.push(spots);
  }
  return population;
}

/** Kesetaraan nilai list Python `[Chromosome, f, c, d, te, td]`: Chromosome dibandingkan berdasarkan identitas. */
const sameEntry = (a: Evaluated, b: Evaluated): boolean =>
  a.genes === b.genes &&
  a.fitness === b.fitness &&
  a.totalCost === b.totalCost &&
  a.totalHours === b.totalHours &&
  a.travelExpenses === b.travelExpenses &&
  a.travelHours === b.travelHours;

/**
 * selection: 40 turnamen biner.
 * UPSTREAM-BUG: membandingkan `ch1[1] > ch2[2]` = fitness ch1 vs TOTAL BIAYA ch2. Karena biaya (jutaan rupiah)
 * hampir selalu jauh lebih besar dari fitness (<~2), ch2 hampir selalu menang → seleksi praktis acak.
 * Hasil berupa salinan dangkal (genes dipakai bersama, seperti `list.copy()`).
 */
export function selection(population: readonly Evaluated[], rng: Rng): Evaluated[] {
  const selected: Evaluated[] = [];
  for (let i = 0; i < UPSTREAM.POPULATION_SIZE; i++) {
    const ch1 = population[rng.below(population.length)] as Evaluated;
    let ch2 = population[rng.below(population.length)] as Evaluated;
    // Python mengulang tanpa batas; di sini dibatasi agar populasi seragam tidak membuat hang.
    for (let guard = 0; sameEntry(ch1, ch2) && guard < GUARD; guard++) {
      ch2 = population[rng.below(population.length)] as Evaluated;
    }
    selected.push(ch1.fitness > ch2.totalCost ? { ...ch1 } : { ...ch2 });
  }
  return selected;
}

/** getDuplicateIndex: indeks elemen yang sudah muncul sebelumnya. */
export function getDuplicateIndex(genes: readonly number[]): number[] {
  const seen = new Set<number>();
  const dup: number[] = [];
  genes.forEach((g, i) => {
    if (seen.has(g)) dup.push(i);
    else seen.add(g);
  });
  return dup;
}

/**
 * cutter: memotong daftar gen pada posisi pertama ketika kumulatif jam kunjungan ≥ days×10
 * ATAU kumulatif HTM×orang ≥ budget (biaya taksi tidak dihitung). Gen pemicu tidak disertakan.
 */
export function cutter(
  spots: readonly number[],
  attractions: readonly Attraction[],
  days: number,
  budget: number,
  nPeople: number,
): number[] {
  const durationThreshold = days * UPSTREAM.EVAL_HOURS_PER_DAY;
  let totalDuration = 0;
  let totalBudget = 0;
  const cut: number[] = [];
  for (const g of spots) {
    const a = attractions[g] as Attraction;
    totalBudget += a.ticketPriceIdr * nPeople;
    totalDuration += a.visitHours;
    if (totalDuration >= durationThreshold || totalBudget >= budget) return cut;
    cut.push(g);
  }
  return cut;
}

function repairDuplicates(genes: number[], genePool: readonly number[], rng: Rng): void {
  // Indeks duplikat dihitung SEBELUM perbaikan, sama seperti Python.
  for (const index of getDuplicateIndex(genes)) {
    let exchange = rng.pick(genePool);
    let counter = 0;
    while (genes.includes(exchange) && counter < 10) {
      exchange = rng.pick(genePool);
      counter += 1;
    }
    // Setelah 10 percobaan, duplikat tetap boleh masuk (perilaku upstream).
    genes[index] = exchange;
  }
}

/**
 * crossv2: one-point crossover dengan titik potong BERBEDA di tiap induk (cut1, cut2), tukar ekor,
 * perbaiki duplikat dengan gen acak dari genePool (maks. 10 percobaan), lalu potong dengan cutter.
 * Bila salah satu induk ≤ 1 gen, kedua induk dikembalikan apa adanya (referensi array yang sama).
 */
export function crossv2(
  genePool: readonly number[],
  parent1: number[],
  parent2: number[],
  attractions: readonly Attraction[],
  days: number,
  budget: number,
  nPeople: number,
  rng: Rng,
): [number[], number[]] {
  if (parent1.length <= 1 || parent2.length <= 1) return [parent1, parent2];

  const cut1 = rng.int(1, parent1.length - 1);
  const cut2 = rng.int(1, parent2.length - 1);
  const start1 = [...parent1.slice(0, cut1), ...parent2.slice(cut2)];
  const start2 = [...parent2.slice(0, cut2), ...parent1.slice(cut1)];

  repairDuplicates(start1, genePool, rng);
  repairDuplicates(start2, genePool, rng);

  return [
    cutter(start1, attractions, days, budget, nPeople),
    cutter(start2, attractions, days, budget, nPeople),
  ];
}

/**
 * mutate: dengan peluang `chance`, satu gen acak diganti gen dari genePool yang belum ada di kromosom.
 * UPSTREAM: fungsi ini TIDAK PERNAH dipanggil oleh type8 di main.py; diport untuk kelengkapan.
 * Python gagal untuk kromosom kosong (randint(0, -1)) atau bila genePool habis; di sini dilewati.
 */
export function mutate(population: number[][], genePool: readonly number[], chance: number, rng: Rng): void {
  for (const genes of population) {
    if (rng.next() > chance) continue;
    if (genes.length === 0 || genePool.every((g) => genes.includes(g))) continue;
    const i = rng.int(0, genes.length - 1);
    let x = genePool[rng.int(0, genePool.length - 1)] as number;
    while (genes.includes(x)) x = genePool[rng.int(0, genePool.length - 1)] as number;
    genes[i] = x;
  }
}
