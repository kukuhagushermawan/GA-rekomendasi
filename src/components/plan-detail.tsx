'use client';

import dynamic from 'next/dynamic';
import { Panel, PanelTitle } from '@/components/panel';
import type { PlanView } from '@/ga/fitness';
import { cn, dayColor, jam, pukul, rupiah } from '@/lib/utils';

const RouteMap = dynamic(() => import('@/components/route-map').then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="h-[360px] animate-pulse rounded-xl bg-slate-100" />,
});

/** Nomor urut global dan jam tiba (hari dimulai 08.00). */
function withTimes(plan: PlanView) {
  let order = 0;
  return plan.days.map((day) => {
    let clock = 0;
    return {
      ...day,
      stops: day.stops.map((s) => {
        const arrive = clock + s.travelHours;
        clock = arrive + s.visitHours;
        return { ...s, order: ++order, arrive };
      }),
    };
  });
}

export function PlanDetail({ plan, people, budget }: { plan: PlanView; people: number; budget: number }) {
  const share = (x: number) => `${Math.max(0, Math.min(100, (x / budget) * 100))}%`;
  const rows: [string, number, string][] = [
    [`Tiket × ${people} orang`, plan.ticketCost, 'bg-ugm-ink'],
    [`Taksi · ${plan.distanceKm.toFixed(1)} km`, plan.transportCost, 'bg-ugm-gold'],
  ];
  return (
    <div className="space-y-4">
      <Panel className="space-y-3 p-3 md:p-3">
        <RouteMap plan={plan} height={380} />
        <div className="flex flex-wrap gap-3 px-1 text-xs text-slate-500">
          {plan.days.map((d) => (
            <span key={d.day} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: dayColor(d.day) }} /> Hari {d.day}
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <Panel>
          <PanelTitle>Biaya</PanelTitle>
          <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-slate-100">
            {rows.map(([label, value, color]) => (
              <div key={label} className={color} style={{ width: share(value) }} />
            ))}
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
            {rows.map(([label, value, color]) => (
              <div key={label} className="contents">
                <dt className="flex items-center gap-2 text-slate-500">
                  <span className={cn('size-2 rounded-full', color)} /> {label}
                </dt>
                <dd className="text-right tabular-nums">{rupiah(value)}</dd>
              </div>
            ))}
            <dt className="border-t pt-2 font-semibold">Total</dt>
            <dd className="border-t pt-2 text-right font-semibold tabular-nums">{rupiah(plan.totalCost)}</dd>
            <dt className="text-slate-500">Sisa anggaran</dt>
            <dd className={cn('text-right tabular-nums', plan.remainingBudget < 0 ? 'text-red-600' : 'text-slate-500')}>{rupiah(plan.remainingBudget)}</dd>
            <dt className="text-slate-500">Durasi</dt>
            <dd className="text-right tabular-nums text-slate-500">{jam(plan.totalHours)}</dd>
          </dl>
        </Panel>

        <Panel>
          <PanelTitle>Jadwal</PanelTitle>
          <div className="space-y-5">
            {withTimes(plan).map((day) => (
              <div key={day.day}>
                <p className="mb-2 text-sm font-semibold">
                  Hari {day.day} <span className={cn('font-normal text-slate-400', day.overLimit && 'text-red-600')}>· {jam(day.hours)}</span>
                </p>
                <ol className="space-y-3 border-l-2 pl-5" style={{ borderColor: dayColor(day.day) }}>
                  {day.stops.map((s) => (
                    <li key={s.id} className="relative">
                      <span
                        className="absolute top-0.5 -left-[31px] grid size-5 place-items-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: dayColor(day.day) }}
                      >
                        {s.order}
                      </span>
                      <p className="text-sm">
                        <span className="mr-2 tabular-nums text-slate-400">{pukul(s.arrive)}</span>
                        <span className="font-medium">{s.name}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {jam(s.visitHours, 2)} · {s.ticket > 0 ? `${rupiah(s.ticket)}/orang` : 'gratis'}
                        {s.travelHours > 0 && ` · ${Math.round(s.travelHours * 60)} mnt perjalanan`}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
