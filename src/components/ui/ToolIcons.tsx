import type { ComponentType, ReactNode } from 'react';
import type { ToolId } from '@/chart/drawings/types';

/** Tom de destaque dos ícones: o próprio texto (preto no tema claro, branco no escuro), só mais claro. Sem cores. */
export const ICON_ACCENT = 'currentColor';

type IconProps = { size?: number; className?: string; strokeWidth?: number };
type Icon = ComponentType<IconProps>;

/** Base: traço fino, pontas retas e cantos vivos; tudo na cor do texto. */
function Base({ size = 18, className, strokeWidth = 1.5, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" className={className} aria-hidden>
      {children}
    </svg>
  );
}

/** Ponto-âncora da ferramenta: um quadradinho cheio. */
function Pt({ x, y, s = 3.4 }: { x: number; y: number; s?: number }) {
  return <rect x={x - s / 2} y={y - s / 2} width={s} height={s} fill="currentColor" stroke="none" />;
}

/** Traço secundário: a mesma cor, mais leve. */
const SOFT = { opacity: 0.5 } as const;
/** Enchimento leve das formas. */
const FILL = { fill: 'currentColor', fillOpacity: 0.1 } as const;

const make = (draw: () => ReactNode): Icon =>
  function ToolGlyph(props) {
    return <Base {...props}>{draw()}</Base>;
  };

