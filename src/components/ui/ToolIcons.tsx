import type { ComponentType, ReactNode } from 'react';
import type { ToolId } from '@/chart/drawings/types';

/** Cor de acento da família de ícones (losangos = pontos-âncora das ferramentas). */
export const ICON_ACCENT = '#ff8a1f';

type IconProps = { size?: number; className?: string; strokeWidth?: number };
type Icon = ComponentType<IconProps>;

/** Base: traço grosso, pontas e junções redondas; o desenho usa a cor do texto e o acento fica laranja. */
function Base({ size = 18, className, strokeWidth = 1.9, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  );
}

/** Losango laranja: o ponto-âncora da ferramenta. */
function Dia({ x, y, r = 2.7 }: { x: number; y: number; r?: number }) {
  return <path d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} fill={ICON_ACCENT} stroke="none" />;
}

const A = { stroke: ICON_ACCENT };

const make = (draw: () => ReactNode): Icon =>
  function ToolGlyph(props) {
    return <Base {...props}>{draw()}</Base>;
  };

export const ToolIconSet: Record<ToolId, Icon> = {
  cross: make(() => (
    <>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <Dia x={12} y={12} />
    </>
  )),
  cursor: make(() => <path d="M6 4l12.5 6.6-5.4 1.7-2.1 5.9z" fill={ICON_ACCENT} />),
  trendline: make(() => (
    <>
      <path d="M5.5 18.5L17.5 6.5" />
      <rect x={2.6} y={17.2} width={3.2} height={3.2} rx={0.7} strokeWidth={1.6} />
      <Dia x={19} y={5} />
    </>
  )),
  ray: make(() => (
    <>
      <path d="M6 17L20 8" />
      <path d="M16 7.6L20.4 8l-2 3.8" />
      <Dia x={4.5} y={18} />
    </>
  )),
  infoline: make(() => (
    <>
      <path d="M4 18L16 8" />
      <rect x={12.5} y={14.5} width={8.5} height={6} rx={1.5} strokeWidth={1.6} />
      <path d="M15 17.5h3.5" strokeWidth={1.6} />
      <Dia x={4} y={18} r={2.3} />
    </>
  )),
  extended: make(() => (
    <>
      <path d="M2.5 20L21.5 4" />
      <Dia x={12} y={12} />
    </>
  )),
  arrowline: make(() => (
    <>
      <path d="M4 20L15 9" />
      <path d="M20.5 3.5V11.5L12.5 3.5Z" fill={ICON_ACCENT} stroke="none" />
    </>
  )),
  hline: make(() => (
    <>
      <path d="M3 12h18" />
      <Dia x={7} y={12} />
    </>
  )),
  hray: make(() => (
    <>
      <path d="M7 12h14" />
      <path d="M17.5 8.5L21 12l-3.5 3.5" />
      <Dia x={4.5} y={12} />
    </>
  )),
  vline: make(() => (
    <>
      <path d="M12 3v18" />
      <Dia x={12} y={8} />
    </>
  )),
  crossline: make(() => (
    <>
      <path d="M3 12h18M12 3v18" />
      <Dia x={12} y={12} r={3} />
    </>
  )),
  channel: make(() => (
    <>
      <path d="M3 13.5L14.5 4.5M9.5 20.5L21 11.5" />
      <path d="M6 17.5L17.5 8.5" {...A} strokeWidth={1.6} strokeDasharray="2 2.6" />
      <Dia x={14.5} y={4.5} r={2.3} />
    </>
  )),
  fib: make(() => (
    <>
      <path d="M3 4.5h18M3 9.5h12M3 14.5h12M3 19.5h18" strokeWidth={1.6} />
      <path d="M6 19.5L18 4.5" {...A} strokeDasharray="2 2.6" />
      <Dia x={6} y={19.5} r={2.3} />
      <Dia x={18} y={4.5} r={2.3} />
    </>
  )),
  fibext: make(() => (
    <>
      <path d="M3 6h13M3 11.5h18M3 17h10" strokeWidth={1.6} />
      <path d="M17 17.5h4" strokeWidth={1.6} />
      <Dia x={19} y={6} />
    </>
  )),
  pitchfork: make(() => (
    <>
      <path d="M5 12h5M10 6v12M10 6h11M10 12h11M10 18h11" />
      <Dia x={4} y={12} />
    </>
  )),
  rect: make(() => (
    <>
      <rect x={4} y={6} width={16} height={12} rx={2.2} fill={ICON_ACCENT} fillOpacity={0.14} />
      <Dia x={20} y={6} r={2.4} />
      <Dia x={4} y={18} r={2.4} />
    </>
  )),
  ellipse: make(() => (
    <>
      <ellipse cx={12} cy={12} rx={9} ry={6.3} fill={ICON_ACCENT} fillOpacity={0.14} />
      <Dia x={21} y={12} r={2.4} />
    </>
  )),
  triangle: make(() => (
    <>
      <path d="M12 5L20.5 19h-17z" fill={ICON_ACCENT} fillOpacity={0.14} />
      <Dia x={12} y={5} r={2.4} />
    </>
  )),
  path: make(() => (
    <>
      <path d="M4 18l5-9 5 6 6-9" />
      <Dia x={20} y={6} r={2.4} />
    </>
  )),
  brush: make(() => (
    <>
      <path d="M3 17c3-9 6-9 8-4s5 6 8-6" />
      <Dia x={20} y={7} r={2.4} />
    </>
  )),
  text: make(() => (
    <>
      <path d="M5.5 6h13M12 6v12" />
      <path d="M8.5 20h7" {...A} />
    </>
  )),
  note: make(() => (
    <>
      <path d="M4 5h16v11h-8.5L7 20v-4H4z" />
      <path d="M8 9h8M8 12.5h4" strokeWidth={1.6} />
      <Dia x={17} y={12.5} r={2} />
    </>
  )),
  pricelabel: make(() => (
    <>
      <path d="M3 7.5h13.5L21 12l-4.5 4.5H3z" />
      <Dia x={7.5} y={12} r={2.2} />
    </>
  )),
  arrowup: make(() => (
    <>
      <path d="M12 12.5V20" />
      <path d="M12 4L19.5 12.5h-15z" fill={ICON_ACCENT} stroke="none" />
    </>
  )),
  arrowdown: make(() => (
    <>
      <path d="M12 11.5V4" />
      <path d="M12 20L19.5 11.5h-15z" fill={ICON_ACCENT} stroke="none" />
    </>
  )),
  long: make(() => (
    <>
      <rect x={3.5} y={4} width={13} height={8} rx={1.6} fill={ICON_ACCENT} fillOpacity={0.3} {...A} strokeWidth={1.6} />
      <rect x={3.5} y={12} width={13} height={6} rx={1.6} strokeWidth={1.6} strokeDasharray="2.4 2.2" />
      <path d="M3.5 12h13" />
      <path d="M20 19.5V8M17.2 10.8L20 8l2.8 2.8" />
    </>
  )),
  short: make(() => (
    <>
      <rect x={3.5} y={6} width={13} height={6} rx={1.6} strokeWidth={1.6} strokeDasharray="2.4 2.2" />
      <rect x={3.5} y={12} width={13} height={8} rx={1.6} fill={ICON_ACCENT} fillOpacity={0.3} {...A} strokeWidth={1.6} />
      <path d="M3.5 12h13" />
      <path d="M20 4.5V16M17.2 13.2L20 16l2.8-2.8" />
    </>
  )),
  pricerange: make(() => (
    <>
      <path d="M12 3.5v17M8.5 7L12 3.5 15.5 7M8.5 17l3.5 3.5 3.5-3.5" />
      <Dia x={12} y={12} />
    </>
  )),
  daterange: make(() => (
    <>
      <path d="M3.5 12h17M7 8.5L3.5 12 7 15.5M17 8.5l3.5 3.5-3.5 3.5" />
      <Dia x={12} y={12} />
    </>
  )),
  measure: make(() => (
    <>
      <path d="M4 16L16 4l4 4L8 20z" />
      <path d="M8.2 12.2l2 2M11.2 9.2l2 2M14.2 6.2l1.6 1.6" strokeWidth={1.6} />
      <Dia x={19} y={5} r={2.2} />
    </>
  )),
};
