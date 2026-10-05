import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, fmtCountdown, resolveAppearance } from '@/chart/appearance';

describe('aparência do gráfico', () => {
  it('automático segue o tema e as cores base', () => {
    const r = resolveAppearance(DEFAULT_APPEARANCE, true, '#089981', '#f23645');
    expect(r.background).toBe('#131722');
    expect(r.bodyUp).toBe('#089981');
    expect(r.wickDown).toBe('#f23645');
    expect(resolveAppearance(DEFAULT_APPEARANCE, false, '#0f0', '#f00').background).toBe('#ffffff');
  });
  it('cores escolhidas ganham ao automático; pavio e borda seguem o corpo', () => {
    const r = resolveAppearance({ ...DEFAULT_APPEARANCE, bodyUp: '#2962ff', background: 'rgba(0,0,0,0.5)' }, true, '#089981', '#f23645');
    expect(r.bodyUp).toBe('#2962ff');
    expect(r.wickUp).toBe('#2962ff');
    expect(r.borderUp).toBe('#2962ff');
    expect(r.background).toBe('rgba(0,0,0,0.5)');
  });
  it('contador até ao fecho da vela', () => {
    expect(fmtCountdown(65)).toBe('01:05');
    expect(fmtCountdown(3725)).toBe('01:02:05');
    expect(fmtCountdown(90061)).toBe('1d 01:01:01');
    expect(fmtCountdown(-3)).toBe('00:00');
  });
});
