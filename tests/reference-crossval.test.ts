import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRawDir } from '@/lib/data/node';
import { UPSTREAM, daySuggestion, evaluateV1, parseNewResults, sumCost } from '@/lib/reference';
import { RAW_DIR, ROOT } from './helpers';

/**
 * Regresi validasi silang deterministik (docs/validasi_silang.md §A–B): port harus mereproduksi
 * setiap angka di newresults.txt upstream secara bit-per-bit.
 */
const { dataset } = loadRawDir(RAW_DIR);
const { attractions, matrices } = dataset;
const byKey = new Map(attractions.map((a, i) => [a.matrixKey, i]));
const runs = parseNewResults(readFileSync(path.join(ROOT, 'reference', 'upstream', 'newresults.txt'), 'utf8'));
const results = runs.flat();
const { budget, nPeople, days } = UPSTREAM.DEFAULTS;

describe('newresults.txt upstream', () => {
  it('berisi 27 run × 9 hasil dan semua nama destinasinya ada di dataset', () => {
    expect(runs).toHaveLength(27);
    expect(runs.every((r) => r.length === 9)).toBe(true);
    for (const r of results) for (const s of r.spots) expect(byKey.has(s)).toBe(true);
  });

  it('evaluateV1 mereproduksi fitness, HTM, biaya, dan durasi secara identik (243/243)', () => {
    for (const r of results) {
      const genes = r.spots.map((s) => byKey.get(s) as number);
      const e = evaluateV1(genes, { attractions, matrices, budget, nPeople, days });
      expect(e.fitness).toBe(r.fitness);
      expect(sumCost(genes, attractions) * nPeople).toBe(r.HTM);
      expect(e.travelExpenses).toBe(r.travelExpenses);
      expect(e.totalCost).toBe(r.totalExpenses);
      expect(e.totalHours).toBe(r.totalDuration);
      expect(e.travelHours).toBe(r.travelDuration);
    }
  });

  it('daySuggestion mereproduksi per-day-route secara identik (243/243)', () => {
    for (const r of results) {
      const genes = r.spots.map((s) => byKey.get(s) as number);
      expect(daySuggestion(genes, r['route-by-index'], attractions, matrices)).toEqual(r['per-day-route']);
    }
  });
});
