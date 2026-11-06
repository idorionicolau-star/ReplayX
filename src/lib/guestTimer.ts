'use client';
import { create } from 'zustand';
import { GUEST_DURATION_MS, getGuestRemainingMs, isGuestExpired } from './auth';

interface GuestTimerState {
  remainingMs: number;
  isExpired: boolean;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  tick: () => void;
}

export const useGuestTimer = create<GuestTimerState>((set) => ({
  remainingMs: GUEST_DURATION_MS,
  isExpired: false,
  dialogOpen: false,
  setDialogOpen: (open) => set({ dialogOpen: open }),
  tick: () => {
    const rem = getGuestRemainingMs();
    const exp = rem <= 0;
    set((state) => ({
      remainingMs: rem,
      isExpired: exp,
      dialogOpen: exp ? true : state.dialogOpen,
    }));
  },
}));

export function formatGuestTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
