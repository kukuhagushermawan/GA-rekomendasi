import { z } from 'zod';
import { parseCsv } from './csv';
import {
  type Attraction,
  type DatasetSource,
  type ProcessedDataset,
  type RawPlace,
  matrixCellSchema,
  processedDatasetSchema,
  rawAttractionFileSchema,
} from './schema';
import { MISSING_CELL, RAW_UNITS, metersToKm, secondsToHours } from './units';

export class DatasetValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(`${message}\n- ${issues.join('\n- ')}`);
    this.name = 'DatasetValidationError';
  }
}

/** Matriks n×n row-major, diindeks mengikuti urutan `Dataset.attractions`. Nilai = sel CSV apa adanya. */
export interface TravelMatrices {
  readonly size: number;
  /** Meter; -1 = tidak tersedia. */
  readonly distanceM: Int32Array;
  /** Detik; -1 = tidak tersedia. */
  readonly durationS: Int32Array;
}

export interface Dataset {
  readonly attractions: readonly Attraction[];
  readonly matrices: TravelMatrices;
  /** Label di matriks yang bukan atraksi (pada data upstream: "Jakarta"). */
  readonly extraMatrixLabels: readonly string[];
  readonly source: DatasetSource | null;
}

export interface RawMatrix {
  readonly labels: string[];
  /** Row-major n×n sesuai urutan `labels`. */
  readonly cells: Int32Array;
}

export interface RawDatasetInput {
  attractionsJson: string;
  distanceCsv: string;
  durationCsv: string;
}

const formatZodIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);

/** Meniru `Destination.__init__` upstream: koma dihapus dari nama agar cocok dengan header matriks. */
export const toMatrixKey = (name: string): string => name.replace(/,/g, '');

export const formatAttractionId = (index: number): string => `ID${String(index + 1).padStart(3, '0')}`;

export function parseAttractionsJson(text: string): RawPlace[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new DatasetValidationError('jsonAttraction bukan JSON yang valid', [String(error)]);
  }
  const result = rawAttractionFileSchema.safeParse(json);
  if (!result.success) {
    throw new DatasetValidationError('jsonAttraction tidak sesuai skema', formatZodIssues(result.error));
  }
  return result.data.places;
}

export function normalizePlace(place: RawPlace, index: number): Attraction {
  return {
    id: formatAttractionId(index),
    index,
    number: Number(place.number),
    name: place.name,
    matrixKey: toMatrixKey(place.name),
    placeId: place.place_id,
    address: place.formatted_address,
    lat: place.geometry.location.lat,
    lng: place.geometry.location.lng,
    rating: place.rating ?? null,
    googleTypes: place.types,
    tags: place.tags,
    ticketPriceIdr: Number(place.ticketPrice),
    visitHours: Number(place.visitDuration),
    pictureUrl: place.pictureSource,
    mapsUrl: place.url,
    openingHours: place.opening_hours?.weekday_text ?? null,
  };
}

/** Membaca matriks CSV upstream: baris pertama `origin,<nama…>`, lalu satu baris per asal. */
export function parseMatrixCsv(text: string, label: string): RawMatrix {
  const rows = parseCsv(text);
  const issues: string[] = [];
  const header = rows[0];
  if (!header || header.length < 2) {
    throw new DatasetValidationError(`${label}: header kosong`, ['baris pertama harus `origin,<nama destinasi…>`']);
  }
  const labels = header.slice(1);
  const n = labels.length;
  if (rows.length - 1 !== n) issues.push(`jumlah baris data ${rows.length - 1} ≠ jumlah kolom ${n}`);

  const seen = new Set<string>();
  for (const name of labels) {
    if (seen.has(name)) issues.push(`label duplikat di header: "${name}"`);
    seen.add(name);
  }

  const cells = new Int32Array(n * n);
  for (let r = 0; r < Math.min(n, rows.length - 1); r++) {
    const row = rows[r + 1] as string[];
    if (row[0] !== labels[r]) issues.push(`baris ${r + 1}: label "${row[0]}" ≠ header "${labels[r]}" (urutan baris harus sama dengan header)`);
    if (row.length - 1 !== n) {
      issues.push(`baris ${r + 1} ("${row[0]}"): ${row.length - 1} sel, seharusnya ${n}`);
      continue;
    }
    for (let c = 0; c < n; c++) {
      const raw = row[c + 1] as string;
      const value = /^-?\d+$/.test(raw.trim()) ? Number(raw) : Number.NaN;
      if (!matrixCellSchema.safeParse(value).success) {
        issues.push(`baris "${row[0]}", kolom "${labels[c]}": nilai "${raw}" bukan bilangan bulat ≥ -1`);
        continue;
      }
      cells[r * n + c] = value;
    }
  }
  if (issues.length > 0) throw new DatasetValidationError(`${label} tidak valid`, issues.slice(0, 20));
  return { labels, cells };
}

