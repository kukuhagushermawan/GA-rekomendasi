/**
 * Logo: heliks DNA (genetika) yang untai kuningnya sekaligus menjadi rute
 * zig-zag melewati tiga destinasi (titik) — kromosom yang berubah menjadi perjalanan.
 */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <g stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1.6" strokeLinecap="round">
        <line x1="8" y1="4" x2="24" y2="4" />
        <line x1="8" y1="16" x2="24" y2="16" />
        <line x1="8" y1="28" x2="24" y2="28" />
      </g>
      <path d="M24 4C24 10 8 10 8 16S24 22 24 28" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M8 4C8 10 24 10 24 16S8 22 8 28" stroke="#f5c400" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="8" cy="4" r="2.8" fill="#f5c400" />
      <circle cx="24" cy="16" r="2.8" fill="#f5c400" />
      <circle cx="8" cy="28" r="2.8" fill="#f5c400" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5 text-[17px] tracking-tight">
      <LogoMark />
      <span>
        <span className="font-semibold text-white">Wisata</span> <span className="font-medium text-ugm-gold">Genetik</span>
      </span>
    </span>
  );
}
