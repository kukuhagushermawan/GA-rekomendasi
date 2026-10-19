import { z } from 'zod';

/**
 * LANGKAH 0 — DATA
 * Data asli dari repositori GA-pairwise-recommender-system (Qomariyah & Kazakov, 2021), commit 4afb44d,
 * disalin apa adanya ke public/data/:
 *   jsonAttraction.txt  201 atraksi Jabodetabek (HTM Rp/orang, lama kunjungan jam, tag, koordinat)
 *   distanceMatrix.csv  jarak jalan antaratraksi dalam METER   (-1 = tidak ada rute)
 *   durationMatrix.csv  waktu tempuh antaratraksi dalam DETIK  (-1 = tidak ada rute)
 * Matriks dipakai apa adanya, tidak dihitung ulang.
 */

export const DATA_FILES = {
  attractions: '/data/jsonAttraction.txt',
  distance: '/data/distanceMatrix.csv',
  duration: '/data/durationMatrix.csv',
} as const;

/** 8 tag yang ada di data asli, dengan label Indonesia untuk UI. */
export const TAG_LABELS: Record<string, string> = {
  outdoors: 'Alam / luar ruang',
  'kids-friendly': 'Ramah anak',
  museum: 'Museum',
  'art-and-culture': 'Seni & budaya',
  history: 'Sejarah',
  'amusement-park': 'Taman hiburan',
  beach: 'Pantai',
  'local-favorite': 'Favorit lokal',
};
export const tagLabel = (tag: string): string => TAG_LABELS[tag] ?? tag;

/**
 * Atraksi bermasalah menurut audit data. Mereka tidak dipakai sebagai kandidat GA, tetapi datanya
 * tidak diubah. Audit lengkap ada di branch `arsip-validasi`.
 */
export const DIKECUALIKAN: Readonly<Record<string, string>> = {
  'East Java Pavilion': 'Jarak di matriks > 100 km (salah geokode)',
  'Merdeka Palace': 'Jarak di matriks > 100 km (salah geokode)',
  'Museum of East Timor': 'Jarak di matriks > 100 km (salah geokode)',
  'National History Museum': 'Jarak di matriks > 100 km (salah geokode)',
  'Pasar Seni': 'Jarak di matriks > 100 km (salah geokode)',
  'Sangga Buana': 'Jarak di matriks > 100 km (salah geokode)',
  'Sarmiento Parakantja Timber': 'Jarak di matriks > 100 km (salah geokode)',
  'Nofri kasur': 'Tidak ada rute ke atraksi lain (semua sel −1)',
};

export interface Attraction {
  /** Label tampilan ID001, ID002, … sesuai urutan berkas. */
  id: string;
  index: number;
  name: string;
  /** Nama tanpa koma = kunci di header matriks (aturan kode asli). */
  matrixKey: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  tags: string[];
  /** Harga tiket masuk (HTM), rupiah per orang. */
  ticket: number;
  visitHours: number;
  pictureUrl: string;
  mapsUrl: string;
}

export interface Dataset {
  attractions: Attraction[];
  size: number;
  /** Jarak (meter) n×n, baris = asal, kolom = tujuan, diindeks mengikuti `attractions`. */
  distanceM: Int32Array;
  /** Waktu tempuh (detik) n×n. */
  durationS: Int32Array;
  /** Label matriks yang bukan atraksi (data asli: "Jakarta"). */
  extraLabels: string[];
}

export interface RawFiles {
  attractions: string;
  distance: string;
  duration: string;
}

export class DataError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(`${message}: ${issues.slice(0, 5).join('; ')}`);
    this.name = 'DataError';
  }
}

// ---- Validasi skema (zod) ------------------------------------------------------------------------------

const placeSchema = z.object({
  name: z.string().min(1),
  formatted_address: z.string().default(''),
  geometry: z.object({
    location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  }),
  rating: z.number().min(0).max(5).optional(),
  ticketPrice: z.union([z.string().regex(/^\d+$/, 'harus bilangan bulat rupiah'), z.number().int().nonnegative()]),
  visitDuration: z.union([z.string().regex(/^\d+(\.\d+)?$/, 'harus jam desimal'), z.number().nonnegative()]),
  tags: z.array(z.string().min(1)).min(1, 'minimal satu tag'),
  pictureSource: z.string().default(''),
  url: z.string().default(''),
});
type Place = z.infer<typeof placeSchema>;

// ---- Parser ---------------------------------------------------------------------------------------------

/** Parser CSV yang meniru csv.reader Python: kutip hanya bermakna di awal field. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let atStart = true;
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
    atStart = true;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endField();
      rows.push(row);
      row = [];
    } else {
      field += ch;
      atStart = false;
    }
  }
  if (field !== '' || row.length > 0) {
    endField();
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/**
 * Membaca daftar atraksi: format JSON asli (`{"places": [...]}`) atau CSV dengan kolom
 * `name,ticketPrice,visitDuration,tags,lat,lng` (+ opsional `rating,address`; tag dipisah `|`).
 */
