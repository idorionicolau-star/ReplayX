import { describe, expect, it } from 'vitest';
import { pauseDelayMs, saverReason, savedWatchRefresh } from '@/lib/dataSaver';

describe('poupança de dados', () => {
  it('manual: ligada ou desligada, seja qual for a ligação', () => {
    expect(saverReason('on', { effectiveType: '4g' })).toBe('manual');
    expect(saverReason('off', { saveData: true, effectiveType: '2g' })).toBeNull();
  });
  it('automática: liga quando o navegador pede poupança ou a ligação é lenta', () => {
    expect(saverReason('auto', { saveData: true })).toBe('browser');
    for (const t of ['slow-2g', '2g', '3g']) expect(saverReason('auto', { effectiveType: t })).toBe('slow');
    expect(saverReason('auto', { effectiveType: '4g' })).toBeNull();
    expect(saverReason('auto', undefined)).toBeNull(); // navegador sem a informação (Safari/Firefox): não liga sozinha
  });
  it('a lista de observação nunca atualiza abaixo de 15 s com a poupança, mas respeita o que já era mais lento', () => {
    expect(savedWatchRefresh(0, true)).toBe(15);
    expect(savedWatchRefresh(5, true)).toBe(15);
    expect(savedWatchRefresh(15, true)).toBe(15);
    expect(savedWatchRefresh(60, true)).toBe(60);
    expect(savedWatchRefresh(0, false)).toBe(0);
    expect(savedWatchRefresh(5, false)).toBe(5);
  });
  it('o tempo real pára mais cedo em segundo plano', () => {
    expect(pauseDelayMs(false)).toBe(30_000);
    expect(pauseDelayMs(true)).toBe(10_000);
  });
});
