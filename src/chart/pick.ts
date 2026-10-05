import { create } from 'zustand';

/** Barra escolhida (início do replay) enquanto se arrasta a linha de corte no telemóvel. */
export const usePick = create<{ chartId: string | null; time: number | null }>(() => ({ chartId: null, time: null }));
