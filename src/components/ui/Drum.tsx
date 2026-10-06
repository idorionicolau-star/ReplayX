import type { CSSProperties, ReactNode } from 'react';
import { wrapIndex } from './wrapIndex';

export interface DrumProps<T> {
  items: T[];
  /** Posição contínua na lista (ex.: 3,4 = a meio caminho entre o item 3 e o 4). */
  pos: number;
  /** Altura de cada linha (px). */
  row: number;
  /** Linhas visíveis para cada lado do centro. */
  reach?: number;
  /** Ângulo entre linhas vizinhas (graus). */
  step?: number;
  /** Anima os movimentos (desligar enquanto o dedo arrasta). */
  smooth?: boolean;
  render: (item: T, rel: number) => ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Cilindro vertical que gira: cada item fica na superfície de um cilindro, inclina-se e esbate-se ao afastar-se do centro.
 * `pos` é contínua, por isso acompanha o dedo ao milímetro; ao soltar, a mudança de `pos` é animada (assenta com travagem suave).
 */
export function Drum<T>({ items, pos, row, reach = 2, step = 30, smooth = true, render, className, style }: DrumProps<T>) {
  const n = items.length;
  const radius = row / ((step * Math.PI) / 180);
  const from = Math.round(pos) - reach - 1;
  const ks: number[] = [];
  for (let k = from; k <= from + reach * 2 + 2; k++) ks.push(k);
  const tr = smooth ? 'transform 380ms cubic-bezier(0.18, 0.9, 0.25, 1), opacity 380ms ease-out' : 'none';
  return (
    <div className={className} style={{ perspective: row * 9, perspectiveOrigin: '50% 50%', overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `translateZ(${-radius}px)` }}>
        {n > 0 &&
          ks.map((k) => {
            const rel = k - pos;
            const deg = rel * step;
            const visible = Math.abs(deg) < 78;
            const opacity = visible ? Math.max(0.08, Math.cos((deg * Math.PI) / 180) ** 2) : 0;
            return (
              <div
                key={k}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '50%',
                  height: row,
                  marginTop: -row / 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backfaceVisibility: 'hidden',
                  transform: `rotateX(${-deg}deg) translateZ(${radius}px)`,
                  opacity,
                  transition: tr,
                }}
                data-rel={Math.round(rel)}
              >
                {render(items[wrapIndex(k, n)], rel)}
              </div>
            );
          })}
      </div>
    </div>
  );
}
