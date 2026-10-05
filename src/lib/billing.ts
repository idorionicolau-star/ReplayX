'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { entitlement, FEATURE_TEXT, FREE_LIMITS, freeReplayTfOk, type BillingDoc, type Entitlement, type ProFeature } from '@/core/plans';

interface BillingState {
  /** Documento `replayx_users/{uid}` (só o servidor o escreve). */
  doc: BillingDoc | null;
  /** Já se sabe o plano (para não cortar nada enquanto carrega). */
  loaded: boolean;
  /** Diálogo de upgrade aberto, com o motivo. */
  upgrade: { open: boolean; feature: ProFeature | null };
}

export const useBilling = create<BillingState>(() => ({ doc: null, loaded: false, upgrade: { open: false, feature: null } }));

/** Contagem diária de backtests do plano grátis (só neste dispositivo). */
const useUsage = create<{ day: string; backtests: number }>()(persist(() => ({ day: '', backtests: 0 }), { name: 'rx-usage' }));

let unsub: Unsubscribe | null = null;
let watching: string | null | undefined;

/** Acompanha o plano do utilizador. Convidados e falhas de leitura ficam no grátis (com o teste, se houver). */
export function startBilling(uid: string | null) {
  if (watching === uid) return;
  unsub?.();
  unsub = null;
  watching = uid;
  if (!uid) {
    useBilling.setState({ doc: null, loaded: true });
    return;
  }
  try {
    unsub = onSnapshot(
      doc(db(), `replayx_users/${uid}`),
      (s) => useBilling.setState({ doc: (s.data() as BillingDoc | undefined) ?? null, loaded: true }),
      () => useBilling.setState({ loaded: true }),
    );
  } catch {
    useBilling.setState({ loaded: true });
  }
}

export function currentEntitlement(): Entitlement {
  const user = useAuth.getState().user;
  return entitlement(user?.guest ? null : useBilling.getState().doc, user?.guest ? null : (user?.createdAt ?? null));
}

/** Plano atual (recalculado quando muda o documento ou o utilizador). */
export function usePlan(): Entitlement & { loaded: boolean } {
  const d = useBilling((s) => s.doc);
  const loaded = useBilling((s) => s.loaded);
  const user = useAuth((s) => s.user);
  const e = entitlement(user?.guest ? null : d, user?.guest ? null : (user?.createdAt ?? null));
  return { ...e, loaded };
}

export function isPro(): boolean {
  // enquanto não se sabe o plano não se bloqueia nada
  return !useBilling.getState().loaded || currentEntitlement().pro;
}

export function openUpgrade(feature: ProFeature | null = null) {
  useBilling.setState({ upgrade: { open: true, feature } });
}

export function closeUpgrade() {
  useBilling.setState({ upgrade: { open: false, feature: null } });
}

/** Se não for Pro, abre o diálogo de upgrade e devolve false. */
export function requirePro(feature: ProFeature): boolean {
  if (isPro()) return true;
  openUpgrade(feature);
  return false;
}

export function featureText(f: ProFeature | null): string | null {
  return f ? FEATURE_TEXT[f] : null;
}

/** Intervalo permitido no replay para o plano atual. */
export function replayTfAllowed(tf: string): boolean {
  return isPro() || freeReplayTfOk(tf);
}

export function canAddIndicator(current: number): boolean {
  if (current < FREE_LIMITS.indicatorsPerChart) return true;
  return requirePro('indicators');
}

const today = () => new Date().toISOString().slice(0, 10);

/** Conta um backtest; no grátis, recusa a partir do limite diário. */
export function consumeBacktest(): boolean {
  if (isPro()) return true;
  const u = useUsage.getState();
  const used = u.day === today() ? u.backtests : 0;
  if (used >= FREE_LIMITS.backtestsPerDay) {
    openUpgrade('backtests');
    return false;
  }
  useUsage.setState({ day: today(), backtests: used + 1 });
  return true;
}

export function backtestsLeftToday(): number {
  const u = useUsage.getState();
  return Math.max(0, FREE_LIMITS.backtestsPerDay - (u.day === today() ? u.backtests : 0));
}
