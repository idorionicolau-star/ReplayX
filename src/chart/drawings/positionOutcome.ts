export interface OutcomeBar {
  time: number;
  high: number;
  low: number;
  close: number;
}

/**
 * - `pending`: o preço ainda não tocou na entrada (a posição nem abriu);
 * - `missed`: o preço chegou ao alvo ou ao stop sem nunca tocar na entrada (não houve trade);
 * - `open`: a entrada foi tocada e nem o alvo nem o stop foram atingidos;
 * - `tp` / `sl`: depois de entrar, o alvo ou o stop foi atingido (se a mesma vela toca nos dois, conta o stop).
 */
export type PositionStatus = 'pending' | 'missed' | 'open' | 'tp' | 'sl';

export interface PositionOutcome {
  status: PositionStatus;
  /** Vela em que a entrada foi tocada. */
  fillTime: number | null;
  /** Última vela contada e o preço onde ficou (fecho, alvo ou stop). */
  endTime: number | null;
  endPrice: number;
}

/** Só conta a posição a partir do momento em que o preço toca na entrada, como numa ordem pendente. */
export function positionOutcome(bars: readonly OutcomeBar[], long: boolean, entry: number, stop: number, target: number): PositionOutcome {
  let fillTime: number | null = null;
  let endTime: number | null = null;
  let endPrice = entry;
  for (const b of bars) {
    const hitT = long ? b.high >= target : b.low <= target;
    const hitS = long ? b.low <= stop : b.high >= stop;
    if (fillTime === null) {
      if (b.low <= entry && entry <= b.high) fillTime = b.time;
      else {
        if (hitT || hitS) return { status: 'missed', fillTime: null, endTime: null, endPrice: entry };
        continue;
      }
    }
    endTime = b.time;
    if (hitS) return { status: 'sl', fillTime, endTime, endPrice: stop };
    if (hitT) return { status: 'tp', fillTime, endTime, endPrice: target };
    endPrice = b.close;
  }
  return { status: fillTime === null ? 'pending' : 'open', fillTime, endTime, endPrice };
}
