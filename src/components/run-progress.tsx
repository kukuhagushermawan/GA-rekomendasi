'use client';

import type { RunState } from '@/components/ga-provider';
import { angka } from '@/lib/utils';

/** Progress bar generasi (di atas latar biru tua). */
export function RunProgress({ run }: { run: RunState }) {
  const generation = run.progress?.generation ?? 0;
  const pct = run.maxGenerations > 0 ? (generation / run.maxGenerations) * 100 : 0;
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-ugm-gold transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-white/60 tabular-nums">
        Generasi {generation} / {run.maxGenerations}
        {run.progress && ` · fitness ${angka(run.progress.bestFitness)}`}
      </p>
    </div>
  );
}
