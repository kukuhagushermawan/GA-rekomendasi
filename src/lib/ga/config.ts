import { z } from 'zod';

/** Masukan wisatawan. Divalidasi zod karena nantinya dibaca dari URL search params. */
export const tripInputSchema = z.object({
  /** Anggaran total rombongan, rupiah. */
  budget: z.number().int().positive(),
  days: z.number().int().min(1).max(30),
  /** Batas jam aktif per hari. Default 7 sesuai slide (upstream memakai 10). */
  hoursPerDay: z.number().positive().max(24),
  people: z.number().int().min(1).max(50),
  /** Bobot preferensi per tag di [0, 1]. Tag yang tidak disebut berbobot 0. */
  tagWeights: z.record(z.string(), z.number().min(0).max(1)),
});
export type TripInput = z.infer<typeof tripInputSchema>;

export const costModelSchema = z.object({
  /** Tarif taksi per km per kendaraan (upstream `TAXI_RATE`). */
  taxiRatePerKm: z.number().nonnegative(),
  /** Kapasitas satu kendaraan; jumlah kendaraan = ceil(orang / kapasitas). Untuk ≤ 4 orang sama dengan upstream. */
  seatsPerVehicle: z.number().int().min(1),
  /** Nilai pengganti untuk sel matriks -1 atau 0 di luar diagonal (aturan upstream, bukan perbaikan data). */
  fallbackDistanceM: z.number().nonnegative(),
  fallbackDurationS: z.number().nonnegative(),
});
export type CostModel = z.infer<typeof costModelSchema>;

/** Bobot komponen fitness (lihat docs/desain_ga.md §3). */
export const fitnessWeightsSchema = z.object({
  cost: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  /** Penalti pelanggaran batas biaya/durasi (relatif). */
  violation: z.number().nonnegative(),
  /** Penalti jadwal harian yang tidak muat dalam jumlah hari. */
  schedule: z.number().nonnegative(),
  /** Bonus kecocokan preferensi tag: pengali (1 + preference × skor). */
  preference: z.number().nonnegative(),
  /** Pencegah pembagian nol. */
  epsilon: z.number().positive(),
});
export type FitnessWeights = z.infer<typeof fitnessWeightsSchema>;

export const gaConfigSchema = z
  .object({
    populationSize: z.number().int().min(2).max(2000),
    maxGenerations: z.number().int().min(1).max(10000),
    crossoverRate: z.number().min(0).max(1),
    /** Peluang mutasi per gen terpilih (per posisi rute). */
    mutationRate: z.number().min(0).max(1),
    /** Peluang mutasi "tambah" memilih tetangga terdekat destinasi rute, bukan kandidat acak global. */
    localAddRate: z.number().min(0).max(1),
    eliteCount: z.number().int().min(0),
    selection: z.enum(['tournament', 'roulette']),
    tournamentSize: z.number().int().min(2),
    /** Crossover bagian pemilihan (mask). Bagian urutan selalu memakai order crossover (OX). */
    maskCrossover: z.enum(['uniform', 'onePoint']),
    /** Berhenti bila fitness terbaik tidak membaik selama sekian generasi. 0 = nonaktif. */
    stagnationLimit: z.number().int().min(0),
    /** Porsi populasi awal yang diisi heuristik greedy. */
    greedySeedRatio: z.number().min(0).max(1),
    topK: z.number().int().min(1).max(50),
    /** Selisih minimum (beda himpunan destinasi) antar-rencana dalam top-K. */
    minPlanDifference: z.number().int().min(1),
  })
  .refine((c) => c.eliteCount < c.populationSize, { message: 'eliteCount harus < populationSize', path: ['eliteCount'] });
export type GAConfig = z.infer<typeof gaConfigSchema>;

export const DEFAULT_TRIP: TripInput = {
  budget: 1_000_000,
  days: 5,
  hoursPerDay: 7,
  people: 2,
  tagWeights: {},
};

export const DEFAULT_COST_MODEL: CostModel = {
  taxiRatePerKm: 5000,
  seatsPerVehicle: 4,
  fallbackDistanceM: 15000,
  fallbackDurationS: 1300,
};

export const DEFAULT_WEIGHTS: FitnessWeights = {
  cost: 1,
  duration: 1,
  violation: 10,
  schedule: 1,
  preference: 1,
  epsilon: 0.01,
};

export const DEFAULT_GA_CONFIG: GAConfig = {
  populationSize: 100,
  maxGenerations: 200,
  crossoverRate: 0.8,
  mutationRate: 0.05,
  localAddRate: 0.8,
  eliteCount: 2,
  selection: 'tournament',
  tournamentSize: 3,
  maskCrossover: 'uniform',
  stagnationLimit: 100,
  greedySeedRatio: 0.2,
  topK: 5,
  minPlanDifference: 2,
};
