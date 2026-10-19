# Validasi Silang terhadap `newresults.txt`

> Berkas ini **dihasilkan otomatis** oleh `npm run cross-validate` (scripts/cross-validate.ts). Jangan diedit manual.

Parameter upstream (default `main.py`): anggaran Rp3.000.000, 3 hari, 2 orang, tag `museum, beach, kids-friendly`,
`epochs=400` (tidak dipakai; type8 menjalankan 8 generasi). `newresults.txt` berisi **27 run × 9 hasil = 243 hasil**.

## A. Fungsi evaluasi (deterministik)

Setiap hasil upstream dihitung ulang dengan port `evaluateV1` memakai urutan `spots` yang tercatat.

- Hasil yang semua nama destinasinya ada di dataset: **243 / 243**.

| Besaran | Identik bit-per-bit | Selisih relatif maks. |
|---|---|---|
| `fitness` | 243 / 243 | 0.00e+0 |
| `HTM` | 243 / 243 | 0.00e+0 |
| `travelExpenses` | 243 / 243 | 0.00e+0 |
| `totalExpenses` | 243 / 243 | 0.00e+0 |
| `totalDuration` | 243 / 243 | 0.00e+0 |
| `travelDuration` | 243 / 243 | 0.00e+0 |

## B. Jadwal per hari (deterministik)

`day_suggestion` diport persis (termasuk bug indeks). Dengan `route-by-index` upstream sebagai masukan:
**243 / 243** `per-day-route` identik.

## C. Rute OR-Tools (aproksimasi)

Port memakai PATH_CHEAPEST_ARC + 2-opt/relocate, bukan OR-Tools.

- Urutan identik dengan `route-by-index` upstream: **126 / 243**
- `totalDist` dalam ±1%: **170 / 243**
- Selisih relatif `totalDist` (aproksimasi − OR-Tools) / OR-Tools: rata-rata 0.50%, min -8.20%, maks 18.62%

## D. Distribusi port `type8` vs upstream (statistik)

Python memakai RNG tanpa seed, jadi run tidak bisa diulang bit-per-bit. Port dijalankan dengan 500 seed (1000–1499).
Per run diambil fitness terbaik dan rata-rata fitness dari 9 entri `bestSoFar`.

**Fitness terbaik per run**

| Sumber | n | Rata-rata | SD | Min | Median | Maks |
|---|---|---|---|---|---|---|
| Upstream (newresults.txt) | 27 | 0.3921 | 0.4808 | 0.1346 | 0.2425 | 2.3495 |
| Port TypeScript | 500 | 0.3413 | 0.7465 | 0.1148 | 0.2308 | 15.5440 |

KS dua sampel: D = 0.094, p = 0.970

**Rata-rata fitness 9 entri per run**

| Sumber | n | Rata-rata | SD | Min | Median | Maks |
|---|---|---|---|---|---|---|
| Upstream (newresults.txt) | 27 | 0.1643 | 0.0795 | 0.0910 | 0.1468 | 0.4383 |
| Port TypeScript | 500 | 0.1551 | 0.0950 | 0.0796 | 0.1387 | 1.9109 |

KS dua sampel: D = 0.134, p = 0.720

**Jumlah destinasi pada hasil terbaik**

| Sumber | n | Rata-rata | SD | Min | Median | Maks |
|---|---|---|---|---|---|---|
| Upstream (newresults.txt) | 27 | 14.4 | 2.6 | 8.0 | 15.0 | 18.0 |
| Port TypeScript | 500 | 14.3 | 2.6 | 8.0 | 14.0 | 22.0 |

KS dua sampel: D = 0.111, p = 0.890

**Biaya dan durasi hasil terbaik**

| Sumber | n | Rata-rata | SD | Min | Median | Maks |
|---|---|---|---|---|---|---|
| Biaya — upstream | 27 | Rp2.793.104 | Rp171.793 | Rp2.408.655 | Rp2.807.405 | Rp3.032.385 |
| Biaya — port | 500 | Rp2.756.532 | Rp182.011 | Rp2.206.320 | Rp2.764.170 | Rp3.172.645 |
| Durasi (jam) — upstream | 27 | 31.93 | 1.89 | 29.37 | 31.64 | 36.58 |
| Durasi (jam) — port | 500 | 31.39 | 1.95 | 24.84 | 31.08 | 37.74 |

## E. GA proyek ini pada objektif upstream

Konfigurasi agar setara: 10 jam/hari, kandidat = atraksi bertag `museum/beach/kids-friendly` **tanpa** pengecualian audit,
bobot penalti/jadwal/preferensi = 0. Pada anggaran Rp3.000.000 dan 30 jam,
`1/(|B−C|/B + |D−T|/T)` = 30 × fitness upstream, jadi kedua objektif memiliki optimum yang sama.
Rencana dengan fitness tertinggi (`bestOverall`) dinilai ulang dengan `evaluateV1` upstream. 30 seed (2000–2029).

| Sumber | n | Rata-rata | SD | Min | Median | Maks |
|---|---|---|---|---|---|---|
| Upstream (newresults.txt), 360 evaluasi | 27 | 0.3921 | 0.4808 | 0.1346 | 0.2425 | 2.3495 |
| GA proyek, evaluasi setara (344) | 30 | 0.8465 | 0.6944 | 0.1606 | 0.6389 | 2.8824 |
| GA proyek, default (≈19105 evaluasi) | 30 | 128.2179 | 56.3323 | 33.9047 | 127.3448 | 257.5107 |

KS (upstream vs GA proyek evaluasi setara): D = 0.541, p = < 0,001
