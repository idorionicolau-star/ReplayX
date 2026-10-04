'use client';
import { useSettings } from '@/store/settings';

let ctx: AudioContext | null = null;

/** Sons curtos gerados no navegador (sem ficheiros). */
export function playSound(kind: 'fill' | 'loss' | 'alert') {
  if (!useSettings.getState().sound || typeof window === 'undefined') return;
  try {
    ctx = ctx ?? new AudioContext();
    const notes = kind === 'fill' ? [880, 1320] : kind === 'loss' ? [440, 330] : [988, 784, 988];
    let t = ctx.currentTime;
    for (const f of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.15);
      t += 0.11;
    }
  } catch {
    /* sem áudio */
  }
}
