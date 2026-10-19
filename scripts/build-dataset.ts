/**
 * Membaca data/raw/ (salinan apa adanya dari repo upstream), memvalidasi dengan zod, lalu menulis:
 *   data/processed/dataset.json  — atraksi ternormalisasi + matriks mentah yang diindeks ulang per nama
 *   data/processed/audit.json    — laporan kualitas data
 * Tidak ada nilai jarak/durasi yang dihitung ulang atau diperbaiki.
 *
 *   npm run dataset:build
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { toProcessed } from '../src/lib/data/load';
import { loadRawDir } from '../src/lib/data/node';
import { serializeProcessed } from '../src/lib/data/serialize';

const root = path.resolve(import.meta.dirname, '..');
const rawDir = path.join(root, 'data', 'raw');
const outDir = path.join(root, 'data', 'processed');

const { dataset, audit } = loadRawDir(rawDir);
if (!dataset.source) throw new Error('sumber dataset tidak terdeskripsi');

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'dataset.json'), serializeProcessed(toProcessed(dataset, dataset.source)));
writeFileSync(path.join(outDir, 'audit.json'), `${JSON.stringify(audit, null, 2)}\n`);

console.log(`Atraksi              : ${audit.attractionCount}`);
console.log(`Ukuran matriks mentah: ${audit.matrixSize} (label tambahan: ${audit.extraMatrixLabels.join(', ') || '-'})`);
console.log(`Tag                  : ${Object.entries(audit.tagCounts).map(([t, c]) => `${t}=${c}`).join(', ')}`);
console.log(`Sel -1 (jarak/durasi): ${audit.distance.missingCells} / ${audit.duration.missingCells}`);
console.log(`Tidak terjangkau     : ${audit.unroutable.join(', ') || '-'}`);
console.log(
  `Jarak > ${audit.implausibleDistance.thresholdKm} km     : ${audit.implausibleDistance.cells} sel dari ${audit.implausibleDistance.places.length} atraksi`,
);
console.log(`Ditulis ke ${path.relative(root, outDir)}`);
