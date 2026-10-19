import { DEFAULT_TRIP, tripInputSchema, type TripInput } from '@/ga/fitness';
import { DEFAULT_CONFIG, gaConfigSchema, type GAConfig } from '@/ga/ga';

/**
 * Parameter formulir disimpan di URL agar hasil bisa dibagikan, mis.
 * /hasil?anggaran=1000000&hari=5&jam=7&orang=2&preferensi=museum:1,history:0.5&populasi=100&seed=42
 */
export interface PlannerParams {
  trip: TripInput;
  config: GAConfig;
}

export const DEFAULT_PARAMS: PlannerParams = { trip: DEFAULT_TRIP, config: DEFAULT_CONFIG };

const TRIP_KEYS = { budget: 'anggaran', days: 'hari', hoursPerDay: 'jam', people: 'orang' } as const;
const CONFIG_KEYS = {
  populationSize: 'populasi',
  maxGenerations: 'generasi',
  crossoverRate: 'pc',
  mutationRate: 'pm',
  eliteCount: 'elit',
  selection: 'seleksi',
  tournamentSize: 'turnamen',
  maskCrossover: 'crossover',
  stagnationLimit: 'stagnasi',
  seed: 'seed',
} as const;

const encodeTags = (weights: Record<string, number>) =>
  Object.entries(weights)
    .filter(([, w]) => w > 0)
    .map(([t, w]) => `${t}:${w}`)
    .join(',');

const decodeTags = (text: string | null): Record<string, number> =>
  Object.fromEntries(
    (text ?? '')
      .split(',')
      .filter(Boolean)
      .map((pair) => {
        const [tag, w] = pair.split(':');
        return [tag as string, Math.min(1, Math.max(0, Number(w ?? 1)))];
      })
      .filter(([, w]) => Number.isFinite(w)),
  );

export function readParams(sp: Pick<URLSearchParams, 'get'>): PlannerParams {
  const num = (key: string) => {
    const v = sp.get(key);
    return v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v);
  };
  const tripRaw: Record<string, unknown> = { ...DEFAULT_TRIP, tagWeights: decodeTags(sp.get('preferensi')) };
  for (const [field, key] of Object.entries(TRIP_KEYS)) tripRaw[field] = num(key) ?? DEFAULT_TRIP[field as keyof typeof TRIP_KEYS];
  const configRaw: Record<string, unknown> = { ...DEFAULT_CONFIG };
  for (const [field, key] of Object.entries(CONFIG_KEYS)) {
    const value = field === 'selection' || field === 'maskCrossover' ? sp.get(key) : num(key);
    if (value !== null && value !== undefined) configRaw[field] = value;
  }
  const trip = tripInputSchema.safeParse(tripRaw);
  const config = gaConfigSchema.safeParse(configRaw);
  return { trip: trip.success ? trip.data : DEFAULT_TRIP, config: config.success ? config.data : DEFAULT_CONFIG };
}

/** Hanya nilai yang berbeda dari default yang ditulis, kecuali data perjalanan yang selalu ditulis. */
export function toQuery({ trip, config }: PlannerParams): string {
  const sp = new URLSearchParams();
  for (const [field, key] of Object.entries(TRIP_KEYS)) sp.set(key, String(trip[field as keyof typeof TRIP_KEYS]));
  const tags = encodeTags(trip.tagWeights);
  if (tags) sp.set('preferensi', tags);
  for (const [field, key] of Object.entries(CONFIG_KEYS)) {
    const value = config[field as keyof typeof CONFIG_KEYS];
    if (value !== DEFAULT_CONFIG[field as keyof typeof CONFIG_KEYS]) sp.set(key, String(value));
  }
  return sp.toString();
}

/** Kunci cache hasil: parameter yang sama → hasil yang sama (GA deterministik per seed). */
export const paramsKey = (p: PlannerParams, datasetId: string): string => `${datasetId}|${toQuery(p)}`;
