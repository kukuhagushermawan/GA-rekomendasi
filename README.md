# Wisata Genetik

Rencana wisata terbaik yang pas dengan anggaran dan waktu, disusun dengan **Algoritma Genetika**.
Proyek mata kuliah Algoritma Genetika (PACS262501), Universitas Gadjah Mada.

Pengguna mengisi anggaran, lama liburan, jumlah orang, dan minat. GA memilih kombinasi destinasi (mirip Knapsack) sekaligus urutan kunjungannya (mirip TSP), lalu menampilkan 5 rencana terbaik lengkap dengan peta dan jadwal harian.

## Menjalankan

```bash
npm install
```

```bash
npm run dev
```

Buka http://localhost:3000.

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan aplikasi web |
| `npm run check` | Lint, pemeriksaan tipe, dan uji |
| `npm run ga` | Menjalankan GA sekali di terminal |
| `npm run eksperimen` | GA vs greedy vs acak + sensitivitas, hasil ke `docs/hasil_eksperimen.md` |

## Struktur

```
public/data/        dataset bawaan (201 destinasi + matriks jarak & waktu tempuh)
src/ga/
  data.ts           1. baca & validasi data
  kromosom.ts       2. representasi kromosom (pilihan + urutan)
  fitness.ts        3. biaya, durasi, valid/tidak valid, fitness, jadwal harian
  operator.ts       4. seleksi, crossover, mutasi
  ga.ts             5. loop GA: populasi awal, elitisme, kriteria berhenti, top-5
  pembanding.ts     6. greedy, pencarian acak, eksperimen
  worker.ts         GA dijalankan di Web Worker
src/app/            halaman web (Beranda, Rencana, Hasil, Evolusi, Eksperimen, Dataset, Tentang)
tests/ga.test.ts    uji unit
```

## Algoritma

| Tahap | Isi |
|---|---|
| Kromosom | `mask` (destinasi dipilih) + `order` (urutan kunjungan) |
| Fitness | `1 / (cost_score + duration_score)` + penalti pelanggaran + bonus minat |
| Valid | biaya ≤ anggaran dan durasi ≤ hari × jam per hari |
| Populasi awal | 100 individu: 20% greedy seeding, 80% acak |
| Seleksi | turnamen (k = 3) atau roulette |
| Crossover | 0,8: uniform/one-point (pilihan) + order crossover (urutan) |
| Mutasi | 0,05 per destinasi: swap, insert, tambah, hapus |
| Elitisme & berhenti | 2 elit, maksimal 200 generasi atau 100 generasi stagnan |

Hasil perbandingan dengan greedy dan pencarian acak ada di [`docs/hasil_eksperimen.md`](docs/hasil_eksperimen.md).

## Laporan dan presentasi

- Laporan: [`docs/laporan/Laporan_GA_Wisata_Genetik.pdf`](docs/laporan/Laporan_GA_Wisata_Genetik.pdf). Sumber LaTeX ada di folder yang sama (`main.tex`, kompilasi dengan pdfLaTeX di Overleaf).
- Presentasi: [`docs/presentasi/Presentasi_GA_Wisata_Genetik.pptx`](docs/presentasi/Presentasi_GA_Wisata_Genetik.pptx)

## Dataset sendiri

Di halaman **Dataset**, unggah tiga berkas dengan format yang sama seperti `public/data/`:

- **Destinasi**: JSON format asli, atau CSV dengan kolom `name,ticketPrice,visitDuration,tags,lat,lng` (tag dipisah `|`)
- **Jarak** (meter) dan **durasi** (detik): CSV matriks, baris pertama `origin,<nama destinasi…>`, `-1` = tidak ada rute

## Data dan lisensi

Dataset bawaan berasal dari [GA-pairwise-recommender-system](https://github.com/nnqomariyah/GA-pairwise-recommender-system) (Halim, Qomariyah & Kazakov), dirilis di bawah GPL-3.0. Proyek ini juga dirilis di bawah [GPL-3.0](LICENSE).
Audit data dan validasi terhadap kode aslinya tersimpan di branch `arsip-validasi`.

Referensi utama: Qomariyah, N. N., & Kazakov, D. (2021). A genetic-based pairwise trip planner recommender system. *Journal of Big Data, 8*, 77.

## Tim

- Azhar Maulana — 24/533487/PA/22582
- Kukuh Agus Hermawan — 24/533395/PA/22573
