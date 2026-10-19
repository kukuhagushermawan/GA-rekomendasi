import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { auditDataset, type DatasetAudit } from './audit';
import { buildDataset, parseMatrixCsv, toMatrixKey, type Dataset, type RawDatasetInput } from './load';
import type { DatasetSource } from './schema';

/** Hanya untuk Node (skrip CLI & uji). Aplikasi web memuat data/processed/dataset.json. */

export const RAW_FILES = {
  attractions: 'jsonAttraction.txt',
  distance: 'distanceMatrix.csv',
  duration: 'durationMatrix.csv',
} as const;

export const UPSTREAM_SOURCE = {
  repository: 'https://github.com/nnqomariyah/GA-pairwise-recommender-system',
  commit: '4afb44d014b0ac2563817b2d311bec45e11ab6eb',
  license: 'GPL-3.0',
} as const;

export function readRawDir(dir: string): RawDatasetInput {
  return {
    attractionsJson: readFileSync(path.join(dir, RAW_FILES.attractions), 'utf8'),
    distanceCsv: readFileSync(path.join(dir, RAW_FILES.distance), 'utf8'),
    durationCsv: readFileSync(path.join(dir, RAW_FILES.duration), 'utf8'),
  };
}

const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

export function describeSource(dir: string): DatasetSource {
  return {
    ...UPSTREAM_SOURCE,
    files: Object.fromEntries(
      Object.values(RAW_FILES).map((name) => [name, { sha256: sha256(path.join(dir, name)) }]),
    ),
  };
}

export function loadRawDir(dir: string): { dataset: Dataset; audit: DatasetAudit; input: RawDatasetInput } {
  const input = readRawDir(dir);
  const dataset = buildDataset(input, describeSource(dir));
  // Posisi tiap atraksi di matriks upstream, untuk mengecek apakah field `number` = indeks matriks.
  const labels = parseMatrixCsv(input.distanceCsv, 'distanceMatrix').labels;
  const matrixPositions = dataset.attractions.map((a) => labels.indexOf(toMatrixKey(a.name)));
  return { dataset, audit: auditDataset(dataset, { matrixPositions }), input };
}
