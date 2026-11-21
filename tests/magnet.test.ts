import { describe, expect, it } from 'vitest';
import { MAGNET_LEVELS, magnetBarReach, magnetLevel, magnetTitle, nextMagnet, type Magnet } from '@/core/magnet';

describe('íman: 5 níveis', () => {
  it('há cinco níveis, do mais fraco ao mais forte, cada um com mais alcance que o anterior', () => {
    expect(MAGNET_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < MAGNET_LEVELS.length; i++) expect(MAGNET_LEVELS[i].reachPx).toBeGreaterThan(MAGNET_LEVELS[i - 1].reachPx);
  });

  it('o fraco e o forte são os que já existiam (14 px e sempre), os do meio ficam entre eles', () => {
    expect(magnetLevel('weak')!.reachPx).toBe(14);
    expect(magnetLevel('strong')!.reachPx).toBe(Infinity);
    for (const id of ['light', 'medium', 'firm'] as const) {
      const px = magnetLevel(id)!.reachPx;
      expect(px).toBeGreaterThan(14);
      expect(px).toBeLessThan(Infinity);
    }
    expect(magnetLevel('off')).toBeNull();
  });

  it('o botão roda: desligado → 1 → 2 → 3 → 4 → 5 → desligado', () => {
    const seen: Magnet[] = [];
    let m: Magnet = 'off';
    for (let i = 0; i < 6; i++) {
      m = nextMagnet(m);
      seen.push(m);
    }
    expect(seen).toEqual(['weak', 'light', 'medium', 'firm', 'strong', 'off']);
  });

  it('o título diz o nível', () => {
    expect(magnetTitle('off')).toBe('Íman desligado');
    expect(magnetTitle('medium')).toMatch(/^Íman 3/);
    expect(magnetTitle('strong')).toMatch(/^Íman 5/);
  });

  it('o fraco e o forte só olham para a vela debaixo do cursor; os do meio olham para as vizinhas dentro do alcance', () => {
    expect(magnetBarReach('off', 8)).toBe(0);
    expect(magnetBarReach('weak', 8)).toBe(0);
    expect(magnetBarReach('strong', 8)).toBe(0);
    expect(magnetBarReach('light', 8)).toBe(4);
    expect(magnetBarReach('medium', 8)).toBe(6);
    expect(magnetBarReach('firm', 8)).toBe(10);
    // com zoom muito afastado há muitas velas no alcance: tem limite
    expect(magnetBarReach('firm', 0.5)).toBe(30);
  });
});
