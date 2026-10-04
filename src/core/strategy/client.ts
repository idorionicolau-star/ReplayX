import type { RunnerRequest, RunnerResponse } from './runner';

/** Cliente do worker de estratégias, com fallback para o thread principal. */

export interface RunOptions {
  onProgress?: (done: number, total: number, info?: string) => void;
  /** Tempo máximo (ms) antes de cancelar (protege contra ciclos infinitos em scripts). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class RunError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
  ) {
    super(message);
    this.name = 'RunError';
  }
}

type Pending = {
  resolve: (v: RunnerResponse) => void;
  reject: (e: Error) => void;
  onProgress?: RunOptions['onProgress'];
  timer?: ReturnType<typeof setTimeout>;
};

let worker: Worker | null = null;
let workerFailed = false;
let seq = 1;
const pending = new Map<number, Pending>();

function spawn(): Worker | null {
  if (workerFailed || typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data as { id: number; type: string; data?: RunnerResponse; message?: string; line?: number; done?: number; total?: number; info?: string };
      const p = pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') {
        p.onProgress?.(m.done ?? 0, m.total ?? 0, m.info);
        return;
      }
      pending.delete(m.id);
      if (p.timer) clearTimeout(p.timer);
      if (m.type === 'result') p.resolve(m.data as RunnerResponse);
      else p.reject(new RunError(m.message ?? 'Erro', m.line));
    };
    worker.onerror = (e) => {
      // falha ao carregar o worker: rejeita tudo e passa a usar o thread principal
      const err = new RunError(e.message || 'Falha no worker');
      for (const [id, p] of pending) {
        if (p.timer) clearTimeout(p.timer);
        p.reject(err);
        pending.delete(id);
      }
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

/** Mata o worker (ex.: script em ciclo infinito) e rejeita os pedidos pendentes. */
function restart(reason = 'Cancelado') {
  worker?.terminate();
  worker = null;
  for (const [id, p] of pending) {
    if (p.timer) clearTimeout(p.timer);
    p.reject(new RunError(reason));
    pending.delete(id);
  }
}

export async function runStrategy<T extends RunnerResponse>(req: RunnerRequest, opts: RunOptions = {}): Promise<T> {
  const w = spawn();
  if (!w) {
    const { handle } = await import('./runner');
    try {
      return (await handle(req, (d, t, i) => opts.onProgress?.(d, t, i))) as T;
    } catch (e) {
      throw new RunError((e as Error).message, (e as { line?: number }).line);
    }
  }
  const id = seq++;
  return new Promise<T>((resolve, reject) => {
    const p: Pending = { resolve: resolve as (v: RunnerResponse) => void, reject, onProgress: opts.onProgress };
    if (opts.timeoutMs) {
      p.timer = setTimeout(() => {
        pending.delete(id);
        restart();
        reject(new RunError(`O script demorou mais de ${Math.round(opts.timeoutMs! / 1000)} s (ciclo infinito?) e foi parado.`));
      }, opts.timeoutMs);
    }
    opts.signal?.addEventListener('abort', () => {
      if (!pending.has(id)) return;
      restart();
    });
    pending.set(id, p);
    w.postMessage({ id, req });
  });
}
