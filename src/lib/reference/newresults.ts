/** Satu baris JSON di newresults.txt (keluaran `showResults` upstream). */
export interface UpstreamResult {
  fitness: number;
  spots: string[];
  HTM: number;
  travelExpenses: number;
  totalExpenses: number;
  totalDuration: number;
  travelDuration: number;
  totalDist: number;
  route: string;
  'route-by-index': number[];
  'per-day-route': string[][];
}

/** Memecah newresults.txt menjadi run: setiap baris `type8` memulai run baru berisi baris-baris JSON. */
export function parseNewResults(text: string): UpstreamResult[][] {
  const runs: UpstreamResult[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === 'type8') runs.push([]);
    else if (line.startsWith('{')) runs.at(-1)?.push(JSON.parse(line) as UpstreamResult);
  }
  return runs;
}
