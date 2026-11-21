import { describe, expect, it } from 'vitest';
import { CHART_PRESETS, presetPatch } from '@/chart/presets';

describe('estilos pré-definidos do gráfico', () => {
  it('são 20 (10 + 10 nudes), com ids únicos e cores válidas', () => {
    expect(CHART_PRESETS).toHaveLength(20);
    expect(new Set(CHART_PRESETS.map((p) => p.id)).size).toBe(20);
    for (const p of CHART_PRESETS) {
      expect(p.up).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.down).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('o estilo limpa as cores individuais das velas', () => {
    const { appearance } = presetPatch(CHART_PRESETS[2]);
    expect(appearance.bodyUp).toBeNull();
    expect(appearance.showBorder).toBe(true);
  });
});
