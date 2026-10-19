import audit from '../../data/processed/audit.json';

/** Halaman sementara milestone 1: ringkasan dataset. Halaman Perencana dibangun di milestone 4. */
export default function Home() {
  const tags = Object.entries(audit.tagCounts).sort((a, b) => b[1] - a[1]);
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="border-l-4 border-ugm-gold pl-4">
        <p className="text-sm text-ugm-navy dark:text-ugm-gold">Algoritma Genetika (PACS262501)</p>
        <h1 className="text-3xl font-bold text-ugm-navy dark:text-white">Perencana Wisata Genetik</h1>
      </div>
      <p className="mt-6">
        Milestone 1: dataset Jakarta dari GA-pairwise-recommender-system sudah dimuat dan divalidasi —{' '}
        <strong>{audit.attractionCount} atraksi</strong>, matriks jarak &amp; durasi {audit.matrixSize}×{audit.matrixSize}.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {tags.map(([tag, count]) => (
          <li key={tag} className="rounded-full bg-ugm-gold-soft px-3 py-1 text-sm text-ugm-navy-dark">
            {tag} · {count}
          </li>
        ))}
      </ul>
    </main>
  );
}
