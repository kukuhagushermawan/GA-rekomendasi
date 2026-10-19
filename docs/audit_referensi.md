# Audit Referensi: GA-pairwise-recommender-system

Dokumen ini mencatat hasil audit data dan kode dari repositori referensi sebelum mesin GA proyek ini dibangun.
Setiap angka di bawah dihasilkan dari data asli dan dikunci oleh uji di `tests/dataset-real.test.ts`,
kecuali yang ditandai *pembacaan kode* (perilaku Python yang disimpulkan dari kode, tidak dijalankan).

## 0. Temuan utama

1. Dataset berisi **201 atraksi di Jabodetabek** dari Google Places, bukan data sintetis. Koordinat lat/lng tersedia untuk semua atraksi.
2. Matriks jarak/durasi berukuran **202×202** karena memuat label tambahan **"Jakarta"** di posisi 199. Urutan matriks tidak sama dengan urutan atraksi, jadi pencarian harus berdasarkan nama. Field `number` di JSON ternyata sama dengan posisi matriks.
3. Ada **2.744 sel jarak > 100 km** (6,8% pasangan), dan semuanya berasal dari **7 atraksi** yang kemungkinan salah dicocokkan oleh API matriks. Contohnya National Monument → Museum of East Timor tercatat 3.096 km. Padahal semua atraksi berada dalam radius 31 km dari Monas.
4. **"Nofri kasur" tidak bisa dirutekan**: seluruh baris dan kolomnya bernilai −1.
5. Kode referensi punya beberapa bug yang berpengaruh besar (§4). Seleksi turnamennya praktis acak, mutasi tidak pernah dipanggil, dan hanya 8 generasi yang dijalankan meskipun `epochs=400`.
6. **Contoh di slide (ID001–006 bernilai 32 jam / Rp600.000) tidak bisa direproduksi** dari data asli (§5), sehingga tidak dipakai sebagai uji.
7. Tag yang tersedia hanya 8 dan berbahasa Inggris. **Tidak ada kategori "kuliner"** (§2.1).

## 1. Sumber

| Item | Nilai |
|---|---|
| Repositori | https://github.com/nnqomariyah/GA-pairwise-recommender-system |
| Commit | `4afb44d014b0ac2563817b2d311bec45e11ab6eb` (2021-01-18) |
| Penulis | Nicholas Michael Halim, Nunung Nurul Qomariyah, Dimitar Kazakov |
| Lisensi | GNU GPL v3.0 |
| Paper | Qomariyah, N. N., & Kazakov, D. (2021). *A genetic-based pairwise trip planner recommender system*. Journal of Big Data, 8, 77. https://doi.org/10.1186/s40537-021-00470-6 |

SHA-256 berkas data (disalin apa adanya ke `data/raw/`):

| Berkas | SHA-256 |
|---|---|
| `jsonAttraction.txt` | `b25e1b976c2c6bf1a7d2a4811a199e402190eb7c942f491299f7397ffa661b72` |
| `distanceMatrix.csv` | `e9056f9022471d16f6a7a0bbe9805d577ec52e416e4353a43a7d9558fa22e221` |
| `durationMatrix.csv` | `4df92f7fde7d37e88e90ef6bff370f8b48f09131a67ce274a15ec7164959e314` |

Kode Python, README, LICENSE, dan `newresults.txt` dari upstream disimpan di `reference/upstream/` untuk keperluan audit dan validasi silang.

## 2. Audit data

### 2.1 `jsonAttraction.txt`

Berkas ini berisi satu baris JSON berbentuk `{"places": [ … ]}` dengan **201 objek**.

| Field | Tipe di berkas | Satuan / arti | Catatan |
|---|---|---|---|
| `name` | string | nama atraksi | 201 unik. 3 nama mengandung koma (dihapus upstream agar cocok dengan header matriks). `Taman Kota "Cattleya"` mengandung tanda kutip literal. |
| `geometry.location.lat/lng` | number | derajat WGS84 | Ada di 201/201 dan semuanya unik. Rentang lat −6,433…−6,031, lng 106,630…107,039. |
| `place_id` | string | ID Google Places | 201 unik |
| `rating` | number | 0–5 | Kosong di 5 atraksi |
| `types` | string[] | tipe Google Places | Disimpan upstream sebagai `category` tetapi tidak dipakai oleh type8 |
| `number` | string | **posisi baris/kolom di matriks** | Bernilai 0…201, angka 199 dilompati (tempat "Jakarta" di matriks) |
| `ticketPrice` | string digit | **Rp per orang** (HTM) | 92 gratis (Rp0), median Rp2.000, maks Rp567.674 (Taman Pandang Istana) |
| `visitDuration` | string desimal | **jam** | 0–9 jam, rata-rata 1,52. Satu atraksi bernilai 0 (Monumen Patung Dirgantara). Total seluruh atraksi 306 jam. |
| `tags` | string[] | tag preferensi | 1–5 tag per atraksi, tanpa duplikat |
| `pictureSource`, `url`, `formatted_address` | string | — | Lengkap |
| `opening_hours` | object | jam buka Google | Hanya ada di 100/201 dan tidak dipakai upstream |

