/**
 * Satuan data mentah (hasil audit, lihat docs/audit_referensi.md):
 * - ticketPrice   : rupiah per orang (string digit)       → `ticketPriceIdr` (number)
 * - visitDuration : jam (string desimal)                  → `visitHours` (number)
 * - distanceMatrix: meter (integer, -1 = tidak tersedia)  → disimpan apa adanya, dikonversi ke km saat dibaca
 * - durationMatrix: detik (integer, -1 = tidak tersedia)  → disimpan apa adanya, dikonversi ke jam saat dibaca
 */
export const RAW_UNITS = {
  ticketPrice: 'IDR per orang',
  visitDuration: 'jam',
  distance: 'meter',
  duration: 'detik',
} as const;

/** Nilai sel matriks yang dipakai upstream untuk "rute tidak ditemukan". */
export const MISSING_CELL = -1;

export const metersToKm = (meters: number): number => meters / 1000;
export const secondsToHours = (seconds: number): number => seconds / 3600;
