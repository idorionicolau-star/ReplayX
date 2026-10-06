import { describe, expect, it } from 'vitest';
import { wrapIndex } from '@/components/ui/WheelPicker';

describe('roda infinita', () => {
  it('índice circular nos dois sentidos', () => {
    expect(wrapIndex(5, 5)).toBe(0);
    expect(wrapIndex(6, 5)).toBe(1);
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(-6, 5)).toBe(4);
    expect(wrapIndex(0, 0)).toBe(0);
  });
});