Bukti satuan: upstream menjalankan `int(ticketPrice) * nPeople` (harga per orang) dan menjumlahkan `float(visitDuration)` lalu membandingkannya dengan `hari × 10` (jam).

**Tag yang tersedia** (jumlah atraksi):

| Tag | Jumlah | Usulan label UI |
|---|---|---|
| `outdoors` | 81 | Alam / luar ruang |
| `kids-friendly` | 68 | Ramah anak |
| `museum` | 43 | Museum |
| `art-and-culture` | 31 | Seni & budaya |
| `history` | 24 | Sejarah |
| `amusement-park` | 21 | Taman hiburan |
| `beach` | 9 | Pantai |
| `local-favorite` | 8 | Favorit lokal |

Kategori di spesifikasi awal (alam/hiburan/budaya/**kuliner**) tidak sama dengan tag ini. Tiga kategori pertama punya padanan yang cukup dekat, tetapi **kuliner tidak ada sama sekali**. Label UI di atas hanya terjemahan dan tidak mengubah data.

### 2.2 `distanceMatrix.csv` dan `durationMatrix.csv`

Format kedua berkas sama: header `origin,<202 nama>`, lalu 202 baris dengan satu baris per asal. Baris adalah **asal** dan kolom adalah **tujuan**. Semua sel berupa bilangan bulat, dan nama di dalamnya tidak dibungkus kutip.

| Aspek | Jarak | Durasi |
|---|---|---|
| Satuan | **meter** | **detik** |
| Bukti satuan | `travelExpenses = (jarak / 1000) * 5000`, dengan komentar README "taxi fare per km" | `travelDuration / 60 / 60` → jam |
| Sel −1 (di antara 201 atraksi) | 401 | 401 |
| Nol di luar diagonal | 4 sel (2 pasangan) | 4 sel (2 pasangan) |
| Diagonal ≠ 0 | 1 (Nofri kasur = −1) | 1 (Nofri kasur = −1) |
| Pasangan asimetris (i→j ≠ j→i) | 19.849 dari 20.100 | 19.858 dari 20.100 |

Kecepatan rata-rata yang tersirat dari kedua matriks memiliki median 39,7 km/jam (p5 23,2; p95 55,6), sehingga konsisten dengan satuan meter dan detik.

- **Sel −1**: semuanya berasal dari **Nofri kasur** (200 sel keluar, 200 sel masuk, dan diagonal). Upstream menggantinya dengan 15.000 m / 1.300 s.
- **Nol di luar diagonal**: Irian Jaya Liberation Monument ↔ Taman Lapangan Banteng (bersebelahan) serta Onrust Island ↔ Pulau Bidadari (pulau tanpa rute jalan). Upstream juga mengganti nilai 0 dengan 15.000 m / 1.300 s.
- **Jarak tak masuk akal**: ada 2.744 sel > 100 km. Semuanya melibatkan 7 atraksi berikut, yang masing-masing memiliki 199 sel keluar > 100 km: East Java Pavilion, Merdeka Palace, Museum of East Timor, National History Museum, Pasar Seni, Sangga Buana, dan Sarmiento Parakantja Timber. Koordinat ketujuhnya di JSON tetap berada di Jakarta. Sebagai pembanding, jarak garis lurus maksimum antaratraksi menurut koordinat hanya 51,2 km. Angka ini adalah observasi audit dan **tidak** dipakai untuk mengganti nilai matriks.

**Kebijakan proyek:** matriks dipakai **apa adanya** tanpa jarak atau waktu tempuh yang dihitung ulang. Loader hanya mengindeks ulang berdasarkan nama dan menyediakan konversi satuan (m → km, s → jam). Penanganan sel −1/0 adalah aturan fungsi biaya, bukan perbaikan data.

### 2.3 Verifikasi urutan indeks matriks

- Urutan matriks sama dengan urutan atraksi untuk posisi 0–198. Setelah itu muncul **"Jakarta" di posisi 199**, sehingga atraksi ke-i (i ≥ 199) berada di posisi matriks i+1. Akibatnya urutan atraksi dan urutan matriks **tidak cocok** jika dipakai langsung secara posisional.
- Field `number` sama dengan posisi matriks untuk **seluruh 201 atraksi** (`numberMismatch: []`).
- Upstream mencari sel berdasarkan nama (`distanceList[0].index(nama)`), jadi perbedaan urutan ini tidak menimbulkan bug di sana. Loader proyek ini melakukan hal yang sama. Uji `mengindeks matriks berdasarkan NAMA` membalik urutan baris dan kolom CSV, lalu memastikan hasilnya identik.

## 3. Kode referensi: rumus dan parameter

### 3.1 Biaya dan durasi (`utils.py` → `evaluateV1`)

```
travelMeters  = Σ jarak[gen_j → gen_j+1]     (sel −1 atau 0 → 15000)
travelSeconds = Σ durasi[gen_j → gen_j+1]    (sel −1 atau 0 → 1300)
travelExpenses = (travelMeters / 1000) × 5000          # TAXI_RATE = Rp5.000/km, per rombongan
totalCost      = Σ ticketPrice × nPeople + travelExpenses
totalDuration  = Σ visitDuration + travelSeconds / 60 / 60
```

- Biaya taksi dihitung **per rombongan** (tidak dikalikan jumlah orang). HTM dihitung per orang.
- Tidak ada perjalanan dari atau ke hotel, dan tidak ada perjalanan pulang. Hanya perjalanan antardestinasi berurutan yang dihitung.
- Nilai pengganti 15.000 m setara Rp75.000. Komentar di kode menyebut 15000 dan 1300 sebagai "rata-rata matriks", padahal rata-rata sebenarnya terdistorsi oleh 7 atraksi bermasalah (pada matriks mentah 202×202, rata-rata jarak ≈132 km dan median ≈23,6 km).

### 3.2 Fungsi fitness

| Versi | Rumus | Dipakai type8? |
|---|---|---|
| `evaluateV1` | `1 / (costScore + durationScore)` | **Ya** |
| `evaluateV2` | `1/costScore + 1/durationScore` | Tidak |
| `evaluateV3` | V1 + `tagScore / jumlahGen` | Tidak |

```
costScore     = |budget − totalCost| / 100000
durationScore = |totalDuration − hari × 10|
tagScore      = jumlah gen yang memiliki SEMUA tag preferensi
```

- Pembagi 100.000 menyetarakan **Rp100.000 ≈ 1 jam**.
- Fitness ini adalah **pencocokan target dua arah**. Rencana yang terlalu murah atau terlalu singkat juga dihukum, dan rencana yang melebihi anggaran **tidak ditolak**, hanya diberi skor. Tidak ada batas valid/tidak valid yang tegas seperti di slide.
- Preferensi tag dalam type8 hanya bekerja sebagai **filter kandidat** (§3.4), bukan sebagai komponen fitness.

### 3.3 Jam per hari

Nilai jam per hari **tidak konsisten** di dalam kode upstream:

| Lokasi | Jam/hari |
|---|---|
| `generateDynamic` (inisialisasi) | 7 |
| `evaluateV1` / `evaluateV3` (fitness) | 10 |
| `cutter` (setelah crossover) | 10 |
| `RouteOptimizer.day_suggestion` | 10 |
| README upstream | 10 |
| Slide proyek ini | 7 |

### 3.4 Operator GA (`main.py` → `type8`)

| Komponen | Perilaku upstream |
|---|---|
| Kandidat | `getTaggedDest`: atraksi yang memiliki **minimal satu** tag preferensi |
| Representasi | Daftar Destination dengan panjang variabel. Urutan gen dipakai untuk menghitung biaya tempuh, tetapi **tidak dioptimasi** oleh GA. |
| Ukuran populasi | 40 (hardcoded) |
| Inisialisasi | `generateDynamic`: menambah atraksi acak sampai Σjam ≥ hari×7 atau ΣHTM×orang ≥ 0,75×budget. Duplikat diperbolehkan (bug §4). |
| Seleksi | Turnamen biner sebanyak 40 kali, dengan bug pembanding (§4) |
| Crossover | `crossv2`: one-point dengan titik potong berbeda di tiap induk. Ekornya ditukar, duplikat diganti gen acak (maks. 10 percobaan), lalu `cutter` dijalankan. Peluang crossover 100%. |
| Mutasi | **Tidak ada**. `mutate()` ada di kode tetapi tidak pernah dipanggil, dan `mutationRate=0.1` diabaikan. |
| Elitisme | **Tidak ada** di populasi. Terbaik per generasi hanya diarsipkan di `bestSoFar`. |
| Jumlah generasi | **8** (`repRate`). Argumen `epochs=400` diparsing tetapi tidak dipakai. |
| Henti dini | `bestSoFar[0].fitness ≥ 1.2`, dengan `bestSoFar[0]` adalah elemen pertama populasi awal yang **belum diurutkan** |
| Keluaran | 9 entri (populasi awal[0] + 8 terbaik per generasi), diurutkan menurun |

`newresults.txt` berisi 27 blok `type8` × 9 hasil = 243 hasil, sesuai dengan pembacaan kode ini.

### 3.5 Rute dan jadwal per hari (`routeOptimizer.py`)

- Setelah GA selesai, urutan dioptimasi dengan **Google OR-Tools** sebagai TSP satu kendaraan. Depotnya gen pertama, turnya **tertutup** (kembali ke depot), biayanya hanya jarak, dan strateginya `PATH_CHEAPEST_ARC` ditambah pencarian lokal default.
- `totalDist` adalah panjang tur tertutup dalam **meter**. Angka "173,266 km" di README upstream sebenarnya 173.266 m (≈173 km).
- Fitness, `travelExpenses`, dan `travelDuration` dihitung pada **urutan sebelum** dioptimasi OR-Tools. Akibatnya angka biaya dan durasi yang dilaporkan tidak sesuai dengan rute yang ditampilkan.
- `day_suggestion` memakai batas 10 jam/hari dan membulatkan tempuh ke bawah per jam (`floor`) tanpa nilai pengganti, sehingga sel −1 menyumbang −1 jam. Fungsi ini juga mengandung bug indeks (§4).

### 3.6 `main.py` (CLI)

- Nilai default: `nPeople=2`, `budget=3000000`, `duration=3` (hari), `epochs=400`, `tags=museum,beach,kids-friendly`.
- `type8` dijalankan **dua kali**, dan kedua hasilnya ditambahkan ke `newresults.txt`.
- *Pembacaan kode:* argumen `--genePool` memanggil `readJson` (format lama, field `spotName`) alih-alih `readJsonV2`. Akibatnya contoh perintah di README yang memakai `--genePool jsonAttraction.txt` akan gagal dengan `KeyError`. Run tanpa argumen memakai `readJsonV2` dan berjalan normal.

## 4. Bug dan inkonsistensi

Port TypeScript (`src/lib/reference/`) **mempertahankan** perilaku di bawah ini agar bisa divalidasi silang dengan `newresults.txt`. Lokasinya ditandai `UPSTREAM-BUG` di kode. Mesin GA proyek ini (milestone 2) akan dibangun terpisah tanpa bug tersebut.

| # | Lokasi | Bug | Dampak |
|---|---|---|---|
| 1 | `utils.selection` | `ch1[1] > ch2[2]` membandingkan fitness ch1 dengan **total biaya** ch2 | Pemenangnya hampir selalu ch2, sehingga **seleksi praktis acak** tanpa tekanan seleksi |
| 2 | `utils.generateDynamic` | `x in spots` membandingkan int dengan objek, sehingga selalu lolos | Kromosom awal bisa berisi atraksi yang sama berulang kali |
| 3 | `main.type8` | `mutate()` tidak dipanggil, `epochs` tidak dipakai, dan `repRate=8` | Hanya 8 generasi tanpa mutasi |
| 4 | `main.type8` | Henti dini memeriksa `bestSoFar[0]` yang belum diurutkan | Kriteria berhenti bergantung pada individu acak pertama |
| 5 | `utils.crossv2` | Perbaikan duplikat menyerah setelah 10 percobaan | Duplikat masih mungkin tersisa |
| 6 | `utils.evaluateV1` | Sel 0 di luar diagonal diperlakukan sebagai "hilang" | Pasangan bersebelahan (jarak 0) justru dikenai 15 km / Rp75.000 |
| 7 | — | Jam/hari 7 vs 10 (§3.3) | Inisialisasi dan fitness mengejar target berbeda |
| 8 | `routeOptimizer.day_suggestion` | Tempuh dibaca dari `genes[posisi−1]` (urutan kromosom), bukan simpul sebelumnya di rute, dan arahnya terbalik | Jadwal per hari bisa mengabaikan tempuh yang panjang |
| 9 | `routeOptimizer` | Rute dioptimasi setelah fitness dihitung | Biaya dan durasi yang dilaporkan tidak cocok dengan rutenya |
| 10 | `main.py` | `--genePool` memakai pembaca format lama | Contoh CLI di README gagal (*pembacaan kode*) |

Pengaman tambahan di port (tidak ada di Python): batas iterasi untuk loop yang berpotensi tak berujung, `Infinity`/`NaN` sebagai pengganti `ZeroDivisionError`, dan `mutate` yang melewati kromosom kosong.

## 5. Contoh slide dibandingkan data asli

Slide memakai anggaran Rp1.000.000, 5 hari × 7 jam = 35 jam, dan 2 dewasa. Dataset asli **tidak memiliki field ID001…**, jadi pemetaan di bawah mengasumsikan ID001 = atraksi pertama di berkas. Biaya dan durasi dihitung dengan rumus upstream §3.1 menggunakan port TypeScript.

| Rute | Slide | Data asli (urutan berkas) |
|---|---|---|
| ID001-002-003-004-005-006 | 32 jam, Rp600.000 → **VALID** | 11,23 jam (kunjungan 7,9 + tempuh 3,33), Rp1.097.025 (HTM Rp390.000 + taksi Rp707.025) → **melebihi anggaran** |
| ID002-003-004-005-006-007 | 37 jam, Rp640.000 → **TIDAK VALID** | 9,35 jam (kunjungan 6,9 + tempuh 2,45), Rp798.040 (HTM Rp230.000 + taksi Rp568.040) |

**Kesimpulan:** angka di slide bersifat ilustratif dan **tidak dapat direproduksi**. Status valid/tidak validnya pun terbalik, dan rata-rata kunjungan di data asli hanya 1,52 jam, sedangkan slide menyiratkan sekitar 5 jam per destinasi. Sesuai instruksi, kedua contoh ini **tidak dijadikan uji unit**.

## 6. Pemetaan Python → TypeScript

| Python | TypeScript | Keterangan |
|---|---|---|
| `destination.Destination`, `utils.readJsonV2` | `src/lib/data/load.ts` → `normalizePlace`, `buildDataset` | Ditambah validasi zod dan normalisasi satuan |
| `readDistanceMatrix.getDistanceList/getDistance/getDuration` | `parseMatrixCsv`, `rawDistanceM`, `rawDurationS` | Pencarian berdasarkan nama, lalu diindeks ulang |
| `chromosome.Chromosome.sumCost/sumDuration` | `reference/evaluate.ts` → `sumCost`, `sumDuration` | Gen berupa indeks atraksi |
| `utils.evaluateV1`, `evaluateV3` | `evaluateV1`, `evaluateV3` | Urutan operasi floating-point disamakan |
| `utils.getTaggedDest`, `generateDynamic`, `selection`, `crossv2`, `cutter`, `getDuplicateIndex`, `mutate` | `reference/operators.ts` | Bug dipertahankan dan ditandai `UPSTREAM-BUG` |
| `main.type8` | `reference/type8.ts` → `runType8` | RNG ber-seed (mulberry32) |
| `routeOptimizer.RouteOptimizer` | `reference/route-optimizer.ts` | `day_suggestion` diport persis. OR-Tools **diaproksimasi** dengan PATH_CHEAPEST_ARC + 2-opt/relocate. |

Python memakai Mersenne Twister tanpa seed, sehingga run upstream tidak bisa diulang bit-per-bit. Validasi silang di milestone 2 karena itu akan membandingkan **distribusi** hasil (fitness, biaya, durasi, jumlah atraksi) dengan 27 run di `newresults.txt`.

## 7. Keputusan (disetujui 2026-10-19, sebelum milestone 2)

1. **7 atraksi dengan jarak salah dan Nofri kasur** dikeluarkan dari kumpulan kandidat GA secara default (`buildProblem({ excludeSuspect: true })`). Datanya tidak diubah. Validasi silang upstream tetap memakai seluruh atraksi.
2. **Jam per hari** default 7 (slide) dan dapat diatur.
3. **Kategori preferensi** memakai 8 tag asli dengan label Indonesia. Kategori "kuliner" tidak tersedia.
4. **Aturan valid** memakai batas tegas dari slide, dengan fitness `1/(cost_score + duration_score)` + penalti + bonus preferensi (lihat `docs/desain_ga.md`). Port upstream dipakai untuk validasi silang (`docs/validasi_silang.md`).
5. **Lisensi** proyek GPL-3.0, mengikuti kode upstream yang diport.
