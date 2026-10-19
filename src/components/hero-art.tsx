/**
 * Ilustrasi landing: satu kromosom (gen kuning = destinasi terpilih, angka = urutan kunjungan)
 * didekode menjadi rute perjalanan.
 */
const GENES = [null, 3, null, 1, 4, null, 2, null, 5, null];
const STOPS: [number, number][] = [
  [72, 332],
  [152, 246],
  [248, 300],
  [330, 222],
  [404, 296],
];
const ROUTE = 'M72 332C100 292 122 252 152 246S222 300 248 300S302 226 330 222S392 268 404 296';

export function HeroArt() {
  return (
    <div className="rounded-3xl bg-white/[0.04] p-4 ring-1 ring-white/10 md:p-6">
      <svg viewBox="0 0 460 380" className="h-auto w-full" role="img" aria-label="Kromosom didekode menjadi rute perjalanan">
        <defs>
          <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.2" fill="rgb(255 255 255 / 0.09)" />
          </pattern>
        </defs>

        <text x="24" y="30" fill="rgb(255 255 255 / 0.5)" fontSize="12" letterSpacing="1.5">
          KROMOSOM
        </text>
        {GENES.map((order, i) => {
          const x = 24 + i * 41.4;
          return (
            <g key={i}>
              <rect
                x={x}
                y={44}
                width={34}
                height={40}
                rx={10}
                fill={order ? '#f5c400' : 'transparent'}
                stroke={order ? 'none' : 'rgb(255 255 255 / 0.25)'}
                strokeWidth={1.5}
              />
              {order ? (
                <text x={x + 17} y={69} textAnchor="middle" fontSize="14" fontWeight="700" fill="#0c2a56">
                  {order}
                </text>
              ) : (
                <circle cx={x + 17} cy={64} r={2} fill="rgb(255 255 255 / 0.3)" />
              )}
            </g>
          );
        })}

        <g fill="rgb(255 255 255 / 0.4)" fontSize="12">
          <path d="M230 104v26m-6-7 6 7 6-7" stroke="rgb(255 255 255 / 0.4)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="246" y="124">dekode</text>
        </g>

        <text x="24" y="170" fill="rgb(255 255 255 / 0.5)" fontSize="12" letterSpacing="1.5">
          RUTE
        </text>
        <rect x="16" y="182" width="428" height="186" rx="18" fill="url(#dots)" />
        <path d={ROUTE} pathLength={1} className="route-draw" stroke="#f5c400" strokeWidth="3" fill="none" strokeLinecap="round" />
        {STOPS.map(([x, y], i) => (
          <g key={i} className="stop-pop" style={{ animationDelay: `${0.4 + i * 0.3}s` }}>
            <circle cx={x} cy={y} r={15} fill="#0c2a56" stroke="#f5c400" strokeWidth={2.5} />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#ffffff">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
