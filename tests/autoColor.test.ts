import { describe, expect, it } from 'vitest';
import { AUTO, legible, resolveAuto } from '@/chart/drawings/auto';
import type { Drawing } from '@/chart/drawings/types';

const draw = (color: string, extra: Record<string, unknown> = {}): Drawing =>
  ({ id: 'a', type: 'trendline', points: [], style: { color, width: 1, dash: 0, ...extra } }) as unknown as Drawing;

describe('cores dos desenhos adaptadas ao fundo', () => {
  it('automático: branco no escuro, preto no claro', () => {
    expect(legible(AUTO, '#131722', true)).toBe('#ffffff');
    expect(legible(AUTO, '#ffffff', false)).toBe('#000000');
  });
  it('desenhos guardados com o azul padrão antigo também seguem o tema', () => {
    expect(legible('#2962ff', '#131722', true)).toBe('#ffffff');
    expect(legible('#2962ff', '#ffffff', false)).toBe('#000000');
  });
  it('branco sobre fundo claro e preto sobre fundo escuro invertem', () => {
    expect(legible('#ffffff', '#f4e4de', false)).toBe('#000000');
    expect(legible('#000000', '#0b0b0b', true)).toBe('#ffffff');
  });
  it('cor que se confunde com o fundo passa para a oposta (laranja sobre laranja → azulado)', () => {
    const c = legible('#e8943a', '#e8943a', false);
    expect(c).not.toBe('#e8943a');
  });
  it('cor já legível não muda', () => {
    expect(legible('#d32f2f', '#ffffff', false)).toBe('#d32f2f');
  });
  it('resolveAuto devolve o mesmo objeto quando nada muda e não toca no texto da nota', () => {
    const d = draw('#d32f2f');
    expect(resolveAuto(d, false, '#ffffff')).toBe(d);
    const n = { ...draw('#363a45', { textColor: '#ffffff' }), type: 'note' } as unknown as Drawing;
    expect(resolveAuto(n, false, '#ffffff').style.textColor).toBe('#ffffff');
  });
});
