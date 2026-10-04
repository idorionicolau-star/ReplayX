/** Pequeno barramento de eventos entre gráficos (sincronização da mira). */
type Listener<T> = (payload: T) => void;

export class Bus<T> {
  private listeners = new Set<Listener<T>>();
  on(l: Listener<T>): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(p: T) {
    this.listeners.forEach((l) => l(p));
  }
}

export interface CrosshairSync {
  source: string;
  symbolId: string;
  time: number | null;
  price: number | null;
}

export const crosshairBus = new Bus<CrosshairSync>();

/** Último gráfico com que o utilizador interagiu (para atalhos de teclado). */
export const focus = { chartId: '' };
