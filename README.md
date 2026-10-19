# Perencana Wisata Genetik

Sistem rekomendasi rencana perjalanan wisata yang dioptimasi dengan **Algoritma Genetika**, dibuat untuk mata kuliah Algoritma Genetika (PACS262501), Universitas Gadjah Mada.

Wisatawan memasukkan anggaran, durasi, jumlah orang, dan preferensi tag. Sistem lalu mencari kombinasi destinasi (mirip Knapsack) sekaligus urutan kunjungannya (mirip TSP) yang sesuai dengan batas biaya dan waktu.

> **Status: Milestone 1** selesai (scaffold, data asli, skema, loader, port referensi, dan uji).
> Mesin GA proyek ini dibangun di milestone 2.

## Data

Proyek ini memakai **dataset asli** dari [GA-pairwise-recommender-system](https://github.com/nnqomariyah/GA-pairwise-recommender-system) (commit `4afb44d`) tanpa data sintetis:

- **201 atraksi** di Jabodetabek: nama, koordinat, HTM (Rp/orang), lama kunjungan (jam), 8 tag, rating, dan foto.
- **Matriks jarak (meter) dan waktu tempuh (detik)** hasil Google Distance Matrix. Keduanya dipakai **apa adanya** tanpa dihitung ulang.

Hasil audit data dan kode referensi (satuan, nilai kosong, urutan indeks, rumus fitness, bug) ada di [`docs/audit_referensi.md`](docs/audit_referensi.md). Ringkasnya:

| Temuan | Nilai |
|---|---|
| Atraksi / label matriks | 201 / 202 (label tambahan "Jakarta") |
| Tag | outdoors 81 · kids-friendly 68 · museum 43 · art-and-culture 31 · history 24 · amusement-park 21 · beach 9 · local-favorite 8 |
| Sel matriks −1 | 401 per matriks, seluruhnya dari "Nofri kasur" |
| Sel jarak > 100 km | 2.744, seluruhnya dari 7 atraksi |

## Menjalankan

Prasyarat: Node.js ≥ 20.11.

```bash
npm install
```

```bash
npm run check
```

```bash
npm run dev
```

| Skrip | Fungsi |
|---|---|
| `npm run check` | Lint, pemeriksaan tipe, dan uji |
| `npm run dataset:build` | Validasi `data/raw/`, lalu tulis `data/processed/dataset.json` + `audit.json` (otomatis sebelum `dev`/`build`) |
| `npm run fixture:build` | Ekstrak ulang fixture uji (7 baris asli) ke `tests/fixtures/mini/` |
| `npm test` | Vitest |

## Struktur

```
data/
  raw/                  salinan byte-identik dari upstream (+ SOURCE.md)
  processed/            hasil `dataset:build`: atraksi ternormalisasi + matriks, laporan audit
docs/audit_referensi.md audit data & kode referensi
reference/upstream/     kode Python, README, LICENSE, newresults.txt upstream (untuk audit/validasi silang)
scripts/                build-dataset.ts, make-fixture.ts
src/
  app/                  Next.js App Router (halaman sementara)
  lib/data/             skema zod, loader, CSV parser, konversi satuan, audit
  lib/reference/        port TypeScript perilaku GA upstream (referensi, GPL-3.0)
  lib/random.ts         RNG ber-seed (mulberry32)
tests/                  uji unit + fixture
```

## Model data

`src/lib/data/schema.ts` mendefinisikan dua lapis skema zod:

1. **Mentah** (`rawPlaceSchema`): mengikuti struktur `jsonAttraction.txt` persis. `ticketPrice` dan `visitDuration` berupa string digit/desimal.
2. **Ternormalisasi** (`attractionSchema`): `ticketPriceIdr` (Rp/orang), `visitHours` (jam), `matrixKey` (nama tanpa koma, kunci matriks upstream), `number` (posisi matriks), dan `id` tampilan `ID001…` yang diturunkan dari urutan berkas.

Matriks disimpan dalam satuan aslinya (meter/detik, −1 = tidak tersedia) dan diindeks ulang **berdasarkan nama**, karena urutannya berbeda dari urutan atraksi. Accessor `distanceKm()` dan `travelHours()` mengonversi satuan dan mengembalikan `null` untuk sel yang tidak tersedia. Accessor ini tidak memberikan estimasi pengganti.

## Atribusi dan lisensi

- **Data dan logika referensi** berasal dari *GA-pairwise-recommender-system* karya **Nicholas Michael Halim, Nunung Nurul Qomariyah, dan Dimitar Kazakov**, dirilis di bawah **GNU General Public License v3.0**. Salinan lisensinya ada di [`reference/upstream/LICENSE`](reference/upstream/LICENSE).
- `src/lib/reference/` adalah **terjemahan (port) TypeScript** dari `main.py`, `utils.py`, `chromosome.py`, dan `routeOptimizer.py`. Port ini dipakai **hanya sebagai referensi perilaku** untuk validasi silang, termasuk bug upstream yang sengaja dipertahankan. Sebagai karya turunan, bagian ini tunduk pada **GPL-3.0**.
- Karena port tersebut ikut didistribusikan, proyek ini secara keseluruhan dirilis di bawah **GNU GPL v3.0** (lihat [`LICENSE`](LICENSE)).
- Atraksi, matriks jarak, dan matriks durasi awalnya diambil dari Google Maps Platform oleh penulis upstream.

### Referensi

- Qomariyah, N. N., & Kazakov, D. (2021). A genetic-based pairwise trip planner recommender system. *Journal of Big Data, 8*, 77. https://doi.org/10.1186/s40537-021-00470-6
- Google, Temasek, & Bain & Company. (2020). *e-Conomy SEA 2020*. https://www.bain.com/insights/e-conomy-sea-2020
- Google, Temasek, & Bain & Company. (2024). *e-Conomy SEA 2024*. https://services.google.com/fh/files/misc/e_conomy_sea_2024_report.pdf
- Badan Pusat Statistik. (2024). Kunjungan wisman Agustus 2024. https://www.bps.go.id/en/pressrelease/2024/10/01/2355/

## Milestone

| # | Cakupan | Status |
|---|---|---|
| 1 | Scaffold, audit data asli, skema & loader, port referensi, uji | ✅ |
| 2 | Mesin GA inti, fitness, validasi, uji; validasi silang terhadap `newresults.txt` | ⏳ menunggu persetujuan |
| 3 | Pembanding greedy/acak, eksperimen CLI | — |
| 4 | Web Worker, halaman Perencana & Hasil | — |
| 5 | Visualisasi evolusi, Eksperimen, Dataset, Tentang | — |
| 6 | Pengujian, dokumentasi, deploy Vercel | — |

Tim: Azhar Maulana (24/533487/PA/22582), Kukuh Agus Hermawan (24/533395/PA/22573).
