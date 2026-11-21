/**
 * Marca do ReplayX: um quadrado preto de cantos cortados com um X branco em que a diagonal ascendente é uma seta de
 * tendência e a descendente se parte em dois (o retrocesso do replay). Só preto e branco: no tema escuro inverte-se.
 */
export function LogoMark({ size = 28, tone = 'auto' }: { size?: number; tone?: 'auto' | 'dark' | 'light' }) {
  // auto: preto no tema claro, branco no escuro (segue o texto); dark/light: fixo (abertura, ícones)
  const bg = tone === 'dark' ? '#000' : tone === 'light' ? '#fff' : 'var(--c-text)';
  const fg = tone === 'dark' ? '#fff' : tone === 'light' ? '#000' : 'var(--c-bg)';
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <path d="M0 0 H440 L512 72 V512 H72 L0 440 Z" fill={bg} />
      <g fill="none" stroke={fg} strokeWidth="40" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M142 142 L214 214 M298 298 L370 370" />
        <path d="M142 370 L356 156 M262 142 H370 V250" />
      </g>
    </svg>
  );
}

export function Logo({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <LogoMark size={size} />
      {withText && <span className="text-[15px] font-extrabold tracking-[0.28em] uppercase">ReplayX</span>}
    </span>
  );
}
