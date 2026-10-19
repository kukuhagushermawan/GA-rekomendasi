'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildDataset, fetchDefaultFiles, type Dataset, type RawFiles } from '@/ga/data';
import type { GenerationStats } from '@/ga/ga';
import type { ExperimentResult, RunResult, WorkerRequest, WorkerResponse } from '@/ga/worker';
import { paramsKey, type PlannerParams } from '@/lib/params';

/**
 * Status global aplikasi: dataset yang aktif, hasil run GA terakhir (cache per parameter),
 * dan eksperimen. GA selalu dijalankan di Web Worker.
 */

type Status = 'idle' | 'running' | 'done' | 'error';

export interface RunState {
  key: string | null;
  status: Status;
  progress: GenerationStats | null;
  maxGenerations: number;
  result: RunResult | null;
  error: string | null;
}

export interface ExperimentState {
  status: Status;
  done: number;
  total: number;
  label: string;
  result: ExperimentResult | null;
  error: string | null;
}

interface GaContextValue {
  files: RawFiles | null;
  dataset: Dataset | null;
  datasetName: string;
  datasetId: string;
  dataError: string | null;
  loadUploadedDataset: (files: RawFiles, name: string) => void;
  loadDefaultDataset: () => void;
  run: RunState;
  startRun: (params: PlannerParams) => Promise<RunResult | null>;
  cancelRun: () => void;
  getCachedRun: (params: PlannerParams) => RunResult | null;
  experiment: ExperimentState;
  startExperiment: (params: PlannerParams, seeds: number, sensitivitySeeds: number) => void;
  cancelExperiment: () => void;
}

const GaContext = createContext<GaContextValue | null>(null);

export const DEFAULT_DATASET_NAME = 'Data asli: 201 atraksi Jabodetabek (Qomariyah & Kazakov, 2021)';

const createWorker = () => new Worker(new URL('../ga/worker.ts', import.meta.url), { type: 'module' });

export function GaProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<RawFiles | null>(null);
  const [datasetName, setDatasetName] = useState(DEFAULT_DATASET_NAME);
  const [datasetId, setDatasetId] = useState('asli');
  const [dataError, setDataError] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>({ key: null, status: 'idle', progress: null, maxGenerations: 0, result: null, error: null });
  const [experiment, setExperiment] = useState<ExperimentState>({ status: 'idle', done: 0, total: 0, label: '', result: null, error: null });
  const cache = useRef(new Map<string, RunResult>());
  const runWorker = useRef<Worker | null>(null);
  const experimentWorker = useRef<Worker | null>(null);

  useEffect(() => {
    fetchDefaultFiles()
      .then(setFiles)
      .catch((e: unknown) => setDataError(e instanceof Error ? e.message : String(e)));
    return () => {
      runWorker.current?.terminate();
      experimentWorker.current?.terminate();
    };
  }, []);

  const dataset = useMemo(() => {
    if (!files) return null;
    try {
      return buildDataset(files);
    } catch {
      return null;
    }
  }, [files]);

  const loadUploadedDataset = useCallback((uploaded: RawFiles, name: string) => {
    buildDataset(uploaded); // lempar error bila tidak valid
    setFiles(uploaded);
    setDatasetName(name);
    setDatasetId(`unggahan-${Date.now()}`);
    cache.current.clear();
    setRun({ key: null, status: 'idle', progress: null, maxGenerations: 0, result: null, error: null });
  }, []);

  const loadDefaultDataset = useCallback(() => {
    setDataError(null);
    fetchDefaultFiles()
      .then((f) => {
        setFiles(f);
        setDatasetName(DEFAULT_DATASET_NAME);
        setDatasetId('asli');
        cache.current.clear();
      })
      .catch((e: unknown) => setDataError(e instanceof Error ? e.message : String(e)));
  }, []);

  const getCachedRun = useCallback((params: PlannerParams) => cache.current.get(paramsKey(params, datasetId)) ?? null, [datasetId]);

  const cancelRun = useCallback(() => {
    runWorker.current?.terminate();
    runWorker.current = null;
    setRun((r) => (r.status === 'running' ? { ...r, status: 'idle', progress: null } : r));
  }, []);

  const startRun = useCallback(
    (params: PlannerParams): Promise<RunResult | null> => {
      if (!files) return Promise.resolve(null);
      const key = paramsKey(params, datasetId);
      const cached = cache.current.get(key);
      if (cached) {
        setRun({ key, status: 'done', progress: null, maxGenerations: params.config.maxGenerations, result: cached, error: null });
        return Promise.resolve(cached);
      }
      runWorker.current?.terminate();
      const worker = createWorker();
      runWorker.current = worker;
      setRun({ key, status: 'running', progress: null, maxGenerations: params.config.maxGenerations, result: null, error: null });
      return new Promise((resolve) => {
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const msg = event.data;
          if (msg.type === 'progress') setRun((r) => (r.key === key ? { ...r, progress: msg.stats } : r));
          if (msg.type === 'done') {
            cache.current.set(key, msg.result);
            setRun((r) => (r.key === key ? { ...r, status: 'done', result: msg.result } : r));
            worker.terminate();
            resolve(msg.result);
          }
          if (msg.type === 'error') {
            setRun((r) => (r.key === key ? { ...r, status: 'error', error: msg.message } : r));
            worker.terminate();
            resolve(null);
          }
        };
        worker.onerror = (e) => {
          setRun((r) => (r.key === key ? { ...r, status: 'error', error: e.message || 'Worker gagal dijalankan' } : r));
          resolve(null);
        };
        worker.postMessage({ type: 'run', files, trip: params.trip, config: params.config } satisfies WorkerRequest);
      });
    },
    [files, datasetId],
  );

  const cancelExperiment = useCallback(() => {
    experimentWorker.current?.terminate();
    experimentWorker.current = null;
    setExperiment((x) => (x.status === 'running' ? { ...x, status: 'idle' } : x));
  }, []);

  const startExperiment = useCallback(
    (params: PlannerParams, seeds: number, sensitivitySeeds: number) => {
      if (!files) return;
      experimentWorker.current?.terminate();
      const worker = createWorker();
      experimentWorker.current = worker;
      setExperiment({ status: 'running', done: 0, total: 1, label: 'Menyiapkan…', result: null, error: null });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        if (msg.type === 'experimentProgress') setExperiment((x) => ({ ...x, done: msg.done, total: msg.total, label: msg.label }));
        if (msg.type === 'experimentDone') {
          setExperiment((x) => ({ ...x, status: 'done', result: msg.result }));
          worker.terminate();
        }
        if (msg.type === 'error') {
          setExperiment((x) => ({ ...x, status: 'error', error: msg.message }));
          worker.terminate();
        }
      };
      worker.postMessage({ type: 'experiment', files, trip: params.trip, config: params.config, seeds, sensitivitySeeds } satisfies WorkerRequest);
    },
    [files],
  );

  const value: GaContextValue = {
    files,
    dataset,
    datasetName,
    datasetId,
    dataError,
    loadUploadedDataset,
    loadDefaultDataset,
    run,
    startRun,
    cancelRun,
    getCachedRun,
    experiment,
    startExperiment,
    cancelExperiment,
  };
  return <GaContext.Provider value={value}>{children}</GaContext.Provider>;
}

export function useGa(): GaContextValue {
  const ctx = useContext(GaContext);
  if (!ctx) throw new Error('useGa harus dipakai di dalam <GaProvider>');
  return ctx;
}
