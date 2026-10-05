'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star, X } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { allSymbols, ASSET_CLASS_LABEL, PROVIDER_LABEL } from '@/core/symbols';
import type { AssetClass, SymbolInfo } from '@/core/types';
import { binanceProvider } from '@/core/feed/binance';
import { yahooProvider } from '@/core/feed/yahoo';
import { loadDerivSymbols } from '@/core/feed/deriv';
import { AssetIcon } from '@/components/chart/AssetIcon';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/components/ui/cn';
import { toast } from '@/components/ui/Toast';
import { createPortal } from 'react-dom';

const TABS: { id: 'all' | AssetClass; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'synthetic', label: 'Sintéticos' },
  { id: 'forex', label: 'Forex' },
  { id: 'crypto', label: 'Cripto' },
  { id: 'commodities', label: 'Matérias-primas' },
  { id: 'indices', label: 'Índices' },
  { id: 'stocks', label: 'Ações' },
  { id: 'futures', label: 'Futuros' },
  { id: 'demo', label: 'Simulado' },
];

function score(s: SymbolInfo, q: string): number {
  if (!q) return 1;
  const t = q.toLowerCase();
  const name = s.name.toLowerCase();
  const tick = s.ticker.toLowerCase();
  const desc = s.description.toLowerCase();
  if (name === t || tick === t) return 100;
  if (name.startsWith(t) || tick.startsWith(t)) return 60;
  if (name.includes(t) || tick.includes(t)) return 40;
  if (desc.includes(t)) return 20;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => `${name} ${desc} ${tick}`.includes(w))) return 15;
  return 0;
}

export function SymbolSearch() {
  const open = useUi((s) => s.symbolSearch.open);
  if (!open || typeof document === 'undefined') return null;
  return <SymbolSearchDialog />;
}

