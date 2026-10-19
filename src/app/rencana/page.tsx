import { Suspense } from 'react';
import { PlannerForm } from '@/components/planner-form';

export const metadata = { title: 'Rencana · Wisata Genetik' };

export default function RencanaPage() {
  return (
    <Suspense>
      <PlannerForm />
    </Suspense>
  );
}
