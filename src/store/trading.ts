import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cloneAccount, newAccount, type Account, type Fill, type Trade } from '@/core/trading/engine';
import type { ContractSpec } from '@/core/trading/engine';
import type { SymbolInfo } from '@/core/types';
import { pipSize, quoteToUsd, resolveSymbol } from '@/core/symbols';
import type { SpecData } from '@/core/strategy/types';
import { useSettings, type TradingSettings } from './settings';
import { uid } from '@/lib/uid';

export interface ReplaySession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  symbolId: string;
  tf: string;
  start: number;
  cursor: number;
  account: Account;
}

export interface ExecMarker {
  symbolId: string;
  time: number;
  price: number;
  side: 'long' | 'short';
  kind: 'entry' | 'exit';
  text: string;
  pnl?: number;
}

export interface TradingState {
  /** Conta da sessão de replay em curso. */
  replay: Account;
  /** Conta de paper trading em tempo real. */
  live: Account;
  sessionId: string | null;
  sessions: ReplaySession[];
  /** Execuções para desenhar no gráfico (setas de entrada/saída). */
  execs: { replay: ExecMarker[]; live: ExecMarker[] };
  updatedAt: number;

  /** `touch` marca alteração para a sincronização na nuvem (por omissão só na conta em tempo real). */
  setAccount: (mode: 'replay' | 'live', acc: Account, touch?: boolean) => void;
  resetAccount: (mode: 'replay' | 'live', initial?: number) => void;
  addExecs: (mode: 'replay' | 'live', fills: Fill[]) => void;
  setExecs: (mode: 'replay' | 'live', execs: ExecMarker[]) => void;
  updateTrade: (mode: 'replay' | 'live', id: string, patch: Partial<Trade>) => void;
  saveSession: (s: Omit<ReplaySession, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => string;
  deleteSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  setSessionId: (id: string | null) => void;
}

function execFromFill(f: Fill): ExecMarker {
  const buy = (f.kind === 'entry') === (f.side === 'long');
  return {
    symbolId: f.symbolId,
    time: f.time,
    price: f.price,
    side: f.side,
    kind: f.kind,
    text: f.kind === 'entry' ? (buy ? 'Compra' : 'Venda') : f.reason === 'tp' ? 'TP' : f.reason === 'sl' ? 'SL' : f.reason === 'trail' ? 'Trail' : 'Fecho',
    pnl: f.pnl,
  };
}

export const useTrading = create<TradingState>()(
  persist(
    (set) => ({
      replay: newAccount(10000),
      live: newAccount(10000),
      sessionId: null,
      sessions: [],
      execs: { replay: [], live: [] },
      updatedAt: 0,

      setAccount: (mode, acc, touch = mode === 'live') => set((s) => ({ ...s, [mode]: acc, ...(touch ? { updatedAt: Date.now() } : {}) })),
      resetAccount: (mode, initial) =>
        set((s) => ({
          ...s,
          [mode]: newAccount(initial ?? useSettings.getState().trading.initialBalance),
          execs: { ...s.execs, [mode]: [] },
          updatedAt: Date.now(),
        })),
      addExecs: (mode, fills) =>
        set((s) => ({ execs: { ...s.execs, [mode]: [...s.execs[mode], ...fills.map(execFromFill)].slice(-2000) } })),
      setExecs: (mode, execs) => set((s) => ({ execs: { ...s.execs, [mode]: execs } })),
      updateTrade: (mode, id, patch) =>
        set((s) => {
          const acc = cloneAccount(s[mode]);
          acc.trades = acc.trades.map((t) => (t.id === id ? { ...t, ...patch } : t));
          return { ...s, [mode]: acc, updatedAt: Date.now() };
        }),
      saveSession: (sess) => {
        const id = sess.id ?? uid('s');
        set((s) => {
          const existing = s.sessions.find((x) => x.id === id);
          const now = Date.now();
          const row: ReplaySession = existing
            ? { ...existing, ...sess, id, updatedAt: now, account: cloneAccount(sess.account) }
            : { ...sess, id, createdAt: now, updatedAt: now, account: cloneAccount(sess.account) };
          return { sessions: existing ? s.sessions.map((x) => (x.id === id ? row : x)) : [row, ...s.sessions].slice(0, 50), updatedAt: now };
        });
        return id;
      },
      deleteSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id), sessionId: s.sessionId === id ? null : s.sessionId, updatedAt: Date.now() })),
      renameSession: (id, name) => set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, name } : x)), updatedAt: Date.now() })),
      setSessionId: (sessionId) => set({ sessionId }),
    }),
    {
      name: 'rx-trading',
      version: 1,
      partialize: (s) =>
        ({
          replay: s.replay,
          live: s.live,
          sessionId: s.sessionId,
          sessions: s.sessions.map((x) => ({ ...x, account: { ...x.account, trades: x.account.trades.map((t) => ({ ...t, screenshot: undefined })) } })),
          execs: s.execs,
          updatedAt: s.updatedAt,
        }) as unknown as TradingState,
    },
  ),
);

export function specFor(sym: SymbolInfo, t: TradingSettings = useSettings.getState().trading): ContractSpec {
  const pip = pipSize(sym);
  return {
    contractSize: sym.contractSize ?? 1,
    toAccount: (p) => quoteToUsd(sym, p),
    spread: t.spreadPoints * pip,
    slippage: t.slippagePoints * pip,
    commission: t.commission,
  };
}

export function specData(sym: SymbolInfo, t: TradingSettings = useSettings.getState().trading): SpecData {
  const pip = pipSize(sym);
  const q = sym.quoteCurrency;
  const usdQuote = !q || ['USD', 'USDT', 'USDC', 'FDUSD'].includes(q);
  return {
    contractSize: sym.contractSize ?? 1,
    conversion: usdQuote ? 'none' : sym.baseCurrency === 'USD' ? 'inverse' : 'none',
    spread: t.spreadPoints * pip,
    slippage: t.slippagePoints * pip,
    commission: t.commission,
  };
}

export const specById = (symbolId: string) => specFor(resolveSymbol(symbolId));
