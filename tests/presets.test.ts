import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, resolveAppearance } from '@/chart/appearance';
import { CHART_PRESETS, findPreset, mirrorColors, presetFromLook, presetPatch } from '@/chart/presets';
import { contrastOf } from '@/chart/drawings/auto';
import { useSettings } from '@/store/settings';

const HEX = /^#[0-9a-f]{6}$/i;

describe('estilos pré-definidos do gráfico', () => {
  it('são 30, com ids únicos e, em cada um, versão clara e escura válidas', () => {
    expect(CHART_PRESETS).toHaveLength(30);
    expect(new Set(CHART_PRESETS.map((p) => p.id)).size).toBe(30);
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

describe('velas com gradiente', () => {
  it('5 dos 30 estilos têm gradiente, nos dois modos, com contorno na cor de baixo', () => {
    const grad = CHART_PRESETS.filter((p) => p.light.up2 && p.dark.up2);
    expect(grad).toHaveLength(5);
    for (const p of grad) {
      const a = presetPatch(p, false).appearance;
      expect(a.gradient).toBe(true);
      expect(a.bodyUp2).toBe(p.light.up2);
      expect(a.borderDown).toBe(p.light.down2);
      expect(a.showBorder).toBe(true);
    }
    expect(presetPatch(CHART_PRESETS[0], true).appearance.gradient).toBe(false);
  });
  it('a cor de baixo automática é a de cima mais escura', () => {
    const r = resolveAppearance({ ...DEFAULT_APPEARANCE, gradient: true }, true, '#26a69a', '#ef5350');
    expect(r.bodyUp2).not.toBe('#26a69a');
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(lum(r.bodyUp2)).toBeLessThan(lum('#26a69a'));
  });
  it('as 30 identidades têm cores de vela diferentes entre si (no modo claro)', () => {
    const pairs = new Set(CHART_PRESETS.map((p) => `${p.light.up}/${p.light.down}`));
    expect(pairs.size).toBeGreaterThanOrEqual(28);
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

describe('10 estilos de contraste (sem nude)', () => {
  it('existem, com velas que se distinguem bem entre si e do fundo', () => {
    const ids = ['red-gray', 'purple-gray', 'blue-gray', 'green-gray', 'orange-gray', 'red-white', 'gold-black', 'cyan-magenta', 'wine-cream', 'emerald-ruby'];
    for (const id of ids) {
      const p = CHART_PRESETS.find((x) => x.id === id);
      expect(p, id).toBeTruthy();
      for (const dark of [false, true]) {
        const c = dark ? p!.dark : p!.light;
        expect(contrastOf(c.up, c.down), `${id} ${dark}`).toBeGreaterThan(1.5);
      }
    }
  });
});

describe('temas guardados pelo utilizador', () => {
  it('guarda as cores atuais e cria a versão do outro modo, com fundo de luminosidade oposta', () => {
    const a = { ...DEFAULT_APPEARANCE, background: '#0b1026', textColor: '#aab6dd', gridHorz: 'rgba(255,255,255,0.05)', crosshair: '#5b6aa3' };
    const p = presetFromLook('t-x', 'Meu', true, '#00e5ff', '#ff2d95', a);
    expect(p.dark.up).toBe('#00e5ff');
    expect(p.dark.background).toBe('#0b1026');
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11;
    expect(lum(p.light.background!)).toBeGreaterThan(200);
    expect(lum(p.light.text!)).toBeLessThan(90);
    // velas continuam visíveis no fundo novo
    expect(contrastOf(p.light.up, p.light.background!)).toBeGreaterThanOrEqual(2.2);
    expect(contrastOf(p.light.down, p.light.background!)).toBeGreaterThanOrEqual(2.2);
  });
  it('fundo automático fica automático nos dois modos; branco passa a escuro', () => {
    expect(mirrorColors({ up: '#089981', down: '#f23645', background: null, grid: null, text: null, crosshair: null }, true).background).toBeNull();
    const m = mirrorColors({ up: '#ffffff', down: '#e0001b', background: '#ffffff', grid: 'rgba(0,0,0,0.06)', text: '#1a1a1a', crosshair: '#777777' }, true);
    expect(m.background).toMatch(/^#[0-3][0-9a-f]/i);
    expect(m.up).toBe('#ffffff');
  });
  it('o tema do utilizador segue o botão sol/lua e pode ser encontrado pelo id', () => {
    const p = presetFromLook('t-y', 'Meu 2', false, '#7b1fa2', '#9e9e9e', { ...DEFAULT_APPEARANCE, background: '#f7f4fb' });
    expect(findPreset('t-y', [p])).toBe(p);
    expect(findPreset('red-gray')?.id).toBe('red-gray');
    const st = useSettings.getState();
    const a = presetPatch(p, false);
    st.set({ theme: 'light', userPresets: [p], chartStyle: p.id, upColor: a.upColor, downColor: a.downColor, appearance: { ...st.appearance, ...a.appearance } });
    useSettings.getState().set({ theme: 'dark' });
    expect(useSettings.getState().appearance.background).toBe(p.dark.background);
    expect(useSettings.getState().chartStyle).toBe('t-y');
  });
});
