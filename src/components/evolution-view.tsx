'use client';

import { useMemo } from 'react';
import { CHART_COLORS, EChart, type EChartOption } from '@/components/echart';
import { Panel, PanelTitle, StatStrip } from '@/components/panel';
import { ResultHeader } from '@/components/result-header';
import { RunProgress } from '@/components/run-progress';
import { usePlannerRun } from '@/components/use-planner-run';
import type { RunResult } from '@/ga/worker';
import { angka, persen } from '@/lib/utils';

const AXIS = { axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } };

function convergenceOption(result: RunResult): EChartOption {
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, icon: 'circle', textStyle: { color: '#64748b' } },
    grid: { left: 40, right: 40, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: result.history.map((h) => h.generation), ...AXIS },
    yAxis: [
      { type: 'value', ...AXIS },
      { type: 'value', min: 0, max: 100, ...AXIS, axisLabel: { color: '#64748b', formatter: '{value}%' }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Terbaik', type: 'line', showSymbol: false, data: result.history.map((h) => +h.bestFitness.toFixed(3)), lineStyle: { width: 2.5 }, color: CHART_COLORS.navy },
      { name: 'Rata-rata', type: 'line', showSymbol: false, data: result.history.map((h) => +h.meanFitness.toFixed(3)), color: CHART_COLORS.gold },
      { name: 'Valid', type: 'line', yAxisIndex: 1, showSymbol: false, data: result.history.map((h) => Math.round(h.validRate * 100)), lineStyle: { type: 'dashed', width: 1 }, color: CHART_COLORS.grey },
    ],
  };
}

function scatterOption(result: RunResult): EChartOption {
  const points = result.finalPopulation.map((p) => ({
    x: Math.abs(p.durationError) * result.targetHours,
    y: (Math.abs(p.costError) * result.budget) / 1000,
    score: Math.abs(p.costError) + Math.abs(p.durationError),
    valid: p.valid,
  }));
  const pool = points.some((p) => p.valid) ? points.filter((p) => p.valid) : points;
  const best = pool.reduce((a, b) => (b.score < a.score ? b : a), pool[0] ?? { x: 0, y: 0, score: 0, valid: false });
  // Sumbu dipotong di persentil 90 agar klaster utama terlihat.
  const cap = (xs: number[]) => Math.max(1, ([...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] ?? 1) * 1.15);
  return {
    tooltip: { formatter: (p: { data: [number, number] }) => `${p.data[0].toFixed(1)} jam · Rp${Math.round(p.data[1] * 1000).toLocaleString('id-ID')}` },
    legend: { top: 0, icon: 'circle', textStyle: { color: '#64748b' } },
    grid: { left: 50, right: 20, top: 36, bottom: 40 },
    xAxis: { type: 'value', name: 'error durasi (jam)', nameLocation: 'middle', nameGap: 26, min: 0, max: +cap(points.map((p) => p.x)).toFixed(1), ...AXIS },
    yAxis: { type: 'value', name: 'error biaya (Rp ribu)', nameLocation: 'middle', nameGap: 38, min: 0, max: Math.ceil(cap(points.map((p) => p.y))), ...AXIS },
    series: [
      { name: 'Valid', type: 'scatter', symbolSize: 7, color: CHART_COLORS.navy, data: points.filter((p) => p.valid).map((p) => [p.x, p.y]) },
      { name: 'Tidak valid', type: 'scatter', symbolSize: 6, color: '#cbd5e1', data: points.filter((p) => !p.valid).map((p) => [p.x, p.y]) },
      {
        name: 'Paling seimbang',
        type: 'scatter',
        symbolSize: 16,
        color: CHART_COLORS.gold,
        z: 10,
        data: [[best.x, best.y]],
        label: { show: true, formatter: 'paling seimbang', position: 'right', color: '#052a4a', fontWeight: 600 },
      },
    ],
  };
}

export function EvolutionView() {
  const { params, query, run, result, isRunning } = usePlannerRun();
  const convergence = useMemo(() => (result ? convergenceOption(result) : null), [result]);
  const scatter = useMemo(() => (result ? scatterOption(result) : null), [result]);
  const first = result?.history[0];
  const last = result?.history.at(-1);

  return (
    <div className="space-y-6">
      <ResultHeader title="Evolusi" params={params} query={query} />
      {isRunning && <RunProgress run={run} />}

      {result && first && last && convergence && scatter && (
        <>
          <StatStrip
            stats={[
              [angka(first.bestFitness), 'fitness generasi awal'],
              [angka(last.bestFitness), 'fitness akhir'],
              [`${angka(last.bestFitness / first.bestFitness, 1)}×`, 'peningkatan'],
              [persen(last.validRate), 'individu valid'],
            ]}
          />
          <Panel>
            <PanelTitle>Konvergensi fitness</PanelTitle>
            <EChart option={convergence} height={320} />
          </Panel>
          <Panel>
            <PanelTitle>Error biaya vs error durasi</PanelTitle>
            <EChart option={scatter} height={340} />
          </Panel>
        </>
      )}
    </div>
  );
}
