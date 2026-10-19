import { z } from 'zod';

/**
 * Tag yang ada di jsonAttraction.txt upstream (hasil audit). Dataset unggahan boleh memakai tag lain;
 * daftar ini hanya dipakai untuk label UI dan peringatan audit, bukan untuk menolak data.
 */
export const KNOWN_TAGS = [
  'outdoors',
  'kids-friendly',
  'museum',
  'art-and-culture',
  'history',
  'amusement-park',
  'beach',
  'local-favorite',
] as const;
export type KnownTag = (typeof KNOWN_TAGS)[number];

const digitString = z.string().regex(/^\d+$/, 'harus berupa bilangan bulat non-negatif');
const decimalString = z.string().regex(/^\d+(\.\d+)?$/, 'harus berupa bilangan desimal non-negatif');

/** Satu objek di `places[]` pada jsonAttraction.txt (format Google Places + field tambahan upstream). */
export const rawPlaceSchema = z.object({
  name: z.string().min(1),
  formatted_address: z.string(),
  geometry: z.object({
    location: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
  }),
  place_id: z.string().min(1),
  rating: z.number().min(0).max(5).optional(),
  types: z.array(z.string()),
  url: z.string(),
  /** Posisi atraksi di matriks jarak/durasi upstream (bukan indeks berkas). */
  number: z.union([digitString, z.number().int().nonnegative()]),
  pictureSource: z.string(),
  /** Harga tiket masuk (HTM) dalam rupiah per orang. Upstream: `int(ticketPrice)`. */
  ticketPrice: z.union([digitString, z.number().int().nonnegative()]),
  /** Lama kunjungan dalam jam. Upstream: `float(visitDuration)`. */
  visitDuration: z.union([decimalString, z.number().nonnegative()]),
  tags: z.array(z.string().min(1)).min(1),
  opening_hours: z
    .object({
      weekday_text: z.array(z.string()).optional(),
    })
    .optional(),
});
export type RawPlace = z.infer<typeof rawPlaceSchema>;

export const rawAttractionFileSchema = z.object({
  places: z.array(rawPlaceSchema).min(1),
});

/** Atraksi setelah normalisasi satuan. Nilai tidak dihitung ulang, hanya dikonversi tipenya. */
export const attractionSchema = z.object({
  /** Label tampilan `ID001`, `ID002`, … diturunkan dari urutan berkas (bukan field asli). */
  id: z.string().regex(/^ID\d{3,}$/),
  /** Posisi 0-based di jsonAttraction.txt. */
  index: z.number().int().nonnegative(),
  /** Field `number` upstream (= posisi baris/kolom di matriks). */
  number: z.number().int().nonnegative(),
  name: z.string().min(1),
  /** Nama tanpa koma; kunci pencarian matriks (meniru `Destination.__init__`). */
  matrixKey: z.string().min(1),
  placeId: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  rating: z.number().nullable(),
  googleTypes: z.array(z.string()),
  tags: z.array(z.string()).min(1),
  ticketPriceIdr: z.number().int().nonnegative(),
  visitHours: z.number().nonnegative(),
  pictureUrl: z.string(),
  mapsUrl: z.string(),
  openingHours: z.array(z.string()).nullable(),
});
export type Attraction = z.infer<typeof attractionSchema>;

/** Sel matriks mentah: bilangan bulat ≥ -1 (-1 = rute tidak ditemukan oleh Google). */
export const matrixCellSchema = z.number().int().min(-1);

export const datasetSourceSchema = z.object({
  repository: z.string(),
  commit: z.string(),
  license: z.string(),
  files: z.record(z.string(), z.object({ sha256: z.string() })),
});
export type DatasetSource = z.infer<typeof datasetSourceSchema>;

/** Format berkas data/processed/dataset.json yang dimuat aplikasi. */
export const processedDatasetSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: datasetSourceSchema,
    units: z.object({
      ticketPrice: z.literal('IDR per orang'),
      visitDuration: z.literal('jam'),
      distance: z.literal('meter'),
      duration: z.literal('detik'),
    }),
    attractions: z.array(attractionSchema).min(1),
    extraMatrixLabels: z.array(z.string()),
    /** Matriks jarak mentah (meter), row-major `[asal * n + tujuan]`, diindeks ulang mengikuti `attractions`. */
    distanceM: z.array(matrixCellSchema),
    /** Matriks durasi mentah (detik), row-major, diindeks ulang mengikuti `attractions`. */
    durationS: z.array(matrixCellSchema),
  })
  .superRefine((value, ctx) => {
    const expected = value.attractions.length ** 2;
    for (const key of ['distanceM', 'durationS'] as const) {
      if (value[key].length !== expected) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `panjang ${value[key].length}, seharusnya ${expected} (= jumlah atraksi²)`,
        });
      }
    }
  });
export type ProcessedDataset = z.infer<typeof processedDatasetSchema>;
