'use client';

import type { PlanView } from '@/ga/fitness';
import { cn, jam, persen, rupiah } from '@/lib/utils';

export function ValidBadge({ valid }: { valid: boolean }) {
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide', valid ? 'bg-ugm-ink text-white' : 'bg-ugm-gold text-red-700')}>
      {valid ? 'VALID' : 'TIDAK VALID'}
    </span>
  );
}

export function PlanCard({ plan, selected, onSelect }: { plan: PlanView; selected: boolean; onSelect: () => void }) {
  const stops = plan.days.reduce((n, d) => n + d.stops.length, 0);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl bg-white p-4 text-left text-slate-900 transition',
        selected ? 'ring-4 ring-ugm-gold' : 'opacity-85 hover:opacity-100',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">Rencana {plan.rank}</span>
        <ValidBadge valid={plan.valid} />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-ugm-ink">{rupiah(plan.totalCost)}</p>
      <p className="text-sm text-slate-500">
        {jam(plan.totalHours)} · {stops} tempat · {plan.days.length} hari
        {plan.preference > 0 && ` · minat ${persen(plan.preference)}`}
      </p>
      {plan.issues.length > 0 && <p className="mt-1 text-xs text-red-600">{plan.issues[0]}</p>}
    </button>
  );
}
