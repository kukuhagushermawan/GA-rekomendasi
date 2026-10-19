# Sumber data mentah

Tiga berkas di folder ini adalah salinan **apa adanya** (byte-identik) dari:

- Repositori: https://github.com/nnqomariyah/GA-pairwise-recommender-system
- Commit: `4afb44d014b0ac2563817b2d311bec45e11ab6eb`
- Penulis: Nicholas Michael Halim, Nunung Nurul Qomariyah, Dimitar Kazakov
- Lisensi repositori: GNU GPL v3.0 (lihat `reference/upstream/LICENSE`)

| Berkas | Isi | SHA-256 |
|---|---|---|
| `jsonAttraction.txt` | 201 atraksi Jabodetabek (format Google Places + `ticketPrice`, `visitDuration`, `tags`) | `b25e1b976c2c6bf1a7d2a4811a199e402190eb7c942f491299f7397ffa661b72` |
| `distanceMatrix.csv` | Jarak jalan antaratraksi, meter (202×202 termasuk label "Jakarta") | `e9056f9022471d16f6a7a0bbe9805d577ec52e416e4353a43a7d9558fa22e221` |
| `durationMatrix.csv` | Waktu tempuh antaratraksi, detik (202×202) | `4df92f7fde7d37e88e90ef6bff370f8b48f09131a67ce274a15ec7164959e314` |

Jangan mengedit berkas-berkas ini. Data turunan dibuat dengan `npm run dataset:build` ke `data/processed/`.
Hasil audit kualitas data dibahas di `docs/audit_referensi.md`.