export function parseAttractions(text: string): Attraction[] {
  let raw: unknown[];
  if (text.trimStart().startsWith('{')) {
    const json = JSON.parse(text) as { places?: unknown[] };
    if (!Array.isArray(json.places)) throw new DataError('Berkas atraksi tidak valid', ['field "places" tidak ditemukan']);
    raw = json.places;
  } else {
    const [header, ...rows] = parseCsv(text);
    if (!header) throw new DataError('Berkas atraksi kosong', ['tidak ada baris header']);
    const col = (name: string) => header.indexOf(name);
    const required = ['name', 'ticketPrice', 'visitDuration', 'tags', 'lat', 'lng'];
    const missing = required.filter((c) => col(c) < 0);
    if (missing.length) throw new DataError('Kolom CSV atraksi kurang', missing);
    const get = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');
    raw = rows.map((r) => ({
      name: get(r, 'name'),
      formatted_address: get(r, 'address'),
      geometry: { location: { lat: Number(get(r, 'lat')), lng: Number(get(r, 'lng')) } },
      rating: get(r, 'rating') ? Number(get(r, 'rating')) : undefined,
      ticketPrice: get(r, 'ticketPrice'),
      visitDuration: get(r, 'visitDuration'),
      tags: get(r, 'tags').split(/[|;]/).map((t) => t.trim()).filter(Boolean),
    }));
  }

  const issues: string[] = [];
  const places: Place[] = [];
  raw.forEach((item, i) => {
    const result = placeSchema.safeParse(item);
    if (result.success) places.push(result.data);
    else issues.push(...result.error.issues.map((x) => `baris ${i + 1} ${x.path.join('.')}: ${x.message}`));
  });
  if (issues.length) throw new DataError('Data atraksi tidak valid', issues);

  return places.map((p, index) => ({
    id: `ID${String(index + 1).padStart(3, '0')}`,
    index,
    name: p.name,
    matrixKey: p.name.replace(/,/g, ''),
    address: p.formatted_address,
    lat: p.geometry.location.lat,
    lng: p.geometry.location.lng,
    rating: p.rating ?? null,
    tags: p.tags,
    ticket: Number(p.ticketPrice),
    visitHours: Number(p.visitDuration),
    pictureUrl: p.pictureSource,
    mapsUrl: p.url,
  }));
}

/** Membaca matriks format asli: header `origin,<nama…>`, lalu satu baris per asal. */
export function parseMatrix(text: string, label: string): { labels: string[]; cells: Int32Array } {
  const rows = parseCsv(text);
  const labels = (rows[0] ?? []).slice(1);
  const n = labels.length;
  const issues: string[] = [];
  if (n === 0) issues.push('header kosong');
  if (rows.length - 1 !== n) issues.push(`jumlah baris ${rows.length - 1} ≠ jumlah kolom ${n}`);
  const cells = new Int32Array(n * n);
  rows.slice(1, n + 1).forEach((row, r) => {
    if (row[0] !== labels[r]) issues.push(`baris ${r + 1} "${row[0]}" tidak sesuai urutan header`);
    for (let c = 0; c < n; c++) {
      const v = (row[c + 1] ?? '').trim();
      if (!/^-?\d+$/.test(v) || Number(v) < -1) issues.push(`"${row[0]}" → "${labels[c]}": "${v}" bukan bilangan bulat ≥ -1`);
      else cells[r * n + c] = Number(v);
    }
  });
  if (issues.length) throw new DataError(`${label} tidak valid`, issues);
  return { labels, cells };
}

/**
 * Menggabungkan atraksi dan kedua matriks. Matriks dicari berdasarkan NAMA (seperti kode asli),
 * karena urutannya berbeda dari urutan atraksi (ada label tambahan "Jakarta").
 */
export function buildDataset(files: RawFiles): Dataset {
  const attractions = parseAttractions(files.attractions);
  const keys = new Set<string>();
  for (const a of attractions) {
    if (keys.has(a.matrixKey)) throw new DataError('Nama atraksi harus unik', [a.name]);
    keys.add(a.matrixKey);
  }

  const n = attractions.length;
  const reindex = (text: string, label: string) => {
    const m = parseMatrix(text, label);
    const pos = new Map(m.labels.map((name, i) => [name, i]));
    const missing = attractions.filter((a) => !pos.has(a.matrixKey)).map((a) => a.name);
    if (missing.length) throw new DataError(`${label}: atraksi tidak ditemukan di matriks`, missing);
    const out = new Int32Array(n * n);
    for (let i = 0; i < n; i++) {
      const row = pos.get((attractions[i] as Attraction).matrixKey) as number;
      for (let j = 0; j < n; j++) {
        out[i * n + j] = m.cells[row * m.labels.length + (pos.get((attractions[j] as Attraction).matrixKey) as number)] as number;
      }
    }
    return { out, extra: m.labels.filter((l) => !keys.has(l)) };
  };

  const distance = reindex(files.distance, 'Matriks jarak');
  const duration = reindex(files.duration, 'Matriks durasi');
  return {
    attractions,
    size: n,
    distanceM: distance.out,
    durationS: duration.out,
    extraLabels: [...new Set([...distance.extra, ...duration.extra])],
  };
}

/** Mengunduh data bawaan dari public/data (browser). */
export async function fetchDefaultFiles(): Promise<RawFiles> {
  const get = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gagal memuat ${url} (${res.status})`);
    return res.text();
  };
  const [attractions, distance, duration] = await Promise.all([
    get(DATA_FILES.attractions),
    get(DATA_FILES.distance),
    get(DATA_FILES.duration),
  ]);
  return { attractions, distance, duration };
}
