# Desain Mesin Algoritma Genetika

Kode berada di `src/lib/ga/`. Mesin ini ditulis sendiri tanpa pustaka GA dan terpisah dari port referensi upstream di `src/lib/reference/`, yang hanya dipakai untuk validasi silang.

## 1. Alur

```
buildProblem(dataset, masukan)       → kandidat, matriks padat, skor preferensi, tetangga terdekat
initialPopulation                    → 20% greedy seed + 80% acak
ulang sampai maxGenerations atau stagnasi:
    elit (2 terbaik) disalin utuh
    seleksi (turnamen / roulette) → crossover (pc) → mutasi (pm) → evaluasi
    arsipkan rencana terbaik per himpunan destinasi
top-K rencana berbeda → toPlanView (rincian biaya + jadwal per hari)
```

Satu run default (populasi 100, 200 generasi) memakan sekitar 0,3–0,7 detik di Node.js.

## 2. Representasi kromosom

Masalah ini menggabungkan dua hal: **memilih kombinasi** destinasi (seperti Knapsack) dan **mengurutkan rute** (seperti TSP). Kromosom yang dipakai terdiri dari dua bagian:

| Bagian | Bentuk | Arti |
|---|---|---|
| `mask` | `Uint8Array(n)` | `mask[g] = 1` berarti kandidat g dipilih |
| `order` | permutasi `0..n-1` | urutan relatif seluruh kandidat |

**Dekode:** rute = elemen `order` yang mask-nya 1, sesuai urutan kemunculan.

Contoh dengan n = 5, `order = [4,0,3,1,2]` dan `mask` memilih {1,3,4} menghasilkan rute 4 → 3 → 1.

**Alasan pilihan ini dibandingkan permutasi panjang-variabel:**

