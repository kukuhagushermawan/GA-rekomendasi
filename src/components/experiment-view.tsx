'use client';

import { Play, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CHART_COLORS, EChart, type EChartOption } from '@/components/echart';
import { useGa } from '@/components/ga-provider';
import { PageHeading, Panel, PanelTitle, goldPill, outlinePill } from '@/components/panel';
import { TripChips } from '@/components/result-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PARAMETER_LABELS, type MethodSummary, type SensitivityParameter, type SensitivityPoint } from '@/ga/pembanding';
import { readParams } from '@/lib/params';
import { angka, cn, jam, persen, rupiah } from '@/lib/utils';

const AXIS = { axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } };
const BAR_COLORS = [CHART_COLORS.navy, '#cbd5e1', '#cbd5e1', '#cbd5e1'];

const comparisonOption = (summary: MethodSummary[]): EChartOption => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 40, right: 10, top: 24, bottom: 50 },
  xAxis: { type: 'category', data: summary.map((s) => s.label), ...AXIS, axisLabel: { color: '#64748b', interval: 0, width: 80, overflow: 'break' } },
  yAxis: { type: 'value', ...AXIS },
  series: [
    {
      type: 'bar',
      barWidth: '50%',
      data: summary.map((s, i) => ({ value: +s.meanFitness.toFixed(2), itemStyle: { color: BAR_COLORS[i], borderRadius: [6, 6, 0, 0] } })),
      label: { show: true, position: 'top', color: '#0c2a56', fontWeight: 600 },
    },
  ],
});

const sensitivityOption = (points: SensitivityPoint[]): EChartOption => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 36, right: 10, top: 12, bottom: 24 },
  xAxis: { type: 'category', data: points.map((p) => String(p.value)), ...AXIS },
  yAxis: { type: 'value', ...AXIS },
  series: [
    {
      type: 'line',
      color: CHART_COLORS.navy,
      data: points.map((p) => ({ value: +p.meanFitness.toFixed(2), symbolSize: p.isDefault ? 12 : 7, itemStyle: { color: p.isDefault ? '#f5c400' : CHART_COLORS.navy } })),
    },
  ],
});

export function ExperimentView() {
  const searchParams = useSearchParams();
  const params = useMemo(() => readParams(searchParams), [searchParams]);
  const { files, experiment, startExperiment, cancelExperiment } = useGa();
  const [seeds, setSeeds] = useState(10);
  const [sensSeeds, setSensSeeds] = useState(3);
  const result = experiment.result;
  const ga = result?.comparison.find((s) => s.method === 'ga');
  const rival = result?.comparison.filter((s) => s.method !== 'ga').reduce((a, b) => (b.meanFitness > a.meanFitness ? b : a));
  const pct = (experiment.done / Math.max(1, experiment.total)) * 100;

  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Eksperimen" title="GA dibanding metode lain">
        <TripChips params={params} />
      </PageHeading>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="seeds" className="text-white/70">
            Jumlah seed
          </Label>
          <Input id="seeds" type="number" min={1} max={50} className="w-24 border-white/20 bg-white/10 text-white" value={seeds} onChange={(e) => setSeeds(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sens" className="text-white/70">
            Seed sensitivitas
          </Label>
          <Input id="sens" type="number" min={0} max={20} className="w-24 border-white/20 bg-white/10 text-white" value={sensSeeds} onChange={(e) => setSensSeeds(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} />
        </div>
        {experiment.status === 'running' ? (
          <button type="button" className={outlinePill} onClick={cancelExperiment}>
            <X className="size-4" /> Batal
          </button>
        ) : (
          <button type="button" className={goldPill} onClick={() => startExperiment(params, seeds, sensSeeds)} disabled={!files}>
            <Play className="size-4" /> Jalankan
          </button>
        )}
      </div>

      {experiment.status === 'running' && (
        <div className="space-y-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-ugm-gold transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-white/60">{experiment.label}</p>
        </div>
      )}

      {experiment.status === 'error' && <p className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-100">{experiment.error}</p>}

      {result && ga && rival && (
        <>
          <div className="pt-2">
            <p className="text-6xl font-bold tabular-nums text-ugm-gold">{angka(ga.meanFitness / Math.max(rival.meanFitness, 1e-9), 1)}×</p>
            <p className="mt-1 text-white/70">fitness GA dibanding {rival.label.toLowerCase()}</p>
          </div>

          <Panel>
            <PanelTitle>Perbandingan metode</PanelTitle>
            <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metode</TableHead>
                      <TableHead className="text-right">Fitness</TableHead>
                      <TableHead className="text-right">Terbaik</TableHead>
                      <TableHead className="text-right">Valid</TableHead>
                      <TableHead className="text-right">Biaya</TableHead>
                      <TableHead className="text-right">Durasi</TableHead>
                      <TableHead className="text-right">Waktu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.comparison.map((s) => (
                      <TableRow key={s.method} className={cn(s.method === 'ga' && 'font-semibold text-ugm-ink')}>
                        <TableCell>{s.label}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {angka(s.meanFitness)} <span className="text-xs font-normal text-slate-400">± {angka(s.sdFitness)}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{angka(s.bestFitness)}</TableCell>
                        <TableCell className="text-right tabular-nums">{persen(s.validRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{rupiah(s.meanCost)}</TableCell>
                        <TableCell className="text-right tabular-nums">{jam(s.meanHours)}</TableCell>
                        <TableCell className="text-right tabular-nums">{Math.round(s.meanMs)} ms</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-3 text-xs text-slate-400">Rata-rata {result.seeds} seed. Pencarian acak memakai jumlah evaluasi yang sama dengan GA.</p>
              </div>
              <EChart option={comparisonOption(result.comparison)} height={260} />
            </div>
          </Panel>

          {result.sensitivity.length > 0 && (
            <Panel>
              <PanelTitle>Sensitivitas parameter</PanelTitle>
              <div className="grid gap-8 md:grid-cols-3">
                {(Object.keys(PARAMETER_LABELS) as SensitivityParameter[]).map((parameter) => (
                  <div key={parameter}>
                    <h3 className="text-sm text-slate-500">{PARAMETER_LABELS[parameter]}</h3>
                    <EChart option={sensitivityOption(result.sensitivity.filter((p) => p.parameter === parameter))} height={180} />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">Titik kuning = nilai default.</p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
