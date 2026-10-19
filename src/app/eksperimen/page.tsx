import { Suspense } from 'react';
import { ExperimentView } from '@/components/experiment-view';

export const metadata = { title: 'Eksperimen · Wisata Genetik' };

export default function EksperimenPage() {
  return (
    <Suspense>
      <ExperimentView />
    </Suspense>
  );
}
