import type { Bar } from './types';

/** Uma linha (faixa de preço) do perfil. */
export interface VpLevel {
  lo: number;
  hi: number;
  /** Volume das velas de subida e de descida que passaram por esta faixa. */
  up: number;
  down: number;
  total: number;
  /** Dentro da área de valor. */
  inVa: boolean;
}

export interface VpResult {
  levels: VpLevel[];
  /** Índice da linha de controlo (POC) em `levels` e o seu preço (meio da faixa). */
  pocIdx: number;
  poc: number;
  /** Topo e fundo da área de valor (VAH e VAL). */
  vah: number;
  val: number;
  /** Maior `total` (para escalar as barras). */
  max: number;
  totalVolume: number;
  /** 'volume' com volume real; 'tempo' quando os dados não trazem volume (cada vela vale 1: tempo passado em cada preço). */
  mode: 'volume' | 'tempo';
  lo: number;
  hi: number;
  from: number;
  to: number;
}

export interface VpOptions {
  /** Número de linhas do perfil. */
  rows: number;
  /** Fração do volume que forma a área de valor (0.7 = 70%). */
  valueArea: number;
  /** 'auto': volume se os dados o trazem, senão tempo. */
  mode?: 'auto' | 'volume' | 'tempo';
}

/**
 * Perfil de volume das velas `from`..`to` (inclusive). O volume de cada vela reparte-se igualmente pelas faixas de preço
 * que a vela atravessa (de mínimo a máximo) e conta como subida se fechou acima da abertura. A linha de controlo é a faixa
 * com mais volume; a área de valor cresce a partir dela, juntando de cada vez o par de faixas (acima ou abaixo) com mais volume,
 * até chegar à fração pedida do total.
 */
export function volumeProfile(bars: readonly Bar[], from: number, to: number, o: VpOptions): VpResult | null {
  const i0 = Math.max(0, Math.floor(from));
  const i1 = Math.min(bars.length - 1, Math.ceil(to));
  if (i1 < i0) return null;
  const rows = Math.max(2, Math.min(500, Math.round(o.rows)));
  let lo = Infinity;
  let hi = -Infinity;
  let withVolume = 0;
  for (let i = i0; i <= i1; i++) {
    const b = bars[i];
    if (b.low < lo) lo = b.low;
    if (b.high > hi) hi = b.high;
    if ((b.volume ?? 0) > 0) withVolume++;
  }
  if (!(hi > lo)) return null;
  const n = i1 - i0 + 1;
  const mode: 'volume' | 'tempo' = o.mode === 'volume' ? 'volume' : o.mode === 'tempo' ? 'tempo' : withVolume >= n * 0.5 ? 'volume' : 'tempo';
  const h = (hi - lo) / rows;
  const up = new Array<number>(rows).fill(0);
  const down = new Array<number>(rows).fill(0);
  let totalVolume = 0;
  for (let i = i0; i <= i1; i++) {
    const b = bars[i];
    const w = mode === 'volume' ? b.volume ?? 0 : 1;
    if (!(w > 0)) continue;
    const isUp = b.close >= b.open;
    const bl = Math.max(lo, b.low);
    const bh = Math.min(hi, b.high);
    const first = Math.min(rows - 1, Math.max(0, Math.floor((bl - lo) / h)));
    const last = Math.min(rows - 1, Math.max(0, Math.floor((bh - lo) / h - 1e-9)));
    totalVolume += w;
    if (bh - bl <= h * 1e-9) {
      (isUp ? up : down)[first] += w;
      continue;
    }
    const span = bh - bl;
    for (let r = first; r <= last; r++) {
      const rl = lo + r * h;
      const overlap = Math.min(bh, rl + h) - Math.max(bl, rl);
      if (overlap <= 0) continue;
      (isUp ? up : down)[r] += (w * overlap) / span;
    }
  }
  const total = up.map((v, r) => v + down[r]);
  let poc = 0;
  for (let r = 1; r < rows; r++) if (total[r] > total[poc]) poc = r;
  // área de valor: cresce a partir da linha de controlo
  const target = totalVolume * Math.min(0.99, Math.max(0.05, o.valueArea));
  let a = poc;
  let b = poc;
  let acc = total[poc];
  while (acc < target && (a > 0 || b < rows - 1)) {
    const upSum = (b + 1 < rows ? total[b + 1] : 0) + (b + 2 < rows ? total[b + 2] : 0);
    const downSum = (a - 1 >= 0 ? total[a - 1] : 0) + (a - 2 >= 0 ? total[a - 2] : 0);
    const goUp = b < rows - 1 && (a === 0 || upSum >= downSum);
    for (let k = 0; k < 2; k++) {
      if (goUp && b < rows - 1) {
        b++;
        acc += total[b];
      } else if (!goUp && a > 0) {
        a--;
        acc += total[a];
      }
    }
  }
  const levels: VpLevel[] = up.map((u, r) => ({ lo: lo + r * h, hi: lo + (r + 1) * h, up: u, down: down[r], total: total[r], inVa: r >= a && r <= b }));
  return {
    levels,
    pocIdx: poc,
    poc: lo + (poc + 0.5) * h,
    vah: lo + (b + 1) * h,
    val: lo + a * h,
    max: Math.max(...total),
    totalVolume,
    mode,
    lo,
    hi,
    from: i0,
    to: i1,
  };
}
