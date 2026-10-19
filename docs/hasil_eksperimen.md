# Hasil Eksperimen

> Dihasilkan otomatis oleh `npm run eksperimen` (20 seed: 1–20). Parameter GA default:
> populasi 100, generasi maks. 200, crossover 0,8, mutasi 0,05, elit 2, seleksi turnamen, stagnasi 100.
> Fitness lebih tinggi = rencana lebih dekat ke target anggaran & jam. Pencarian acak memakai jumlah evaluasi yang sama dengan GA.

## 1. GA vs pembanding

### Contoh slide: Rp1.000.000, 5 hari × 7 jam, 2 orang

| Metode | Fitness rata-rata ± SD | Fitness terbaik | Rencana valid | Biaya rata-rata | Durasi rata-rata | Waktu rata-rata |
|---|---|---|---|---|---|---|
| Algoritma Genetika | 22,62 ± 4,88 | 31,13 | 100% | Rp996.297 | 33,9 jam | 609 ms |
| Greedy termurah dulu | 1,09 ± 0,00 | 1,09 | 100% | Rp216.345 | 30,6 jam | 0 ms |
| Greedy terdekat dulu | 3,77 ± 2,18 | 9,46 | 100% | Rp847.777 | 28,7 jam | 0 ms |
| Pencarian acak | 3,82 ± 0,55 | 4,93 | 100% | Rp972.738 | 27,4 jam | 997 ms |

GA 5,93× lebih baik dari pembanding terbaik (Pencarian acak).

### Default kode asli: Rp3.000.000, 3 hari × 10 jam, 2 orang, museum/pantai/ramah anak

| Metode | Fitness rata-rata ± SD | Fitness terbaik | Rencana valid | Biaya rata-rata | Durasi rata-rata | Waktu rata-rata |
|---|---|---|---|---|---|---|
| Algoritma Genetika | 82,62 ± 20,84 | 126,99 | 100% | Rp2.994.914 | 29,7 jam | 590 ms |
| Greedy termurah dulu | 1,50 ± 0,00 | 1,50 | 100% | Rp203.970 | 29,0 jam | 0 ms |
| Greedy terdekat dulu | 2,62 ± 1,57 | 6,88 | 100% | Rp1.173.908 | 26,9 jam | 0 ms |
| Pencarian acak | 21,64 ± 7,78 | 41,44 | 100% | Rp2.941.828 | 28,8 jam | 1.038 ms |

GA 3,82× lebih baik dari pembanding terbaik (Pencarian acak).

### Hemat: Rp500.000, 2 hari × 7 jam, 4 orang, alam

| Metode | Fitness rata-rata ± SD | Fitness terbaik | Rencana valid | Biaya rata-rata | Durasi rata-rata | Waktu rata-rata |
|---|---|---|---|---|---|---|
| Algoritma Genetika | 76,25 ± 25,58 | 122,68 | 100% | Rp498.033 | 13,8 jam | 396 ms |
| Greedy termurah dulu | 1,80 ± 0,00 | 1,80 | 100% | Rp163.510 | 13,0 jam | 0 ms |
| Greedy terdekat dulu | 4,41 ± 2,31 | 9,92 | 100% | Rp397.167 | 11,2 jam | 0 ms |
| Pencarian acak | 16,95 ± 5,87 | 36,85 | 100% | Rp484.135 | 13,2 jam | 1.222 ms |

GA 4,50× lebih baik dari pembanding terbaik (Pencarian acak).

## 2. Analisis sensitivitas parameter

Skenario contoh slide, 10 seed per nilai. Satu parameter diubah, sisanya default (**tebal**).

### Ukuran populasi

| Nilai | Fitness rata-rata ± SD | Rencana valid | Waktu rata-rata |
|---|---|---|---|
| 25 | 18,04 ± 9,12 | 100% | 179 ms |
| 50 | 20,08 ± 6,94 | 100% | 412 ms |
| **100** | 21,54 ± 5,26 | 100% | 609 ms |
| 200 | 24,53 ± 4,32 | 100% | 1.376 ms |

### Peluang mutasi

| Nilai | Fitness rata-rata ± SD | Rencana valid | Waktu rata-rata |
|---|---|---|---|
| 0.01 | 20,77 ± 12,66 | 100% | 409 ms |
| **0.05** | 21,54 ± 5,26 | 100% | 609 ms |
| 0.1 | 22,58 ± 9,66 | 100% | 759 ms |
| 0.2 | 14,86 ± 4,17 | 100% | 883 ms |

### Peluang crossover

| Nilai | Fitness rata-rata ± SD | Rencana valid | Waktu rata-rata |
|---|---|---|---|
| 0.4 | 24,23 ± 6,56 | 100% | 446 ms |
| 0.6 | 26,55 ± 8,90 | 100% | 406 ms |
| **0.8** | 21,54 ± 5,26 | 100% | 480 ms |
| 0.95 | 23,57 ± 5,71 | 100% | 458 ms |
