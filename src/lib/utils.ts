export { cn } from 'cn';

/** Rp1.234.567 */
export const rupiah = (x: number): string => `${x < 0 ? '−' : ''}Rp${Math.abs(Math.round(x)).toLocaleString('id-ID')}`;

/** 2,5 jam */
export const jam = (x: number, digits = 1): string => `${x.toLocaleString('id-ID', { maximumFractionDigits: digits })} jam`;

/** 45% */
export const persen = (x: number): string => `${Math.round(x * 100)}%`;

export const angka = (x: number, digits = 2): string =>
  x.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Jam dinding untuk linimasa: hari dimulai pukul 08.00. */
export const pukul = (hoursFromStart: number, startHour = 8): string => {
  const total = Math.round((startHour + hoursFromStart) * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}.${String(total % 60).padStart(2, '0')}`;
};

/** Warna per hari pada peta & linimasa. */
export const DAY_COLORS = ['#083d6b', '#d99a00', '#0f8b8d', '#c2410c', '#7c3aed', '#be185d', '#15803d', '#475569'];
export const dayColor = (day: number): string => DAY_COLORS[(day - 1) % DAY_COLORS.length] as string;
