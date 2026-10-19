import type { Problem } from './problem';

export interface ScheduleStop {
  /** Indeks kandidat lokal. */
  candidate: number;
  /** Tempuh dari destinasi sebelumnya (0 untuk destinasi pertama rute). */
  travelHoursIn: number;
  travelKmIn: number;
  visitHours: number;
  /** Jam ke-berapa sejak awal hari (termasuk tempuh masuk). */
  startHour: number;
  endHour: number;
}

export interface DaySchedule {
  day: number;
  stops: ScheduleStop[];
  hours: number;
  /** Hari ini melebihi jam per hari (terjadi bila satu destinasi saja sudah lebih lama dari batas). */
  overLimit: boolean;
}

export interface ScheduleResult {
  days: DaySchedule[];
  /**
   * Rentang waktu terpakai: hari penuh dihitung minimal `hoursPerDay`, ditambah jam hari terakhir.
   * Rencana muat bila span ≤ hari × jam per hari dan tidak ada hari yang overLimit.
   */
  span: number;
  /** Jam di atas batas: max(0, span − target) + Σ kelebihan per hari. */
  overflowHours: number;
  fits: boolean;
}

/**
 * Memecah rute berurutan ke hari-hari secara greedy: destinasi masuk ke hari berjalan bila
 * jam hari itu + tempuh + kunjungan ≤ jam per hari; jika tidak, mulai hari baru.
 * Tempuh antardestinasi tetap dihitung walau melintasi pergantian hari (tidak ada data hotel),
 * sehingga Σ jam semua hari = total durasi rencana.
 */
export function splitIntoDays(problem: Problem, route: readonly number[]): ScheduleResult {
  const { hoursPerDay, days: dayLimit } = problem.input;
  const days: DaySchedule[] = [];
  let current: DaySchedule | null = null;

  for (let k = 0; k < route.length; k++) {
    const c = route[k] as number;
    const prev = k > 0 ? (route[k - 1] as number) : -1;
    const travelHoursIn = prev >= 0 ? (problem.travelH[prev * problem.n + c] as number) : 0;
    const travelKmIn = prev >= 0 ? (problem.distKm[prev * problem.n + c] as number) : 0;
    const visitHours = problem.visit[c] as number;
    const need = travelHoursIn + visitHours;

    if (!current || (current.stops.length > 0 && current.hours + need > hoursPerDay)) {
      current = { day: days.length + 1, stops: [], hours: 0, overLimit: false };
      days.push(current);
    }
    const startHour = current.hours;
    current.hours += need;
    current.stops.push({ candidate: c, travelHoursIn, travelKmIn, visitHours, startHour, endHour: current.hours });
    current.overLimit = current.hours > hoursPerDay;
  }

  let span = 0;
  let perDayExcess = 0;
  days.forEach((d, i) => {
    span += i < days.length - 1 ? Math.max(hoursPerDay, d.hours) : d.hours;
    perDayExcess += Math.max(0, d.hours - hoursPerDay);
  });
  const target = dayLimit * hoursPerDay;
  const overflowHours = Math.max(0, span - target) + perDayExcess;
  return { days, span, overflowHours, fits: days.length <= dayLimit && perDayExcess === 0 };
}
