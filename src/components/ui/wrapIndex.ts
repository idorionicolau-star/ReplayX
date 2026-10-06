/** Índice circular: depois do último vem o primeiro (e vice-versa). */
export const wrapIndex = (i: number, n: number) => (n > 0 ? ((i % n) + n) % n : 0);

/** Menor deslocamento (com sinal) para ir do índice `a` ao `b` numa lista circular de `n` itens. */
export function shortestDelta(a: number, b: number, n: number): number {
  if (n <= 0) return 0;
  let d = wrapIndex(b - a, n);
  if (d > n / 2) d -= n;
  return d;
}
