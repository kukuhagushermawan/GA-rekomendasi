/**
 * Port TypeScript dari GA-pairwise-recommender-system (Halim, Qomariyah & Kazakov), GPL-3.0.
 * Hanya sebagai REFERENSI PERILAKU untuk validasi silang; mesin GA aplikasi ini dibangun terpisah.
 */
export { UPSTREAM } from './constants';
export { evaluateV1, evaluateV3, sumCost, sumDuration, travelTotals } from './evaluate';
export type { EvalContext, Evaluated, TravelTotals } from './evaluate';
export { crossv2, cutter, generateDynamic, getDuplicateIndex, getTaggedDest, mutate, selection } from './operators';
export { daySuggestion, optimizeRouteApprox, routeDistanceMatrix } from './route-optimizer';
export type { OptimizedRoute } from './route-optimizer';
export { parseNewResults } from './newresults';
export type { UpstreamResult } from './newresults';
export { runType8 } from './type8';
export type { Type8Options, Type8Result } from './type8';