export const ToolIconSet: Record<ToolId, Icon> = {
  cross: make(() => (
    <>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <Pt x={12} y={12} s={2.6} />
    </>
  )),
  cursor: make(() => <path d="M6 4l12.5 6.6-5.4 1.7-2.1 5.9z" fill="currentColor" strokeLinejoin="round" />),
  trendline: make(() => (
    <>
      <path d="M5.5 18.5L18.5 5.5" />
      <Pt x={4.5} y={19.5} />
      <Pt x={19.5} y={4.5} />
    </>
  )),
  ray: make(() => (
    <>
      <path d="M6 17.5L20.5 7.5" />
      <path d="M16.5 6.5H21v4.5" />
      <Pt x={4.5} y={18.5} />
    </>
  )),
  infoline: make(() => (
    <>
      <path d="M5 18L17 7" />
      <rect x={12.5} y={14} width={8.5} height={6} />
      <path d="M15 17h3.5" />
      <Pt x={4} y={19} />
    </>
  )),
  extended: make(() => (
    <>
      <path d="M2.5 20L21.5 4" />
      <Pt x={9} y={14.6} />
      <Pt x={15} y={9.4} />
    </>
  )),
  arrowline: make(() => (
    <>
      <path d="M4 20L18 6" />
      <path d="M20.5 3.5V12L12 3.5Z" fill="currentColor" stroke="none" />
    </>
  )),
  hline: make(() => (
    <>
      <path d="M2.5 12h19" />
      <Pt x={8} y={12} />
    </>
  )),
  hray: make(() => (
    <>
      <path d="M6 12h15" />
      <path d="M17.5 8.5L21 12l-3.5 3.5" />
      <Pt x={4.5} y={12} />
    </>
  )),
  vline: make(() => (
    <>
      <path d="M12 2.5v19" />
      <Pt x={12} y={8} />
    </>
  )),
  crossline: make(() => (
    <>
      <path d="M2.5 12h19M12 2.5v19" />
      <Pt x={12} y={12} s={4} />
    </>
  )),
  channel: make(() => (
    <>
      <path d="M3 13.5L15 4.5M9 20.5L21 11.5" />
      <path d="M6 17L18 8" strokeDasharray="2 2.6" {...SOFT} />
      <Pt x={15} y={4.5} />
      <Pt x={3} y={13.5} />
    </>
  )),
  fib: make(() => (
    <>
      <path d="M3 4.5h18M3 9.5h13M3 14.5h13M3 19.5h18" />
      <path d="M6 19.5L18 4.5" strokeDasharray="2 2.6" {...SOFT} />
      <Pt x={6} y={19.5} />
      <Pt x={18} y={4.5} />
    </>
  )),
  fibext: make(() => (
    <>
      <path d="M3 6h13M3 11.5h18M3 17h10" />
      <path d="M17 17.5h4" />
      <Pt x={19} y={6} />
    </>
  )),
  pitchfork: make(() => (
    <>
      <path d="M5 12h5M10 6v12M10 6h11M10 12h11M10 18h11" />
      <Pt x={4} y={12} />
    </>
  )),
  rect: make(() => (
    <>
      <rect x={4} y={6} width={16} height={12} {...FILL} />
      <Pt x={20} y={6} />
      <Pt x={4} y={18} />
    </>
  )),
  ellipse: make(() => (
    <>
      <ellipse cx={12} cy={12} rx={9} ry={6.3} {...FILL} />
      <Pt x={21} y={12} />
      <Pt x={3} y={12} />
    </>
  )),
  triangle: make(() => (
    <>
      <path d="M12 5L20.5 19h-17z" {...FILL} />
      <Pt x={12} y={5} />
    </>
  )),
  path: make(() => (
    <>
      <path d="M4 18l5-9 5 6 6-9" />
      <Pt x={4} y={18} />
      <Pt x={20} y={6} />
    </>
  )),
  brush: make(() => (
    <>
      <path d="M3 17c3-9 6-9 8-4s5 6 8-6" />
      <Pt x={20} y={7} />
    </>
  )),
  text: make(() => (
    <>
      <path d="M5.5 6h13M12 6v12" />
      <path d="M8.5 20h7" {...SOFT} />
    </>
  )),
  note: make(() => (
    <>
      <path d="M4 5h16v11h-8.5L7 20v-4H4z" />
      <path d="M8 9h8M8 12.5h4" />
      <Pt x={17} y={12.5} s={2.6} />
    </>
  )),
  pricelabel: make(() => (
    <>
      <path d="M3 7.5h13.5L21 12l-4.5 4.5H3z" />
      <Pt x={7.5} y={12} s={2.8} />
    </>
  )),
  arrowup: make(() => (
    <>
      <path d="M12 12.5V20" />
      <path d="M12 4L19.5 12.5h-15z" fill="currentColor" stroke="none" />
    </>
  )),
  arrowdown: make(() => (
    <>
      <path d="M12 11.5V4" />
      <path d="M12 20L19.5 11.5h-15z" fill="currentColor" stroke="none" />
    </>
  )),
  long: make(() => (
    <>
      <rect x={3.5} y={4} width={13} height={8} fill="currentColor" fillOpacity={0.22} />
      <rect x={3.5} y={12} width={13} height={6} strokeDasharray="2.4 2.2" {...SOFT} />
      <path d="M3.5 12h13" />
      <path d="M20 19.5V8M17.2 10.8L20 8l2.8 2.8" />
    </>
  )),
  short: make(() => (
    <>
      <rect x={3.5} y={6} width={13} height={6} strokeDasharray="2.4 2.2" {...SOFT} />
      <rect x={3.5} y={12} width={13} height={8} fill="currentColor" fillOpacity={0.22} />
      <path d="M3.5 12h13" />
      <path d="M20 4.5V16M17.2 13.2L20 16l2.8-2.8" />
    </>
  )),
  pricerange: make(() => (
    <>
      <path d="M12 3.5v17M8.5 7L12 3.5 15.5 7M8.5 17l3.5 3.5 3.5-3.5" />
      <Pt x={12} y={12} />
    </>
  )),
  daterange: make(() => (
    <>
      <path d="M3.5 12h17M7 8.5L3.5 12 7 15.5M17 8.5l3.5 3.5-3.5 3.5" />
      <Pt x={12} y={12} />
    </>
  )),
  vpfixed: make(() => (
    <>
      <path d="M3.5 4v16" />
      <path d="M3.5 6h9M3.5 9.5h14M3.5 13h7M3.5 16.5h11" strokeWidth={2.4} />
      <Pt x={20} y={12} />
    </>
  )),
  measure: make(() => (
    <>
      <path d="M4 16L16 4l4 4L8 20z" />
      <path d="M8.2 12.2l2 2M11.2 9.2l2 2M14.2 6.2l1.6 1.6" />
      <Pt x={19} y={5} s={3} />
    </>
  )),
};
