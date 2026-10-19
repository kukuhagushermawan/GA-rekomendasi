import { Suspense } from 'react';
import { ResultsView } from '@/components/results-view';

export const metadata = { title: 'Hasil · Wisata Genetik' };

export default function HasilPage() {
  return (
    <Suspense>
      <ResultsView />
    </Suspense>
  );
}
