/**
 * Mengekstrak fixture uji kecil dari data ASLI (bukan data sintetis): baris JSON dan sel CSV disalin
 * apa adanya untuk atraksi terpilih. Atraksi dipilih karena masing-masing mewakili kasus tepi nyata.
 *
 *   npx tsx scripts/make-fixture.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../src/lib/data/csv';
import { RAW_FILES } from '../src/lib/data/node';

export const FIXTURE_NAMES = [
  'National Monument', // kasus normal
  'Taman Lapangan Banteng', // pasangan jarak 0 dengan Irian Jaya Liberation Monument
  'Irian Jaya Liberation Monument',
  'Merdeka Square, Jakarta', // nama berkoma → kunci matriks tanpa koma
  'Nofri kasur', // seluruh sel -1 (tidak terjangkau)
  'Museum of East Timor', // jarak > 100 km (salah geokode di matriks)
  'Monumen Patung Dirgantara', // visitDuration = 0
] as const;

/** Label matriks non-atraksi yang ikut disalin agar loader diuji mengabaikannya. */
const EXTRA_LABELS = ['Jakarta'];

const root = path.resolve(import.meta.dirname, '..');
const rawDir = path.join(root, 'data', 'raw');
const outDir = path.join(root, 'tests', 'fixtures', 'mini');

const places = (JSON.parse(readFileSync(path.join(rawDir, RAW_FILES.attractions), 'utf8')) as {
  places: { name: string }[];
}).places;
const wanted = new Set<string>(FIXTURE_NAMES);
const subset = places.filter((p) => wanted.has(p.name));
if (subset.length !== FIXTURE_NAMES.length) throw new Error('ada nama fixture yang tidak ditemukan');

const keys = new Set([...subset.map((p) => p.name.replace(/,/g, '')), ...EXTRA_LABELS]);

function subsetMatrix(file: string): string {
  const rows = parseCsv(readFileSync(path.join(rawDir, file), 'utf8'));
  const header = rows[0] as string[];
  const keep = header.map((label, i) => i === 0 || keys.has(label));
  const pick = (row: string[]) => row.filter((_, i) => keep[i]).join(',');
  const body = rows.slice(1).filter((row) => keys.has(row[0] as string));
  return `${[pick(header), ...body.map(pick)].join('\n')}\n`;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, RAW_FILES.attractions), JSON.stringify({ places: subset }));
writeFileSync(path.join(outDir, RAW_FILES.distance), subsetMatrix(RAW_FILES.distance));
writeFileSync(path.join(outDir, RAW_FILES.duration), subsetMatrix(RAW_FILES.duration));
console.log(`Fixture ${subset.length} atraksi + ${EXTRA_LABELS.length} label tambahan → ${path.relative(root, outDir)}`);