1. **Setiap kromosom selalu sah.** Hasil dekodenya tidak pernah berisi duplikat, sehingga tidak perlu perbaikan seperti `getDuplicateIndex` di upstream, yang bahkan bisa gagal (bug #5 di audit).
2. **Operator standar bisa langsung dipakai pada bagian yang sesuai.** Uniform atau one-point dipakai pada `mask`, dan order crossover (OX) pada `order`, sesuai spesifikasi.
3. **Materi genetik tidak hilang.** Posisi kandidat yang sedang tidak dipilih tetap diwariskan, sehingga bila kandidat itu dipilih kembali lewat crossover atau mutasi tambah, letaknya di rute sudah "teringat".

Kekurangannya, kromosom selalu berukuran n (193 kandidat) meskipun rute hanya berisi sekitar 20 destinasi. Dengan populasi 100 biaya ini kecil.

## 3. Biaya, validitas, dan fitness (`evaluate.ts`)

### 3.1 Biaya dan durasi

```
C = Σ HTM × orang + Σ jarak_km × Rp5.000 × ⌈orang / 4⌉     (Rp)
D = Σ lama kunjungan + Σ waktu tempuh                       (jam)
```

- Tarif taksi Rp5.000/km dan nilai pengganti sel matriks −1/0 (15 km, 1.300 detik) mengikuti upstream. Nilai pengganti ini adalah aturan fungsi biaya, bukan perbaikan data.
- Jumlah kendaraan dihitung ⌈orang/4⌉. Untuk ≤ 4 orang hasilnya sama dengan upstream (satu taksi per rombongan).
- Hanya perjalanan antardestinasi yang dihitung. Tidak ada data hotel, sehingga tidak ada perjalanan dari atau ke hotel.

### 3.2 Validitas (aturan slide)

> **VALID ⇔ C ≤ anggaran B dan D ≤ T = hari × jam/hari**

Jadwal per hari (§3.4) dihitung terpisah. Rencana yang VALID tetapi jadwalnya butuh lebih banyak hari diberi peringatan "Jadwal harian butuh 6 hari (tersedia 5)" dan dikenai penalti jadwal di fitness. Spesifikasi menetapkan validitas berdasarkan total, jadi kondisi ini **tidak** mengubah status VALID.

### 3.3 Fitness

```
cost_score     = w_c · |C − B| / B
duration_score = w_d · |D − T| / T
violation      = w_v · ( max(0, C − B)/B + max(0, D − T)/T )
schedule       = w_s · overflow_jadwal / T
fitness        = (1 + w_p · preferensi) / (ε + cost_score + duration_score + violation + schedule)
```

| Bobot | Default | Peran |
|---|---|---|
| `w_c`, `w_d` | 1, 1 | Selisih relatif terhadap target anggaran dan jam (rumus slide) |
| `w_v` | 10 | Pelanggaran batas 11× lebih mahal daripada kekurangan dengan selisih yang sama, sehingga GA terdorong ke sisi valid |
| `w_s` | 1 | Penalti bila jadwal harian tidak muat |
| `w_p` | 1 | Preferensi penuh dapat menggandakan fitness |
| `ε` | 0,01 | Mencegah pembagian nol; fitness maksimum 100 × (1 + w_p) |

- **Hubungan dengan slide.** Dengan `w_v = w_s = w_p = 0`, rumusnya kembali menjadi `1 / (cost_score + duration_score)` (Qomariyah & Kazakov, 2021). Bedanya, selisih di sini **relatif** (dibagi B dan T), bukan `|B − C|/100000` seperti upstream. Hasilnya, kedua komponen sudah tanpa satuan untuk anggaran dan durasi berapa pun. Pada B = Rp3 juta dan T = 30 jam, fitness proyek tepat 30 × fitness upstream (dibuktikan di validasi silang §E).
- **Preferensi.** Skor sebuah destinasi adalah bobot tertinggi di antara tag-nya, dinormalisasi terhadap bobot slider terbesar. Skor rencana adalah rata-rata skor destinasinya. Bonus dibuat **pengali**, bukan penambah seperti `evaluateV3`, agar pengaruhnya tidak bergantung pada skala penyebut. Bonus penambah praktis hilang saat penyebutnya kecil.
- **Kekurangan juga dihukum.** Seperti di slide dan upstream, rencana yang jauh di bawah anggaran atau jam tetap dihukum. Tujuannya titik "paling seimbang", bukan sekadar termurah.

### 3.4 Jadwal per hari (`schedule.ts`)

Rute dipecah secara greedy. Sebuah destinasi masuk ke hari berjalan bila `jam hari ini + tempuh + kunjungan ≤ jam/hari`. Jika tidak, hari baru dimulai. Waktu tempuh dari destinasi terakhir hari sebelumnya dihitung di awal hari berikutnya, sehingga Σ jam semua hari = D.

```
span     = Σ_{hari selain terakhir} max(jam/hari, jam_hari) + jam_hari_terakhir
overflow = max(0, span − T) + Σ max(0, jam_hari − jam/hari)
muat     ⇔ jumlah hari ≤ hari tersedia ∧ tidak ada hari yang melebihi batas
```

Upstream memakai 10 jam/hari dengan pembulatan ke bawah dan bug indeks. Mesin ini memakai jam/hari dari masukan (default 7) tanpa pembulatan.

## 4. Operator

### 4.1 Inisialisasi (`seeding.ts`, `engine.ts`)

- **Greedy seed (20%).** Rute dimulai dari kandidat acak yang diberi bobot (1 + 2 × preferensi). Langkah berikutnya memilih secara acak berbobot di antara **5 kandidat terdekat** yang masih layak, yaitu biaya ≤ B, durasi ≤ T, dan jadwal harian tetap muat. Rute seperti ini selalu valid, sehingga populasi awal tidak seluruhnya tidak valid. Pada contoh run CLI default, 48% individu generasi 0 valid.
- **Acak (80%).** `k ~ U[1, k_max]` kandidat acak dengan urutan acak. `k_max` adalah jumlah destinasi yang kira-kira muat dalam T, yaitu T dibagi (rata-rata kunjungan + rata-rata tempuh).

### 4.2 Seleksi

- **Turnamen (default, k = 3, dengan pengembalian).** Peluang individu terbaik menang adalah 1 − (1 − 1/N)³.
- **Roulette wheel.** Peluang sebanding fitness. Fitness selalu > 0, jadi semua individu punya peluang.

Pembanding upstream bermasalah: `ch1[1] > ch2[2]`, sehingga seleksinya praktis acak. Pembanding di mesin ini sudah diperbaiki.

### 4.3 Crossover (peluang `pc` = 0,8)

- **`mask`:** uniform (default; tiap bit ditukar dengan peluang ½) atau one-point.
- **`order`:** order crossover OX1 (Davis, 1985). Segmen [i, j] disalin dari induk pertama, lalu sisanya diisi gen induk kedua sesuai urutan, mulai setelah j. Anak selalu berupa permutasi sah. Uji `orderCrossover` mereproduksi contoh klasik Davis.

### 4.4 Mutasi (peluang `pm` = 0,05 per destinasi di rute)

Untuk setiap destinasi di rute (minimal satu percobaan, agar rute kosong tetap bisa tumbuh), dengan peluang `pm` dipilih satu operator yang bisa diterapkan:

| Operator | Efek |
|---|---|
| swap | Menukar posisi dua destinasi |
| insert | Memindahkan satu destinasi ke posisi lain |
| tambah | Memilih satu kandidat baru. Dengan peluang `localAddRate` = 0,8 kandidat itu adalah **salah satu dari 10 tetangga terdekat** dari destinasi acak di rute dan disisipkan tepat setelahnya. Sisanya dipilih acak global. |
| hapus | Mengeluarkan satu destinasi |

**Alasan mutasi tambah-lokal.** Kandidat acak global hampir selalu jauh dari klaster rute, sehingga terjadi detour mahal yang langsung menjebol anggaran. Pengukuran awal memakai 20 seed (1–20), konfigurasi default tanpa stagnasi, dan tiga skenario. Hasilnya adalah rata-rata fitness terbaik akhir (± SE):

| Skenario | `localAddRate` 0 | 0,5 | **0,8** |
|---|---|---|---|
| Rp1 jt, 5×7 jam, 2 orang | 22,27 ± 1,51 | 23,02 ± 1,17 | **23,81 ± 1,27** |
| Rp3 jt, 3×10 jam, 2 orang, museum/beach/kids | 84,99 ± 3,65 | 85,40 ± 3,83 | **89,87 ± 3,18** |
| Rp500 rb, 2×7 jam, 4 orang, outdoors | 63,00 ± 5,90 | 77,47 ± 7,90 | **81,42 ± 7,85** |

Nilai 0,8 memberi rata-rata tertinggi di ketiga skenario. Namun pada dua skenario pertama selisihnya masih dalam ±1–2 SE. Analisis sensitivitas yang dapat direproduksi akan dibuat oleh harness eksperimen milestone 3.

### 4.5 Elitisme

Sebanyak 2 individu terbaik disalin utuh beserta evaluasinya. Karena evaluasi deterministik, **fitness terbaik tidak pernah turun**. Hal ini diuji untuk seleksi turnamen dan roulette. Uji pembandingnya menunjukkan bahwa tanpa elitisme, fitness terbaik memang bisa turun.

### 4.6 Kriteria berhenti

Run berhenti pada `maxGenerations` (200), saat **stagnasi** (fitness terbaik tidak membaik selama 100 generasi), atau saat dibatalkan oleh `shouldStop` (UI). Batas stagnasi 50 sempat dicoba, tetapi terlalu dini: rata-rata fitness akhir 4–15% lebih rendah daripada tanpa batas stagnasi pada pengukuran awal (10 seed, tiga skenario §4.4). Dengan batas 100 (20 seed), hasilnya ≤ 3% di bawah run tanpa batas stagnasi.

### 4.7 Top-5 rencana berbeda

Arsip menyimpan rencana terbaik **per himpunan destinasi** sepanjang run, dengan urutan terbaiknya. Top-K diambil dari rencana valid lebih dulu, lalu berdasarkan fitness. Rencana baru diterima hanya bila selisih simetrisnya dengan setiap rencana terpilih ≥ `minPlanDifference` (2), yaitu minimal satu destinasi diganti. Rute kosong tidak pernah masuk top-K.

Hasil run juga memuat `bestOverall` (fitness tertinggi apa pun validitasnya), `history` per generasi (terbaik, rata-rata, terburuk, porsi valid, error biaya/durasi terbaik, evaluasi kumulatif), dan `finalPopulation` (error biaya vs error durasi per individu, untuk grafik sebaran di milestone 5).

## 5. Parameter default

| Parameter | Default | Sumber |
|---|---|---|
| Populasi / generasi | 100 / 200 | Spesifikasi |
| Crossover / mutasi | 0,8 / 0,05 | Spesifikasi |
| Elit | 2 | Spesifikasi |
| Seleksi | turnamen, k = 3 | Pilihan desain |
| Crossover mask | uniform | Pilihan desain |
| Stagnasi | 100 generasi | Pengukuran §4.6 |
| Rasio greedy seed | 0,2 | Pilihan desain |
| `localAddRate` | 0,8 | Pengukuran §4.4 |
| Top-K / beda minimum | 5 / 2 destinasi | Spesifikasi / pilihan desain |
| Jam per hari | 7 | Keputusan M1 §7.2 (slide) |
| Kandidat | 193 (8 atraksi bermasalah dikecualikan) | Keputusan M1 §7.1 |

Semua parameter divalidasi dengan zod (`config.ts`) dan dapat diubah lewat argumen `npm run ga` (daftarnya ada di komentar `scripts/run-ga.ts`) maupun nanti lewat UI.

## 6. Perbedaan dengan upstream

| Aspek | Upstream (`type8`) | Mesin ini |
|---|---|---|
| Urutan rute | Tidak dioptimasi GA; OR-Tools setelahnya | Dioptimasi di dalam GA (OX, swap, insert) |
| Seleksi | Praktis acak (bug) | Turnamen / roulette |
| Mutasi | Tidak dipanggil | swap, insert, tambah (lokal/global), hapus |
| Elitisme | Tidak ada | 2 elit |
| Generasi | 8 (`epochs` diabaikan) | 200 + stagnasi |
| Jam per hari | Campur 7 dan 10 | Satu nilai dari masukan |
| Validitas | Tidak ada batas tegas | C ≤ B ∧ D ≤ T + penalti |
| Duplikat destinasi | Mungkin | Tidak mungkin (representasi) |
| Preferensi | Filter kandidat (tag apa pun) | Bonus fitness berbobot per tag |

## 7. Validasi silang

Lihat [`validasi_silang.md`](validasi_silang.md), yang dihasilkan oleh `npm run cross-validate`. Ringkasnya:

- Port `evaluateV1` dan `day_suggestion` mereproduksi **243/243** hasil `newresults.txt` secara bit-per-bit. Ini dikunci oleh uji `reference-crossval.test.ts`.
- Distribusi 500 run port `type8` tidak berbeda nyata dari 27 run upstream (KS p = 0,97 untuk fitness terbaik).
- Pada objektif upstream sendiri dengan jumlah evaluasi setara (≈350), mesin ini mencapai fitness terbaik rata-rata 0,85 vs 0,39 (median 0,64 vs 0,24, KS p < 0,001).

## 8. Keterbatasan yang diketahui

- Tidak ada titik awal (hotel), sehingga perjalanan pertama tiap hari dihitung dari destinasi terakhir hari sebelumnya.
- Dua pasangan berjarak 0 di matriks (Irian Jaya Liberation Monument ↔ Taman Lapangan Banteng, Onrust ↔ Pulau Bidadari) dikenai nilai pengganti upstream 15 km. Untuk pasangan pertama ini terlalu mahal, sedangkan untuk pasangan pulau mungkin terlalu murah.
- Status VALID mengikuti total biaya dan durasi sesuai spesifikasi, sehingga rencana VALID bisa saja butuh hari ekstra. Kondisi ini ditandai dan dikenai penalti, tetapi tidak diblokir.
- Pengukuran parameter di §4.4 dan §4.6 masih awal (20 seed). Analisis sensitivitas penuh dilakukan di milestone 3.
