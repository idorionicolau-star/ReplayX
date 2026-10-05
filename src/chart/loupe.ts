/**
 * Lupa para desenhar com o dedo (como no MT5): mostra ampliada a zona debaixo do dedo, com uma mira no centro,
 * um pouco acima do dedo para não ficar tapada. Copia os canvases do gráfico (velas, desenhos e mira).
 */
const SIZE = 132;
const ZOOM = 2;
const GAP = 34;
const MARGIN = 8;

export type LoupePlace = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'follow';

export class Loupe {
  private readonly canvas: HTMLCanvasElement;
  private raf = 0;
  private at: { x: number; y: number } | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly place: () => LoupePlace = () => 'follow',
  ) {
    const c = document.createElement('canvas');
    c.setAttribute('data-testid', 'loupe');
    c.style.cssText = `position:absolute;width:${SIZE}px;height:${SIZE}px;pointer-events:none;z-index:30;display:none;border-radius:50%;box-shadow:0 6px 24px rgba(0,0,0,.45);`;
    container.appendChild(c);
    this.canvas = c;
  }

  get visible(): boolean {
    return this.at !== null;
  }

  /** Mostra a lupa no ponto (coordenadas de ecrã). Redesenha depois do próximo quadro do gráfico. */
  show(clientX: number, clientY: number) {
    this.at = { x: clientX, y: clientY };
    if (this.raf) return;
    // dois quadros: o gráfico desenha no próximo; a cópia vem a seguir
    this.raf = requestAnimationFrame(() => {
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.paint();
      });
    });
  }

  hide() {
    this.at = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas.style.display = 'none';
  }

  dispose() {
    this.hide();
    this.canvas.remove();
  }

  private paint() {
    const at = this.at;
    if (!at) return;
    const box = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const c = this.canvas;
    if (c.width !== SIZE * dpr) {
      c.width = SIZE * dpr;
      c.height = SIZE * dpr;
    }
    // posição: num canto fixo (por defeito em cima à direita) ou junto ao dedo
    const pos = this.place();
    let left: number;
    let top: number;
    if (pos === 'follow') {
      left = at.x - box.left - SIZE / 2;
      top = at.y - box.top - SIZE - GAP;
      if (top < 4) top = at.y - box.top + GAP;
    } else {
      const fx = at.x - box.left;
      const fy = at.y - box.top;
      let right = pos.endsWith('right');
      const bottom = pos.startsWith('bottom');
      left = right ? box.width - SIZE - MARGIN : MARGIN;
      top = bottom ? box.height - SIZE - MARGIN : MARGIN;
      // se o dedo está mesmo em cima da lupa, passa para o outro lado
      if (fx > left - 30 && fx < left + SIZE + 30 && fy > top - 30 && fy < top + SIZE + 30) {
        right = !right;
        left = right ? box.width - SIZE - MARGIN : MARGIN;
      }
    }
    left = Math.max(4, Math.min(box.width - SIZE - 4, left));
    top = Math.max(4, Math.min(box.height - SIZE - 4, top));
    c.style.left = `${left}px`;
    c.style.top = `${top}px`;
    c.style.display = 'block';

    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim() || '#131722';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // zona de origem (em px de ecrã) centrada no dedo
    const half = SIZE / ZOOM / 2;
    const sx0 = at.x - half;
    const sy0 = at.y - half;
    const sx1 = at.x + half;
    const sy1 = at.y + half;
    for (const src of Array.from(this.container.querySelectorAll('canvas'))) {
      if (src === c || src.width === 0) continue;
      const r = src.getBoundingClientRect();
      const ix0 = Math.max(sx0, r.left);
      const iy0 = Math.max(sy0, r.top);
      const ix1 = Math.min(sx1, r.right);
      const iy1 = Math.min(sy1, r.bottom);
      if (ix1 <= ix0 || iy1 <= iy0) continue;
      const kx = src.width / r.width;
      const ky = src.height / r.height;
      try {
        ctx.drawImage(src, (ix0 - r.left) * kx, (iy0 - r.top) * ky, (ix1 - ix0) * kx, (iy1 - iy0) * ky, (ix0 - sx0) * ZOOM, (iy0 - sy0) * ZOOM, (ix1 - ix0) * ZOOM, (iy1 - iy0) * ZOOM);
      } catch {
        /* canvas indisponível */
      }
    }

    // mira
    ctx.strokeStyle = '#2962ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, SIZE / 2 + 0.5);
    ctx.lineTo(SIZE, SIZE / 2 + 0.5);
    ctx.moveTo(SIZE / 2 + 0.5, 0);
    ctx.lineTo(SIZE / 2 + 0.5, SIZE);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#2962ff';
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2962ff';
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
}
