import type { Rng } from '../random';
import type { Problem } from './problem';

/**
 * Greedy seeding acak (docs/desain_ga.md §4.1). Mulai dari kandidat acak (berbobot preferensi), lalu
 * berulang kali menambah salah satu dari `rcl` kandidat TERDEKAT yang masih layak — biaya ≤ anggaran,
 * durasi ≤ batas jam, dan jadwal harian tetap muat — dipilih acak berbobot (1 + 2 × preferensi).
 * Hasilnya rute yang valid sejak awal, sehingga populasi awal tidak seluruhnya tidak valid.
 */
export function greedySeedRoute(problem: Problem, rng: Rng, rcl = 5): number[] {
  const { n, input } = problem;
  const H = input.hoursPerDay;
  const people = input.people;
  const taxi = problem.costModel.taxiRatePerKm * problem.vehicles;

  const weightOf = (c: number) => 1 + 2 * (problem.preference[c] as number);
  const pickWeighted = (items: number[]): number => {
    const total = items.reduce((s, c) => s + weightOf(c), 0);
    let r = rng.next() * total;
    for (const c of items) {
      r -= weightOf(c);
      if (r < 0) return c;
    }
    return items[items.length - 1] as number;
  };

  const fitsAlone = (c: number) =>
    (problem.visit[c] as number) <= H && (problem.ticket[c] as number) * people <= input.budget;
  const starts: number[] = [];
  for (let c = 0; c < n; c++) if (fitsAlone(c)) starts.push(c);
  if (starts.length === 0) return [];

  const start = pickWeighted(starts);
  const route = [start];
  const used = new Uint8Array(n);
  used[start] = 1;
  let cost = (problem.ticket[start] as number) * people;
  let hours = problem.visit[start] as number;
  let dayHours = hours;
  let dayCount = 1;

  for (;;) {
    const last = route[route.length - 1] as number;
    const feasible: { c: number; travel: number; nextDayHours: number; nextDayCount: number; cost: number }[] = [];
    for (let c = 0; c < n; c++) {
      if (used[c] === 1) continue;
      const travel = problem.travelH[last * n + c] as number;
      const need = travel + (problem.visit[c] as number);
      const addCost = (problem.ticket[c] as number) * people + (problem.distKm[last * n + c] as number) * taxi;
      if (cost + addCost > input.budget || hours + need > problem.targetHours) continue;
      let nextDayHours = dayHours + need;
      let nextDayCount = dayCount;
      if (nextDayHours > H) {
        nextDayHours = need;
        nextDayCount += 1;
      }
      if (nextDayHours > H || nextDayCount > input.days) continue;
      feasible.push({ c, travel, nextDayHours, nextDayCount, cost: addCost });
    }
    if (feasible.length === 0) break;
    feasible.sort((a, b) => a.travel - b.travel || a.c - b.c);
    const chosenC = pickWeighted(feasible.slice(0, rcl).map((f) => f.c));
    const chosen = feasible.find((f) => f.c === chosenC) as (typeof feasible)[number];
    route.push(chosen.c);
    used[chosen.c] = 1;
    cost += chosen.cost;
    hours += chosen.travel + (problem.visit[chosen.c] as number);
    dayHours = chosen.nextDayHours;
    dayCount = chosen.nextDayCount;
  }
  return route;
}
