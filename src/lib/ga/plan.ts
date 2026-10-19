import type { Attraction } from '../data/schema';
import type { ArchivedPlan } from './engine';
import type { Problem } from './problem';

export interface PlanStop {
  attractionIndex: number;
  id: string;
  name: string;
  tags: string[];
  ticketPerPerson: number;
  visitHours: number;
  travelHoursIn: number;
  travelKmIn: number;
  startHour: number;
  endHour: number;
}

export interface PlanDay {
  day: number;
  hours: number;
  overLimit: boolean;
  stops: PlanStop[];
}

/** Rencana siap tampil: semua angka dalam rupiah / jam / km. */
export interface PlanView {
  rank: number;
  ids: string[];
  names: string[];
  ticketCost: number;
  transportCost: number;
  totalCost: number;
  remainingBudget: number;
  visitHours: number;
  travelHours: number;
  totalHours: number;
  distanceKm: number;
  /** Kecocokan preferensi kategori, 0–1. */
  preference: number;
  valid: boolean;
  scheduleFits: boolean;
  /** Alasan tidak valid / peringatan jadwal, dalam bahasa Indonesia. */
  issues: string[];
  fitness: number;
  days: PlanDay[];
}

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const hours = (n: number) => `${n.toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam`;

export function toPlanView(problem: Problem, plan: ArchivedPlan, rank: number): PlanView {
  const e = plan.evaluation;
  const attraction = (c: number) => problem.attractions[problem.candidates[c] as number] as Attraction;
  const issues: string[] = [];
  if (e.totalCost > problem.input.budget) issues.push(`Biaya melebihi anggaran sebesar ${rupiah(e.totalCost - problem.input.budget)}`);
  if (e.totalHours > problem.targetHours) issues.push(`Durasi melebihi batas sebesar ${hours(e.totalHours - problem.targetHours)}`);
  if (!e.schedule.fits) {
    const over = e.schedule.days.filter((d) => d.overLimit).length;
    if (e.schedule.days.length > problem.input.days) {
      issues.push(`Jadwal harian butuh ${e.schedule.days.length} hari (tersedia ${problem.input.days})`);
    }
    if (over > 0) issues.push(`${over} hari melebihi ${hours(problem.input.hoursPerDay)}`);
  }

  return {
    rank,
    ids: plan.route.map((c) => attraction(c).id),
    names: plan.route.map((c) => attraction(c).name),
    ticketCost: e.ticketCost,
    transportCost: e.transportCost,
    totalCost: e.totalCost,
    remainingBudget: problem.input.budget - e.totalCost,
    visitHours: e.visitHours,
    travelHours: e.travelHours,
    totalHours: e.totalHours,
    distanceKm: e.distanceKm,
    preference: e.preference,
    valid: e.valid,
    scheduleFits: e.schedule.fits,
    issues,
    fitness: e.fitness,
    days: e.schedule.days.map((d) => ({
      day: d.day,
      hours: d.hours,
      overLimit: d.overLimit,
      stops: d.stops.map((s) => {
        const a = attraction(s.candidate);
        return {
          attractionIndex: a.index,
          id: a.id,
          name: a.name,
          tags: a.tags,
          ticketPerPerson: a.ticketPriceIdr,
          visitHours: s.visitHours,
          travelHoursIn: s.travelHoursIn,
          travelKmIn: s.travelKmIn,
          startHour: s.startHour,
          endHour: s.endHour,
        };
      }),
    })),
  };
}
