import { useId } from 'react';

/** Marca do ReplayX: um X em que a diagonal ascendente é uma seta de tendência. */
export function LogoMark({ size = 28, glyphScale = 1 }: { size?: number; glyphScale?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b5cff" />
          <stop offset="1" stopColor="#7b3ff2" />
        </linearGradient>
        <radialGradient id={`gl${id}`} cx=".25" cy=".15" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`up${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2dffc0" />
          <stop offset="1" stopColor="#22d3ff" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#bg${id})`} />
      <rect width="512" height="512" rx="116" fill={`url(#gl${id})`} />
      <g transform={`translate(256 256) scale(${glyphScale}) translate(-256 -256)`} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="56">
        <path d="M150 150 L220 220 M292 292 L362 362" stroke="#fff" />
        <path d="M150 362 L362 150 M290 150 H362 V222" stroke={`url(#up${id})`} />
      </g>
    </svg>
  );
}

export function Logo({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <LogoMark size={size} />
      {withText && (
        <span className="text-[17px] font-bold tracking-tight">
          Replay<span className="text-accent">X</span>
        </span>
      )}
    </span>
  );
}
