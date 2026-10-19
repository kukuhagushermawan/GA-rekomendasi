/// <reference lib="webworker" />
import { createRng } from './acak';
import { buildDataset, type RawFiles } from './data';
import { buildProblem, toPlanView, type PlanView, type TripInput } from './fitness';
import { runGA, type GAConfig, type GAResult, type GenerationStats, type PopulationPoint } from './ga';
import { SENSITIVITY_GRID, compareMethods, sensitivityAnalysis, type MethodSummary, type SensitivityPoint } from './pembanding';

/**
 * Web Worker: GA dijalankan di thread terpisah agar UI tidak membeku.
 * UI mengirim { type: 'run' | 'experiment', ... }, worker membalas progres lalu hasil.
 */

export type WorkerRequest =
  | { type: 'run'; files: RawFiles; trip: TripInput; config: GAConfig }
  | { type: 'experiment'; files: RawFiles; trip: TripInput; config: GAConfig; seeds: number; sensitivitySeeds: number };

export interface RunResult {
  plans: PlanView[];
  history: GenerationStats[];
  finalPopulation: PopulationPoint[];
  generations: number;
  evaluations: number;
  stopReason: GAResult['stopReason'];
  elapsedMs: number;
  candidateCount: number;
  excluded: { name: string; reason: string }[];
  budget: number;
  targetHours: number;
}

export interface ExperimentResult {
  comparison: MethodSummary[];
  sensitivity: SensitivityPoint[];
  seeds: number;
  sensitivitySeeds: number;
}

export type WorkerResponse =
  | { type: 'progress'; stats: GenerationStats }
  | { type: 'done'; result: RunResult }
  | { type: 'experimentProgress'; done: number; total: number; label: string }
  | { type: 'experimentDone'; result: ExperimentResult }
  | { type: 'error'; message: string };

const post = (message: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const problem = buildProblem(buildDataset(request.files), request.trip);

    if (request.type === 'run') {
      let lastPost = 0;
      const result = runGA(problem, request.config, createRng(request.config.seed), {
        onGeneration: (stats) => {
          // Kirim progres maks. ~30 kali per detik.
          const now = performance.now();
          if (now - lastPost > 33 || stats.generation === request.config.maxGenerations) {
            lastPost = now;
            post({ type: 'progress', stats });
          }
        },
      });
      post({
        type: 'done',
        result: {
          plans: result.top.map((plan, i) => toPlanView(problem, plan.route, plan.evaluation, i + 1)),
          history: result.history,
          finalPopulation: result.finalPopulation,
          generations: result.generations,
          evaluations: result.evaluations,
          stopReason: result.stopReason,
          elapsedMs: result.elapsedMs,
          candidateCount: problem.n,
          excluded: problem.excluded,
          budget: problem.input.budget,
          targetHours: problem.targetHours,
        },
      });
      return;
    }

    const seeds = Array.from({ length: request.seeds }, (_, i) => i + 1);
    const sensSeeds = Array.from({ length: request.sensitivitySeeds }, (_, i) => i + 1);
    const gridSize = Object.values(SENSITIVITY_GRID).reduce((sum, values) => sum + values.length, 0);
    const totalUnits = seeds.length + sensSeeds.length * gridSize;
    const comparison = compareMethods(problem, seeds, request.config, (done, _total, label) =>
      post({ type: 'experimentProgress', done, total: totalUnits, label: `Perbandingan metode — ${label}` }),
    );
    const sensitivity =
      sensSeeds.length > 0
        ? sensitivityAnalysis(problem, sensSeeds, request.config, (done, _total, label) =>
            post({ type: 'experimentProgress', done: seeds.length + done, total: totalUnits, label: `Sensitivitas — ${label}` }),
          )
        : [];
    post({ type: 'experimentDone', result: { comparison, sensitivity, seeds: seeds.length, sensitivitySeeds: sensSeeds.length } });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