function SymbolSearchDialog() {
  const { chart, initial, mode } = useUi((s) => s.symbolSearch);
  const setSymbol = useWorkspace((s) => s.setSymbol);
  const addToWatchlist = useWorkspace((s) => s.addToWatchlist);
  const watch = useWorkspace((s) => s.watchlists.find((w) => w.id === s.activeWatchlist));
  const recent = useWorkspace((s) => s.recent);
  const [q, setQRaw] = useState(initial);
  const [tab, setTabRaw] = useState<'all' | AssetClass>('all');
  const [remote, setRemote] = useState<SymbolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const [version, setVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setQ = (v: string) => {
    setQRaw(v);
    setSel(0);
  };
  const setTab = (v: 'all' | AssetClass) => {
    setTabRaw(v);
    setSel(0);
  };

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    loadDerivSymbols()
      .then(() => setVersion((v) => v + 1))
      .catch(() => undefined);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const jobs: Promise<SymbolInfo[]>[] = [];
      if (tab === 'all' || tab === 'crypto') jobs.push(binanceProvider.search!(query).catch(() => []));
      if (tab === 'all' || tab === 'stocks' || tab === 'indices' || tab === 'futures') jobs.push(yahooProvider.search!(query).catch(() => []));
      const res = (await Promise.all(jobs)).flat();
      if (alive) {
        setRemote(res);
        setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, tab]);

  const results = useMemo(() => {
    const query = q.trim();
    const pool = new Map<string, SymbolInfo>();
    for (const s of allSymbols()) pool.set(s.id, s);
    if (query.length >= 2) for (const s of remote) if (!pool.has(s.id)) pool.set(s.id, s);
    let list = Array.from(pool.values()).filter((s) => tab === 'all' || s.assetClass === tab);
    if (!query) {
      const rec = recent.map((id) => pool.get(id)).filter(Boolean) as SymbolInfo[];
      const rest = list.filter((s) => !recent.includes(s.id));
      list = [...rec.filter((s) => tab === 'all' || s.assetClass === tab), ...rest];
      return list.slice(0, 200);
    }
    return list
      .map((s) => ({ s, sc: score(s, query) }))
      .filter((x) => x.sc > 0)
      .sort((a, b) => b.sc - a.sc || a.s.name.localeCompare(b.s.name))
      .slice(0, 150)
      .map((x) => x.s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab, remote, recent, version]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const close = () => useUi.getState().set({ symbolSearch: { open: false, chart, initial: '', mode: 'set' } });
  const choose = (s: SymbolInfo) => {
    if (mode === 'watchlist') {
      const ws = useWorkspace.getState();
      const list = ws.watchlists.find((w) => w.id === ws.activeWatchlist) ?? ws.watchlists[0];
      if (list?.symbols.includes(s.id)) toast(`${s.name} já está na lista`, { kind: 'info' });
      else {
        addToWatchlist(s.id);
        toast(`${s.name} adicionado à lista`, { kind: 'success' });
      }
    } else setSymbol(s.id, chart);
    close();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 pt-[5vh] sm:p-6 sm:pt-[8vh]" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="flex h-[min(640px,85vh)] w-full max-w-[720px] flex-col overflow-hidden rounded-xl border border-line bg-elev shadow-pop animate-pop" role="dialog" aria-label="Procurar símbolo">
        <div className="flex h-12 items-center gap-2 border-b border-line px-4">
          <Search size={18} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === 'watchlist' ? 'Adicionar à lista: símbolo ou nome' : 'Símbolo, nome ou mercado (ex.: Volatility 75, EURUSD, BTC, ouro)'}
            className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
            data-testid="symbol-search-input"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((v) => Math.min(results.length - 1, v + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((v) => Math.max(0, v - 1));
              } else if (e.key === 'Enter' && results[sel]) choose(results[sel]);
              else if (e.key === 'Escape') close();
            }}
          />
          {loading && <Spinner size={14} className="text-muted" />}
          <button type="button" aria-label="Fechar" onClick={close} className="rounded-md p-1 text-muted hover:bg-hover hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn('h-7 shrink-0 rounded-full px-3 text-xs font-medium transition-colors', tab === t.id ? 'bg-text text-bg' : 'bg-hover text-text hover:brightness-95 dark:hover:brightness-125')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {!q && recent.length > 0 && <div className="px-4 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Recentes e populares</div>}
          {results.map((s, i) => {
            const inWatch = watch?.symbols.includes(s.id);
            return (
              <div
                key={s.id}
                data-idx={i}
                onMouseEnter={() => setSel(i)}
                onClick={() => choose(s)}
                className={cn('flex h-11 cursor-pointer items-center gap-3 px-4', i === sel ? 'bg-hover' : '')}
                data-testid={`symbol-row-${s.id}`}
              >
                <AssetIcon symbol={s} size={22} />
                <div className="w-[160px] shrink-0 truncate text-[13px] font-semibold">{s.name}</div>
                <div className="min-w-0 flex-1 truncate text-[13px] text-muted">{s.description}</div>
                <div className="hidden shrink-0 text-[11px] text-muted sm:block">{s.category ?? ASSET_CLASS_LABEL[s.assetClass]}</div>
                <div className="w-16 shrink-0 text-right text-[11px] font-semibold text-muted">{PROVIDER_LABEL[s.provider]}</div>
                <button
                  type="button"
                  aria-label="Adicionar à lista"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (inWatch) useWorkspace.getState().removeFromWatchlist(s.id);
                    else addToWatchlist(s.id);
                  }}
                  className={cn('rounded p-1', inWatch ? 'text-warn' : 'text-faint hover:text-text')}
                >
                  <Star size={15} fill={inWatch ? 'currentColor' : 'none'} />
                </button>
              </div>
            );
          })}
          {!results.length && !loading && <div className="px-4 py-10 text-center text-[13px] text-muted">Nenhum símbolo encontrado.</div>}
        </div>
        <div className="border-t border-line px-4 py-2 text-[11px] text-muted">↑ ↓ para navegar · Enter para escolher · cripto: todos os pares da Binance · ações/futuros: Yahoo Finance</div>
      </div>
    </div>,
    document.body,
  );
}
