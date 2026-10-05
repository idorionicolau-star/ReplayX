'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const KEY = 'rx-splash';
const TOTAL_MS = 3600;

/** Velas do fundo (determinísticas): passeio aleatório com tendência de alta. */
function candles() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: { x: number; top: number; h: number; up: boolean; wick: number }[] = [];
  let price = 78;
  for (let i = 0; i < 30; i++) {
    const open = price;
    const close = price + (rnd() - 0.42) * 9 - 0.8;
    price = close;
    const hi = Math.max(open, close) + rnd() * 4;
    const lo = Math.min(open, close) - rnd() * 4;
    out.push({ x: 3 + i * 3.2, top: Math.min(open, close), h: Math.max(1.2, Math.abs(close - open)), up: close >= open, wick: hi - lo });
  }
  return out;
}

const BARS = candles();

/**
 * Animação de abertura: velas e curva a desenhar-se, o X da marca a formar-se, o nome a subir letra a letra e um
 * cursor de replay a varrer a linha do tempo. Mostra-se uma vez por sessão (toque para saltar).
 */
export function Splash() {
  const path = usePathname();
  const [gone, setGone] = useState(false);
  const active = path === '/' || path === '/terminal';

  useEffect(() => {
    if (!active) return;
    const hidden = document.documentElement.classList.contains('no-splash');
    if (hidden) return;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* sem armazenamento */
    }
    const t = setTimeout(() => setGone(true), TOTAL_MS);
    return () => clearTimeout(t);
  }, [active]);

  if (!active || gone) return null;
  const skip = () => setGone(true);
  const letters = 'Replay'.split('');

  return (
    <div className="rx-splash" onClick={skip} role="presentation" data-testid="splash">
      <svg className="rx-splash-bg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <g stroke="rgba(120,140,200,.10)" strokeWidth=".12">
          {[10, 25, 40, 55, 70, 85].map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} />
          ))}
          {[10, 30, 50, 70, 90].map((x) => (
            <line key={x} y1="0" y2="100" x1={x} x2={x} />
          ))}
        </g>
        {BARS.map((c, i) => (
          <g key={i} className="rx-candle" style={{ animationDelay: `${0.15 + i * 0.035}s`, transformOrigin: `${c.x}px 100px` }}>
            <rect x={c.x + 0.9} y={100 - c.top - c.h - (c.wick - c.h) / 2} width=".25" height={c.wick} fill={c.up ? '#2dffc0' : '#ff5470'} opacity=".5" />
            <rect x={c.x} y={100 - c.top - c.h} width="2.05" height={c.h} rx=".25" fill={c.up ? '#2dffc0' : '#ff5470'} opacity=".4" />
          </g>
        ))}
        <path className="rx-curve" pathLength="1" d="M0 80 C10 74 14 84 24 70 S40 62 48 56 S62 60 70 42 S88 30 100 18" fill="none" stroke="url(#rxcurve)" strokeWidth=".7" strokeLinecap="round" />
        <defs>
          <linearGradient id="rxcurve" x1="0" x2="1">
            <stop offset="0" stopColor="#2b5cff" />
            <stop offset="1" stopColor="#2dffc0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="rx-splash-center">
        <div className="rx-mark">
          <span className="rx-ring" />
          <svg viewBox="0 0 512 512" width="132" height="132" aria-hidden>
            <defs>
              <linearGradient id="rxbg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#2b5cff" />
                <stop offset="1" stopColor="#7b3ff2" />
              </linearGradient>
              <linearGradient id="rxup" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#2dffc0" />
                <stop offset="1" stopColor="#22d3ff" />
              </linearGradient>
            </defs>
            <rect className="rx-tile" width="512" height="512" rx="116" fill="url(#rxbg)" />
            <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="56">
              <path className="rx-s rx-s1" pathLength="1" d="M150 150 L220 220" stroke="#fff" />
              <path className="rx-s rx-s2" pathLength="1" d="M292 292 L362 362" stroke="#fff" />
              <path className="rx-s rx-s3" pathLength="1" d="M150 362 L362 150" stroke="url(#rxup)" />
              <path className="rx-s rx-s4" pathLength="1" d="M290 150 H362 V222" stroke="url(#rxup)" />
            </g>
          </svg>
        </div>
        <div className="rx-word" aria-label="ReplayX">
          {letters.map((l, i) => (
            <span key={i} className="rx-letter" style={{ animationDelay: `${1.25 + i * 0.06}s` }}>
              {l}
            </span>
          ))}
          <span className="rx-letter rx-x" style={{ animationDelay: `${1.25 + letters.length * 0.06}s` }}>
            X
          </span>
        </div>
        <div className="rx-tag">Pratique. Teste. Domine o mercado.</div>
        <div className="rx-track">
          <span className="rx-fill" />
          <span className="rx-head" />
        </div>
      </div>
    </div>
  );
}
