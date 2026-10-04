/// <reference lib="webworker" />
import { handle, type RunnerRequest } from './runner';
import { ScriptError } from './script';

/** Web Worker: corre scripts, backtests e otimizações sem bloquear o gráfico. */
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<{ id: number; req: RunnerRequest }>) => {
  const { id, req } = ev.data;
  let last = 0;
  try {
    const data = await handle(req, (done, total, info) => {
      const now = Date.now();
      if (now - last > 150 || done === total) {
        last = now;
        ctx.postMessage({ id, type: 'progress', done, total, info });
      }
    });
    ctx.postMessage({ id, type: 'result', data });
  } catch (e) {
    ctx.postMessage({ id, type: 'error', message: (e as Error)?.message ?? String(e), line: e instanceof ScriptError ? e.line : undefined });
  }
};
