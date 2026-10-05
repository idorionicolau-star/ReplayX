import { useSettings } from '@/store/settings';

/** Vibração curta (Android/Chrome). Sem suporte (iOS, computador) não faz nada. */
export function vibrate(ms: number | number[] = 8) {
  try {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    if (!useSettings.getState().haptics) return;
    navigator.vibrate(ms);
  } catch {
    /* sem suporte */
  }
}
