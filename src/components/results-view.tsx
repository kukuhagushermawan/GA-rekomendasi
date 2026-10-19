'use client';

import Link from 'next/link';
import { useState } from 'react';
import { goldPill, outlinePill } from '@/components/panel';
import { PlanCard } from '@/components/plan-card';
import { PlanDetail } from '@/components/plan-detail';
import { ResultHeader } from '@/components/result-header';
import { RunProgress } from '@/components/run-progress';
import { usePlannerRun } from '@/components/use-planner-run';
import { toQuery, type PlannerParams } from '@/lib/params';

const relaxed = (params: PlannerParams, patch: Partial<PlannerParams['trip']>) =>
  `/hasil?${toQuery({ ...params, trip: { ...params.trip, ...patch } })}`;

export function ResultsView() {
  const { params, query, run, result, isRunning } = usePlannerRun();
  const [selectedRank, setSelectedRank] = useState(1);
  const plans = result?.plans ?? [];
  const selected = plans.find((p) => p.rank === selectedRank) ?? plans[0];

  return (
    <div className="space-y-8">
      <ResultHeader title={result ? `${plans.length} rencana terbaik` : 'Mencari rencana…'} params={params} query={query} />

      {isRunning && <RunProgress run={run} />}
      {run.status === 'error' && !result && <p className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-100">{run.error}</p>}

      {result && !plans.some((p) => p.valid) && (
        <div className="space-y-3 rounded-2xl border border-ugm-gold/40 bg-ugm-gold/10 p-5">
          <p className="font-semibold">Belum ada rencana yang valid</p>
          <div className="flex flex-wrap gap-2">
            <Link className={goldPill} href={relaxed(params, { budget: Math.round(params.trip.budget * 1.25) })}>
              Anggaran +25%
            </Link>
            <Link className={outlinePill} href={relaxed(params, { days: params.trip.days + 1 })}>
              Tambah 1 hari
            </Link>
            <Link className={outlinePill} href={relaxed(params, { hoursPerDay: params.trip.hoursPerDay + 1 })}>
              +1 jam per hari
            </Link>
          </div>
        </div>
      )}

      {selected && (
        <div className="grid gap-6 lg:grid-cols-[290px_1fr]">
          <div className="space-y-3">
            {plans.map((plan) => (
              <PlanCard key={plan.rank} plan={plan} selected={plan.rank === selected.rank} onSelect={() => setSelectedRank(plan.rank)} />
            ))}
            {result && (
              <p className="px-1 pt-1 text-xs text-white/50">
                {result.generations} generasi · {(result.elapsedMs / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} detik
              </p>
            )}
          </div>
          <PlanDetail plan={selected} people={params.trip.people} budget={params.trip.budget} />
        </div>
      )}
    </div>
  );
}
