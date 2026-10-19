/**
 * Konstanta kode referensi GA-pairwise-recommender-system (GPL-3.0), commit 4afb44d.
 * Setiap nilai dikutip dari berkas Python aslinya; lihat docs/audit_referensi.md.
 */
export const UPSTREAM = {
  /** utils.py `TAXI_RATE` — tarif taksi rupiah per km, per rombongan (tidak dikali jumlah orang). */
  TAXI_RATE_IDR_PER_KM: 5000,
  /** utils.py evaluateV1: pengganti jarak bila sel matriks -1 atau 0 (meter). */
  FALLBACK_DISTANCE_M: 15000,
  /** utils.py evaluateV1: pengganti durasi bila sel matriks -1 atau 0 (detik). */
  FALLBACK_DURATION_S: 1300,
  /** utils.py evaluateV1: pembagi selisih biaya → costScore. */
  COST_SCORE_DIVISOR: 100000,
  /** Jam per hari di evaluateV1/V3, cutter, dan RouteOptimizer.day_suggestion. */
  EVAL_HOURS_PER_DAY: 10,
  /** Jam per hari di generateDynamic (inisialisasi). */
  INIT_HOURS_PER_DAY: 7,
  /** main.py type8 → generateDynamic(costRate=0.75). */
  INIT_COST_RATE: 0.75,
  /** Ukuran populasi (hardcoded `range(40)`). */
  POPULATION_SIZE: 40,
  /** main.py memanggil type8(..., repRate=8): jumlah generasi yang benar-benar dijalankan. */
  GENERATIONS: 8,
  /** main.py type8: loop berhenti bila fitness bestSoFar[0] ≥ 1.2. */
  STOP_FITNESS: 1.2,
  /** main.py meneruskan mutationRate=0.1, tetapi type8 tidak pernah memanggil mutate(). */
  MUTATION_RATE_UNUSED: 0.1,
  /** Nilai default argumen CLI main.py. */
  DEFAULTS: {
    nPeople: 2,
    budget: 3_000_000,
    days: 3,
    /** Diparsing tetapi tidak dipakai oleh type8. */
    epochs: 400,
    tags: ['museum', 'beach', 'kids-friendly'],
  },
} as const;
