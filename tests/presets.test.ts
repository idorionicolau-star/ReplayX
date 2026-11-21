import { describe, expect, it } from 'vitest';
import { CHART_PRESETS, presetPatch } from '@/chart/presets';
import { contrastOf } from '@/chart/drawings/auto';
import { useSettings } from '@/store/settings';

const HEX = /^#[0-9a-f]{6}$/i;

describe('estilos pré-definidos do gráfico', () => {
  it('são 20, com ids únicos e, em cada um, versão clara e escura válidas', () => {
    expect(CHART_PRESETS).toHaveLength(20);
    expect(new Set(CHART_PRESETS.map((p) => p.id)).size).toBe(20);
    for (const p of CHART_PRESETS) for (const c of [p.light, p.dark]) {
      expect(c.up).toMatch(HEX);
      expect(c.down).toMatch(HEX);
    }
  });
  it('a versão clara tem fundo claro e a escura fundo escuro (quando definem fundo)', () => {
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11;
    for (const p of CHART_PRESETS) {
      if (p.light.background) expect(lum(p.light.background), p.id).toBeGreaterThan(150);
      if (p.dark.background) expect(lum(p.dark.background), p.id).toBeLessThan(70);
    }
  });
  it('o estilo limpa as cores individuais das velas', () => {
    const { appearance } = presetPatch(CHART_PRESETS[1], true);
    expect(appearance.bodyUp).toBeNull();
    expect(appearance.showBorder).toBe(true);
  });
});

describe('velas sempre visíveis', () => {
  it('velas brancas sobre fundo claro ganham contorno visível (borda e pavio)', () => {
    for (const id of ['mono', 'paper']) {
      const p = CHART_PRESETS.find((x) => x.id === id)!;
      const a = presetPatch(p, false).appearance;
      expect(a.showBorder, id).toBe(true);
      expect(a.borderUp, id).not.toBe('#ffffff');
      expect(a.borderUp, id).toBeTruthy();
      expect(a.wickUp, id).toBe(a.borderUp);
    }
  });
  it('nenhum estilo tem corpo igual ao fundo sem contorno', () => {
    for (const p of CHART_PRESETS) for (const dark of [false, true]) {
      const c = dark ? p.dark : p.light;
      const a = presetPatch(p, dark).appearance;
      const bg = c.background ?? (dark ? '#131722' : '#ffffff');
      const weak = contrastOf(c.up, bg) < 2.2 || contrastOf(c.down, bg) < 2.2;
      if (weak) expect(a.showBorder, `${p.id} ${dark ? 'escuro' : 'claro'}`).toBe(true);
    }
  });
});

describe('estilo dinâmico com o botão sol/lua', () => {
  it('trocar o tema troca a versão do estilo; mexer à mão nas cores deixa de seguir', () => {
    const cap = CHART_PRESETS.find((p) => p.id === 'nude-cappuccino')!;
    const st = useSettings.getState();
    const a = presetPatch(cap, true);
    st.set({ theme: 'dark', chartStyle: cap.id, upColor: a.upColor, downColor: a.downColor, appearance: { ...st.appearance, ...a.appearance } });
    expect(useSettings.getState().appearance.background).toBe(cap.dark.background);
    useSettings.getState().set({ theme: 'light' });
    expect(useSettings.getState().appearance.background).toBe(cap.light.background);
    expect(useSettings.getState().upColor).toBe(cap.light.up);
    useSettings.getState().set({ upColor: '#123456' });
    expect(useSettings.getState().chartStyle).toBeNull();
    useSettings.getState().set({ theme: 'dark' });
    expect(useSettings.getState().upColor).toBe('#123456');
  });
});

import { DEFAULT_APPEARANCE, resolveAppearance } from '@/chart/appearance';

describe('cores manuais das velas também ficam visíveis', () => {
  it('corpo branco sobre fundo claro ganha contorno e pavio na cor do texto', () => {
    const r = resolveAppearance({ ...DEFAULT_APPEARANCE, bodyUp: '#ffffff', background: '#ffffff' }, false, '#089981', '#f23645');
    expect(r.showBorder).toBe(true);
    expect(r.borderUp).toBe('#131722');
    expect(r.wickUp).toBe('#131722');
    expect(r.borderDown).toBe('#f23645');
  });
  it('corpo preto sobre fundo escuro também', () => {
    const r = resolveAppearance({ ...DEFAULT_APPEARANCE, bodyDown: '#000000' }, true, '#089981', '#f23645');
    expect(r.showBorder).toBe(true);
    expect(r.borderDown).toBe('#d1d4dc');
  });
  it('cores legíveis e bordas escolhidas à mão não mudam', () => {
    const r = resolveAppearance({ ...DEFAULT_APPEARANCE, bodyUp: '#ffffff', borderUp: '#ff0000', wickUp: '#ff0000', background: '#ffffff' }, false, '#089981', '#f23645');
    expect(r.borderUp).toBe('#ff0000');
    expect(r.wickUp).toBe('#ff0000');
    const n = resolveAppearance(DEFAULT_APPEARANCE, true, '#089981', '#f23645');
    expect(n.showBorder).toBe(false);
    expect(n.borderUp).toBe('#089981');
  });
});
