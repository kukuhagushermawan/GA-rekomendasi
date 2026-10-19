import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/data/csv';
import { fromProcessed, toMatrixKey } from '@/lib/data/load';
import { loadRawDir, RAW_FILES } from '@/lib/data/node';
import { FIXTURE_DIR, RAW_DIR, ROOT } from './helpers';

/** Fakta hasil audit data asli (docs/audit_referensi.md §2). Gagal bila data/raw berubah. */
describe('data asli upstream (data/raw)', () => {
  const { dataset, audit } = loadRawDir(RAW_DIR);

  it('berisi 201 atraksi; matriks 202 label dengan satu label non-atraksi "Jakarta"', () => {
    expect(audit.attractionCount).toBe(201);
    expect(audit.matrixSize).toBe(202);
    expect(audit.extraMatrixLabels).toEqual(['Jakarta']);
  });

  it('field `number` = posisi atraksi di matriks upstream untuk semua atraksi', () => {
    expect(audit.numberMismatch).toEqual([]);
  });

  it('memiliki 8 tag dengan jumlah yang diaudit', () => {
    expect(audit.tagCounts).toEqual({
      outdoors: 81,
      'kids-friendly': 68,
      museum: 43,
      'art-and-culture': 31,
      history: 24,
      'amusement-park': 21,
      beach: 9,
      'local-favorite': 8,
    });
    expect(audit.unknownTags).toEqual([]);
  });

  it('mencatat nilai kosong/khusus pada data atraksi', () => {
    expect(audit.freeAttractions).toBe(92);
    expect(audit.zeroVisitDuration).toEqual(['Monumen Patung Dirgantara']);
    expect(audit.missingRating).toHaveLength(5);
    expect(audit.namesWithComma).toHaveLength(3);
  });

  it('mencatat sel matriks yang hilang dan bernilai nol', () => {
    for (const m of [audit.distance, audit.duration]) {
      expect(m.missingCells).toBe(401);
      expect(m.nonZeroDiagonal).toEqual(['Nofri kasur']);
      expect(m.zeroOffDiagonal).toHaveLength(4);
    }
    expect(audit.unroutable).toEqual(['Nofri kasur']);
  });

  it('tepat 7 atraksi menyumbang seluruh sel jarak > 100 km', () => {
    expect(audit.implausibleDistance.cells).toBe(2744);
    expect(audit.implausibleDistance.places.map((p) => p.name)).toEqual([
      'East Java Pavilion',
      'Merdeka Palace',
      'Museum of East Timor',
      'National History Museum',
      'Pasar Seni',
      'Sangga Buana',
      'Sarmiento Parakantja Timber',
    ]);
  });

  it('data/processed/dataset.json sinkron dengan data/raw (jalankan `npm run dataset:build` bila gagal)', () => {
    const processed = fromProcessed(JSON.parse(readFileSync(path.join(ROOT, 'data', 'processed', 'dataset.json'), 'utf8')));
    expect(processed.source).toEqual(dataset.source);
    expect(processed.attractions).toEqual(dataset.attractions);
    expect(processed.extraMatrixLabels).toEqual(dataset.extraMatrixLabels);
    expect(Array.from(processed.matrices.distanceM)).toEqual(Array.from(dataset.matrices.distanceM));
    expect(Array.from(processed.matrices.durationS)).toEqual(Array.from(dataset.matrices.durationS));
  });
});

/** Menjamin fixture uji tidak sintetis: setiap baris/sel harus sama persis dengan data/raw. */
describe('fixture tests/fixtures/mini berasal dari data asli', () => {
  const read = (dir: string, file: string) => readFileSync(path.join(dir, file), 'utf8');

  it('setiap rekaman atraksi identik dengan rekaman bernama sama di data/raw', () => {
    type Place = { name: string };
    const raw = (JSON.parse(read(RAW_DIR, RAW_FILES.attractions)) as { places: Place[] }).places;
    const fixture = (JSON.parse(read(FIXTURE_DIR, RAW_FILES.attractions)) as { places: Place[] }).places;
    expect(fixture.length).toBeGreaterThanOrEqual(5);
    expect(fixture.length).toBeLessThanOrEqual(10);
    for (const place of fixture) expect(place).toEqual(raw.find((p) => p.name === place.name));
  });

  it.each([RAW_FILES.distance, RAW_FILES.duration])('setiap sel %s identik dengan data/raw', (file) => {
    const index = (rows: string[][]) => {
      const header = rows[0] as string[];
      const cells = new Map<string, string>();
      for (const row of rows.slice(1)) header.slice(1).forEach((col, j) => cells.set(`${row[0]}→${col}`, row[j + 1] as string));
      return cells;
    };
    const raw = index(parseCsv(read(RAW_DIR, file)));
    const fixture = index(parseCsv(read(FIXTURE_DIR, file)));
    for (const [key, value] of fixture) expect([key, value]).toEqual([key, raw.get(key)]);
  });

  it('nama atraksi fixture cocok dengan kunci matriksnya', () => {
    const fixture = (JSON.parse(read(FIXTURE_DIR, RAW_FILES.attractions)) as { places: { name: string }[] }).places;
    const header = (parseCsv(read(FIXTURE_DIR, RAW_FILES.distance))[0] as string[]).slice(1);
    for (const p of fixture) expect(header).toContain(toMatrixKey(p.name));
  });
});
