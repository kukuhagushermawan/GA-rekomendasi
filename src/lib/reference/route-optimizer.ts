import type { Attraction } from '../data/schema';
import { rawDistanceM, rawDurationS, type TravelMatrices } from '../data/load';
import { UPSTREAM } from './constants';

/**
 * Port routeOptimizer.py (GPL-3.0). Upstream TIDAK mengurutkan rute di dalam GA; setelah GA selesai,
 * tiap hasil diurutkan ulang dengan Google OR-Tools (TSP satu kendaraan, depot = gen pertama,
 * tur tertutup, biaya = jarak saja, strategi awal PATH_CHEAPEST_ARC + pencarian lokal default).
 *
 * `optimizeRouteApprox` adalah APROKSIMASI: PATH_CHEAPEST_ARC (tetangga termurah dari depot) +
 * greedy descent 2-opt & relocate. OR-Tools memakai operator tambahan, jadi rute bisa berbeda.
 * `daySuggestion` diport persis, termasuk bug-nya.
 */

/** get_distance_data: matriks jarak antar-gen; sel -1 atau 0 (termasuk diagonal) diganti 15000. */
export function routeDistanceMatrix(genes: readonly number[], matrices: TravelMatrices): number[][] {
  return genes.map((from) =>
    genes.map((to) => {
      const d = rawDistanceM(matrices, from, to);
      return d === -1 || d === 0 ? UPSTREAM.FALLBACK_DISTANCE_M : d;
    }),
  );
}

const tourCost = (dm: number[][], tour: readonly number[]): number => {
  let sum = 0;
  for (let i = 0; i < tour.length; i++) {
    sum += (dm[tour[i] as number] as number[])[tour[(i + 1) % tour.length] as number] as number;
  }
  return sum;
};

function pathCheapestArc(dm: number[][]): number[] {
  const n = dm.length;
  const tour = [0];
  const used = new Set([0]);
  while (tour.length < n) {
    const row = dm[tour[tour.length - 1] as number] as number[];
    let best = -1;
    for (let j = 0; j < n; j++) {
      if (used.has(j)) continue;
      if (best === -1 || (row[j] as number) < (row[best] as number)) best = j;
    }
    tour.push(best);
    used.add(best);
  }
  return tour;
}

function improve(dm: number[][], start: number[]): number[] {
  let tour = start;
  let cost = tourCost(dm, tour);
  for (let improved = true; improved; ) {
    improved = false;
    // 2-opt: balik segmen [i..k], depot (posisi 0) tetap.
    for (let i = 1; i < tour.length - 1 && !improved; i++) {
      for (let k = i + 1; k < tour.length && !improved; k++) {
        const candidate = [...tour.slice(0, i), ...tour.slice(i, k + 1).reverse(), ...tour.slice(k + 1)];
        const c = tourCost(dm, candidate);
        if (c < cost) [tour, cost, improved] = [candidate, c, true];
      }
    }
    // relocate: pindahkan satu simpul (bukan depot) ke posisi lain.
    for (let i = 1; i < tour.length && !improved; i++) {
      for (let j = 1; j < tour.length && !improved; j++) {
        if (i === j) continue;
        const rest = tour.filter((_, idx) => idx !== i);
        const candidate = [...rest.slice(0, j), tour[i] as number, ...rest.slice(j)];
        const c = tourCost(dm, candidate);
        if (c < cost) [tour, cost, improved] = [candidate, c, true];
      }
    }
  }
  return tour;
}

export interface OptimizedRoute {
  /** ObjectiveValue: panjang tur TERTUTUP (kembali ke depot), meter. */
  totalDist: number;
  /** Urutan posisi gen (route-by-index), dimulai dari 0. */
  routeList: number[];
  /** Format string upstream: " A -> B ->". */
  placesOutput: string;
  perDayRoute: string[][];
}

export function optimizeRouteApprox(
  genes: readonly number[],
  attractions: readonly Attraction[],
  matrices: TravelMatrices,
): OptimizedRoute {
  if (genes.length === 0) return { totalDist: 0, routeList: [], placesOutput: '', perDayRoute: [[]] };
  const dm = routeDistanceMatrix(genes, matrices);
  const routeList = improve(dm, pathCheapestArc(dm));
  const name = (pos: number) => (attractions[genes[pos] as number] as Attraction).matrixKey;
  return {
    totalDist: tourCost(dm, routeList),
    routeList,
    placesOutput: routeList.map((pos) => ` ${name(pos)} ->`).join(''),
    perDayRoute: daySuggestion(genes, routeList, attractions, matrices),
  };
}

/**
 * RouteOptimizer.day_suggestion, diport persis:
 * - batas 10 jam per hari (hardcoded);
 * - waktu tempuh dibulatkan ke bawah per jam (`floor`), TANPA nilai pengganti → sel -1 menyumbang −1 jam;
 * - UPSTREAM-BUG: tempuh dibaca dari gen ke-(posisi−1) pada urutan KROMOSOM, bukan simpul sebelumnya
 *   di rute, dan arahnya terbalik (simpul ini → sebelumnya).
 */
export function daySuggestion(
  genes: readonly number[],
  routeList: readonly number[],
  attractions: readonly Attraction[],
  matrices: TravelMatrices,
): string[][] {
  const gene = (pos: number) => genes[pos] as number;
  const attr = (pos: number) => attractions[gene(pos)] as Attraction;
  let currHour = 0;
  let planDay: string[] = [];
  const suggestion: string[][] = [];
  for (const i of routeList) {
    currHour += attr(i).visitHours;
    const position = routeList.indexOf(i);
    if (position !== 0) {
      currHour += Math.floor(rawDurationS(matrices, gene(i), gene(position - 1)) / 60 / 60);
    }
    if (currHour <= UPSTREAM.EVAL_HOURS_PER_DAY) {
      planDay.push(attr(i).matrixKey);
    } else {
      suggestion.push(planDay);
      planDay = [attr(i).matrixKey];
      currHour = attr(i).visitHours;
    }
  }
  suggestion.push(planDay);
  return suggestion;
}
