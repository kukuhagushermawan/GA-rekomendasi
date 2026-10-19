'use client';

import { ArrowRight, ChevronDown, Loader2, RotateCcw, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { useGa } from '@/components/ga-provider';
import { PageHeading, Panel, PanelTitle, goldPill, outlinePill } from '@/components/panel';
import { RunProgress } from '@/components/run-progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { TAG_LABELS } from '@/ga/data';
import { tripInputSchema } from '@/ga/fitness';
import { gaConfigSchema, type GAConfig } from '@/ga/ga';
import { DEFAULT_PARAMS, readParams, toQuery, type PlannerParams } from '@/lib/params';
import { cn, jam, rupiah } from '@/lib/utils';

const SELECT_CLASS = 'h-9 w-full rounded-md border border-input bg-white px-2 text-sm';

function Field({ label, note, error, children }: { label: string; note?: string; error?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-slate-500">{label}</Label>
      {children}
      {(error || note) && <p className={cn('text-xs', error ? 'text-destructive' : 'text-slate-400')}>{error ? 'Nilai tidak valid' : note}</p>}
    </div>
  );
}

function NumberInput({ value, onChange, ...rest }: { value: number; onChange: (v: number) => void } & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  return <Input type="number" value={Number.isNaN(value) ? '' : value} onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))} {...rest} />;
}

export function PlannerForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { files, dataError, run, startRun, cancelRun } = useGa();
  const [params, setParams] = useState<PlannerParams>(() => readParams(searchParams));
  const [advanced, setAdvanced] = useState(false);

  const tripCheck = tripInputSchema.safeParse(params.trip);
  const configCheck = gaConfigSchema.safeParse(params.config);
  const bad = (check: typeof tripCheck | typeof configCheck, field: string) => !check.success && check.error.issues.some((i) => i.path[0] === field);
  const valid = tripCheck.success && configCheck.success;
  const running = run.status === 'running';

  const setTrip = (patch: Partial<PlannerParams['trip']>) => setParams((p) => ({ ...p, trip: { ...p.trip, ...patch } }));
  const setConfig = (patch: Partial<GAConfig>) => setParams((p) => ({ ...p, config: { ...p.config, ...patch } }));

  async function submit() {
    if (!valid) return;
    const query = toQuery(params);
    router.replace(`/rencana?${query}`, { scroll: false });
    const result = await startRun(params);
    if (result) router.push(`/hasil?${query}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeading eyebrow="Rencana" title="Atur perjalananmu" />

      <Panel>
        <PanelTitle>Batasan</PanelTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Anggaran" note={rupiah(params.trip.budget || 0)} error={bad(tripCheck, 'budget')}>
            <NumberInput min={1} step={50000} value={params.trip.budget} onChange={(budget) => setTrip({ budget })} />
          </Field>
          <Field label="Orang" error={bad(tripCheck, 'people')}>
            <NumberInput min={1} value={params.trip.people} onChange={(people) => setTrip({ people })} />
          </Field>
          <Field label="Hari" error={bad(tripCheck, 'days')}>
            <NumberInput min={1} max={14} value={params.trip.days} onChange={(days) => setTrip({ days })} />
          </Field>
          <Field label="Jam per hari" note={`Total ${jam((params.trip.days || 0) * (params.trip.hoursPerDay || 0))}`} error={bad(tripCheck, 'hoursPerDay')}>
            <NumberInput min={1} max={24} step={0.5} value={params.trip.hoursPerDay} onChange={(hoursPerDay) => setTrip({ hoursPerDay })} />
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelTitle>Minat</PanelTitle>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {Object.entries(TAG_LABELS).map(([tag, label]) => {
            const w = params.trip.tagWeights[tag] ?? 0;
            return (
              <div key={tag} className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className={cn('tabular-nums', w > 0 ? 'font-semibold text-ugm-ink' : 'text-slate-400')}>{w.toFixed(1)}</span>
                </div>
                <Slider
                  value={[w]}
                  min={0}
                  max={1}
                  step={0.1}
                  aria-label={label}
                  onValueChange={(v) => setTrip({ tagWeights: { ...params.trip.tagWeights, [tag]: Array.isArray(v) ? (v[0] ?? 0) : (v as number) } })}
                />
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="p-0 md:p-0">
        <button type="button" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced} className="flex w-full items-center justify-between px-5 py-4 font-semibold text-ugm-ink md:px-6">
          Pengaturan GA
          <ChevronDown className={cn('size-4 text-slate-400 transition-transform', advanced && 'rotate-180')} />
        </button>
        {advanced && (
          <div className="grid grid-cols-2 gap-4 border-t px-5 py-5 md:grid-cols-3 md:px-6">
            <Field label="Populasi" error={bad(configCheck, 'populationSize')}>
              <NumberInput value={params.config.populationSize} onChange={(populationSize) => setConfig({ populationSize })} />
            </Field>
            <Field label="Generasi" error={bad(configCheck, 'maxGenerations')}>
              <NumberInput value={params.config.maxGenerations} onChange={(maxGenerations) => setConfig({ maxGenerations })} />
            </Field>
            <Field label="Elit" error={bad(configCheck, 'eliteCount')}>
              <NumberInput value={params.config.eliteCount} onChange={(eliteCount) => setConfig({ eliteCount })} />
            </Field>
            <Field label="Peluang crossover" error={bad(configCheck, 'crossoverRate')}>
              <NumberInput step={0.05} value={params.config.crossoverRate} onChange={(crossoverRate) => setConfig({ crossoverRate })} />
            </Field>
            <Field label="Peluang mutasi" error={bad(configCheck, 'mutationRate')}>
              <NumberInput step={0.01} value={params.config.mutationRate} onChange={(mutationRate) => setConfig({ mutationRate })} />
            </Field>
            <Field label="Stagnasi" error={bad(configCheck, 'stagnationLimit')}>
              <NumberInput value={params.config.stagnationLimit} onChange={(stagnationLimit) => setConfig({ stagnationLimit })} />
            </Field>
            <Field label="Seleksi">
              <select className={SELECT_CLASS} value={params.config.selection} onChange={(e) => setConfig({ selection: e.target.value as GAConfig['selection'] })}>
                <option value="tournament">Turnamen</option>
                <option value="roulette">Roulette</option>
              </select>
            </Field>
            <Field label="Crossover pilihan">
              <select className={SELECT_CLASS} value={params.config.maskCrossover} onChange={(e) => setConfig({ maskCrossover: e.target.value as GAConfig['maskCrossover'] })}>
                <option value="uniform">Uniform</option>
                <option value="onePoint">One-point</option>
              </select>
            </Field>
            <Field label="Seed" error={bad(configCheck, 'seed')}>
              <NumberInput value={params.config.seed} onChange={(seed) => setConfig({ seed })} />
            </Field>
          </div>
        )}
      </Panel>

      {(dataError || run.status === 'error') && <p className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-100">{dataError ?? run.error}</p>}

      {running ? (
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <RunProgress run={run} />
          </div>
          <button type="button" onClick={cancelRun} className={outlinePill} aria-label="Batalkan">
            <X className="size-4" /> Batal
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={goldPill} onClick={submit} disabled={!valid || !files}>
            {!files && <Loader2 className="size-4 animate-spin" />}
            Cari rencana <ArrowRight className="size-4" />
          </button>
          <button type="button" className={outlinePill} onClick={() => setParams(DEFAULT_PARAMS)}>
            <RotateCcw className="size-4" /> Reset
          </button>
        </div>
      )}
    </div>
  );
}
