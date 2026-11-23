'use client';
import { useSyncExternalStore } from 'react';
import { useSettings } from '@/store/settings';

/** Poupança de dados: ligada à mão, desligada, ou automática (o navegador pede poupança ou a ligação é lenta). */
export type DataSaverSetting = 'auto' | 'on' | 'off';

interface Conn {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
}

const connection = (): Conn | undefined => (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: Conn }).connection);

/** Por que a poupança está ativa (null = não está). */
export function saverReason(setting: DataSaverSetting, conn: Pick<Conn, 'saveData' | 'effectiveType'> | undefined): 'manual' | 'browser' | 'slow' | null {
  if (setting === 'off') return null;
  if (setting === 'on') return 'manual';
  if (conn?.saveData) return 'browser';
  if (conn?.effectiveType && ['slow-2g', '2g', '3g'].includes(conn.effectiveType)) return 'slow';
  return null;
}

/** Intervalo da lista de observação (s) com a poupança: nunca abaixo de 15 s (tempo real e 5 s passam a 15). */
export function savedWatchRefresh(refresh: 0 | 5 | 15 | 60, saver: boolean): 0 | 5 | 15 | 60 {
  return saver && refresh < 15 ? 15 : refresh;
}

/** Segundos em segundo plano antes de parar o tempo real. */
export const pauseDelayMs = (saver: boolean): number => (saver ? 10_000 : 30_000);

export function currentSaverReason(): 'manual' | 'browser' | 'slow' | null {
  return saverReason(useSettings.getState().dataSaver, connection());
}

export const isDataSaver = (): boolean => currentSaverReason() !== null;

/** Para a interface: muda quando a opção ou a ligação mudam. */
export function useSaverReason(): 'manual' | 'browser' | 'slow' | null {
  const setting = useSettings((s) => s.dataSaver);
  const saveData = useSyncExternalStore(
    (cb) => {
      const c = connection();
      c?.addEventListener?.('change', cb);
      return () => c?.removeEventListener?.('change', cb);
    },
    () => `${connection()?.saveData ? 1 : 0}|${connection()?.effectiveType ?? ''}`,
    () => '0|',
  );
  const [sd, et] = saveData.split('|');
  return saverReason(setting, { saveData: sd === '1', effectiveType: et || undefined });
}
