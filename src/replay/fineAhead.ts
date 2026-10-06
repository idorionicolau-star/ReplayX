/** Barras finas a manter carregadas à frente do cursor enquanto há ordens ou posições abertas. */
export const FINE_AHEAD_BARS = 3000;
/** Primeiro carregamento ao abrir a ordem: cabe num único pedido de qualquer fornecedor. */
export const FINE_FIRST_BARS = 800;

export interface FineAheadInput {
  cursor: number;
  /** Duração, em segundos, de uma barra fina. */
  barSec: number;
  now: number;
  covered: (from: number, to: number) => boolean;
  ahead?: number;
}

/**
 * Dados finos a pedir em segundo plano para que os passos seguintes do replay não esperem pela rede.
 * Devolve null enquanto pelo menos metade da folga já estiver carregada.
 */
export function fineAheadPlan({ cursor, barSec, now, covered, ahead = FINE_AHEAD_BARS }: FineAheadInput): { from: number; to: number } | null {
  const end = Math.min(cursor + barSec * ahead, now + barSec);
  if (end <= cursor) return null;
  const half = cursor + (end - cursor) / 2;
  return covered(cursor, half) ? null : { from: cursor, to: end };
}
