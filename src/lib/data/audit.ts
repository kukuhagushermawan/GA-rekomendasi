import type { Dataset, TravelMatrices } from './load';
import { KNOWN_TAGS } from './schema';
import { MISSING_CELL } from './units';

/**
 * Laporan kualitas data. Hanya MEMBACA matriks; tidak ada nilai yang diperbaiki atau diestimasi.
 */
export interface MatrixAudit {
  /** Sel bernilai -1 (termasuk diagonal). */
  missingCells: number;
  /** Pasangan (asal, tujuan) berbeda dengan nilai 0. */
  zeroOffDiagonal: [string, string][];
  /** Atraksi yang nilai diagonalnya bukan 0. */
  nonZeroDiagonal: string[];
  /** Pasangan i<j dengan nilai i→j ≠ j→i. */
  asymmetricPairs: number;
}

export interface SuspectPlace {
  name: string;
  /** Jumlah sel keluar (sebagai asal) yang melebihi ambang. */
  cellsAboveThreshold: number;
}

export interface DatasetAudit {
  attractionCount: number;
  matrixSize: number;
  extraMatrixLabels: string[];
  tagCounts: Record<string, number>;
  unknownTags: string[];
  freeAttractions: number;
  zeroVisitDuration: string[];
  missingRating: string[];
  namesWithComma: string[];
  /** Atraksi yang field `number`-nya tidak sama dengan posisinya di matriks upstream. */
  numberMismatch: string[];
  distance: MatrixAudit;
  duration: MatrixAudit;
  /** Atraksi yang SEMUA sel jarak di luar diagonal bernilai -1. */
  unroutable: string[];
  implausibleDistance: {
    thresholdKm: number;
    cells: number;
    /** Atraksi yang lebih dari separuh sel keluarnya melebihi ambang. */
    places: SuspectPlace[];
  };
}

function auditMatrix(values: Int32Array, n: number, names: readonly string[]): MatrixAudit {
  let missingCells = 0;
  let asymmetricPairs = 0;
  const zeroOffDiagonal: [string, string][] = [];
  const nonZeroDiagonal: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = values[i * n + j] as number;
      if (v === MISSING_CELL) missingCells++;
      if (i === j && v !== 0) nonZeroDiagonal.push(names[i] as string);
      if (i !== j && v === 0) zeroOffDiagonal.push([names[i] as string, names[j] as string]);
      if (j > i && v !== values[j * n + i]) asymmetricPairs++;
    }
  }
  return { missingCells, zeroOffDiagonal, nonZeroDiagonal, asymmetricPairs };
}

function findUnroutable(m: TravelMatrices, names: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < m.size; i++) {
    let allMissing = m.size > 1;
    for (let j = 0; j < m.size && allMissing; j++) {
      if (i !== j && m.distanceM[i * m.size + j] !== MISSING_CELL) allMissing = false;
    }
    if (allMissing) out.push(names[i] as string);
  }
  return out;
}

/**
 * @param thresholdKm ambang jarak jalan yang dianggap tidak masuk akal untuk dataset satu kota.
 *   Default 100 km: seluruh atraksi upstream berada di wilayah Jabodetabek.
 * @param matrixPositions posisi tiap atraksi di matriks upstream (untuk mengecek field `number`);
 *   lewati bila tidak diketahui.
 */
export function auditDataset(
  dataset: Dataset,
  options: { thresholdKm?: number; matrixPositions?: readonly number[] } = {},
): DatasetAudit {
  const thresholdKm = options.thresholdKm ?? 100;
  const { attractions, matrices } = dataset;
  const n = matrices.size;
  const names = attractions.map((a) => a.name);

  const tagCounts: Record<string, number> = {};
  for (const a of attractions) for (const t of a.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  const known = new Set<string>(KNOWN_TAGS);

  const thresholdM = thresholdKm * 1000;
  let cells = 0;
  const perOrigin = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && (matrices.distanceM[i * n + j] as number) > thresholdM) {
        cells++;
        perOrigin[i] = (perOrigin[i] as number) + 1;
      }
    }
  }

  return {
    attractionCount: attractions.length,
    matrixSize: n + dataset.extraMatrixLabels.length,
    extraMatrixLabels: [...dataset.extraMatrixLabels],
    tagCounts,
    unknownTags: Object.keys(tagCounts).filter((t) => !known.has(t)),
    freeAttractions: attractions.filter((a) => a.ticketPriceIdr === 0).length,
    zeroVisitDuration: attractions.filter((a) => a.visitHours === 0).map((a) => a.name),
    missingRating: attractions.filter((a) => a.rating === null).map((a) => a.name),
    namesWithComma: attractions.filter((a) => a.name !== a.matrixKey).map((a) => a.name),
    numberMismatch: options.matrixPositions
      ? attractions.filter((a, i) => a.number !== options.matrixPositions?.[i]).map((a) => a.name)
      : [],
    distance: auditMatrix(matrices.distanceM, n, names),
    duration: auditMatrix(matrices.durationS, n, names),
    unroutable: findUnroutable(matrices, names),
    implausibleDistance: {
      thresholdKm,
      cells,
      places: perOrigin
        .map((count, i) => ({ name: names[i] as string, cellsAboveThreshold: count }))
        .filter((p) => p.cellsAboveThreshold > (n - 1) / 2)
        .sort((a, b) => b.cellsAboveThreshold - a.cellsAboveThreshold || a.name.localeCompare(b.name)),
    },
  };
}
