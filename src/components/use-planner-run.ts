'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { useGa } from '@/components/ga-provider';
import { paramsKey, readParams, toQuery } from '@/lib/params';

/**
 * Mengambil hasil GA untuk parameter di URL. Bila belum ada di cache (mis. tautan dibagikan),
 * GA otomatis dijalankan di Web Worker.
 */
export function usePlannerRun() {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const params = useMemo(() => readParams(new URLSearchParams(search)), [search]);
  const { files, datasetId, run, startRun, getCachedRun } = useGa();
  const key = paramsKey(params, datasetId);
  const cached = getCachedRun(params);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!files || cached || started.current === key) return;
    if (run.status === 'running' && run.key === key) return;
    started.current = key;
    void startRun(params);
  }, [files, cached, key, params, run.status, run.key, startRun]);

  const result = cached ?? (run.key === key ? run.result : null);
  return { params, query: toQuery(params), run, result, isRunning: run.status === 'running' && run.key === key };
}
