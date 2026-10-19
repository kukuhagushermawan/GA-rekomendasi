import { Suspense } from 'react';
import { EvolutionView } from '@/components/evolution-view';

export const metadata = { title: 'Evolusi · Wisata Genetik' };

export default function EvolusiPage() {
  return (
    <Suspense>
      <EvolutionView />
    </Suspense>
  );
}