/**
 * Mengindeks ulang matriks mentah mengikuti urutan atraksi dengan pencarian NAMA (seperti `getDistance`
 * upstream), bukan posisi — urutan matriks upstream berbeda karena ada label tambahan "Jakarta".
 */
function reindexByName(matrix: RawMatrix, attractions: readonly Attraction[], label: string): Int32Array {
  const position = new Map(matrix.labels.map((name, i) => [name, i]));
  const missing = attractions.filter((a) => !position.has(a.matrixKey)).map((a) => `"${a.matrixKey}" (${a.id})`);
  if (missing.length > 0) throw new DatasetValidationError(`${label}: atraksi tidak ditemukan di header matriks`, missing);

  const n = attractions.length;
  const m = matrix.labels.length;
  const out = new Int32Array(n * n);
  for (let i = 0; i < n; i++) {
    const row = position.get((attractions[i] as Attraction).matrixKey) as number;
    for (let j = 0; j < n; j++) {
      const col = position.get((attractions[j] as Attraction).matrixKey) as number;
      out[i * n + j] = matrix.cells[row * m + col] as number;
    }
  }
  return out;
}

export function buildDataset(input: RawDatasetInput, source: DatasetSource | null = null): Dataset {
  const places = parseAttractionsJson(input.attractionsJson);
  const attractions = places.map(normalizePlace);

  const keys = new Map<string, string>();
  const duplicates: string[] = [];
  for (const a of attractions) {
    const previous = keys.get(a.matrixKey);
    if (previous) duplicates.push(`"${a.matrixKey}" dipakai oleh ${previous} dan ${a.id}`);
    keys.set(a.matrixKey, a.id);
  }
  if (duplicates.length > 0) throw new DatasetValidationError('nama atraksi (tanpa koma) harus unik', duplicates);

  const distance = parseMatrixCsv(input.distanceCsv, 'distanceMatrix');
  const duration = parseMatrixCsv(input.durationCsv, 'durationMatrix');

  const attractionKeys = new Set(attractions.map((a) => a.matrixKey));
  const extraMatrixLabels = [...new Set([...distance.labels, ...duration.labels])].filter((l) => !attractionKeys.has(l));

  return {
    attractions,
    matrices: {
      size: attractions.length,
      distanceM: reindexByName(distance, attractions, 'distanceMatrix'),
      durationS: reindexByName(duration, attractions, 'durationMatrix'),
    },
    extraMatrixLabels,
    source,
  };
}

export function toProcessed(dataset: Dataset, source: DatasetSource): ProcessedDataset {
  return {
    schemaVersion: 1,
    source,
    units: RAW_UNITS,
    attractions: [...dataset.attractions],
    extraMatrixLabels: [...dataset.extraMatrixLabels],
    distanceM: Array.from(dataset.matrices.distanceM),
    durationS: Array.from(dataset.matrices.durationS),
  };
}

export function fromProcessed(json: unknown): Dataset {
  const result = processedDatasetSchema.safeParse(json);
  if (!result.success) {
    throw new DatasetValidationError('dataset.json tidak sesuai skema', formatZodIssues(result.error));
  }
  const data = result.data;
  return {
    attractions: data.attractions,
    matrices: {
      size: data.attractions.length,
      distanceM: Int32Array.from(data.distanceM),
      durationS: Int32Array.from(data.durationS),
    },
    extraMatrixLabels: data.extraMatrixLabels,
    source: data.source,
  };
}

// ---- Akses sel matriks ----------------------------------------------------------------------------

/** Nilai mentah apa adanya (meter). */
export const rawDistanceM = (m: TravelMatrices, from: number, to: number): number =>
  m.distanceM[from * m.size + to] as number;

/** Nilai mentah apa adanya (detik). */
export const rawDurationS = (m: TravelMatrices, from: number, to: number): number =>
  m.durationS[from * m.size + to] as number;

/** Jarak dalam km, atau `null` bila sel tidak tersedia (-1) atau 0 di luar diagonal. Tanpa estimasi pengganti. */
export function distanceKm(m: TravelMatrices, from: number, to: number): number | null {
  const v = rawDistanceM(m, from, to);
  if (v === MISSING_CELL || (v === 0 && from !== to)) return null;
  return metersToKm(v);
}

/** Waktu tempuh dalam jam, atau `null` bila sel tidak tersedia (-1) atau 0 di luar diagonal. */
export function travelHours(m: TravelMatrices, from: number, to: number): number | null {
  const v = rawDurationS(m, from, to);
  if (v === MISSING_CELL || (v === 0 && from !== to)) return null;
  return secondsToHours(v);
}
