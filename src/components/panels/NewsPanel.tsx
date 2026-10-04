'use client';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Info } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { resolveSymbol } from '@/core/symbols';
import type { SymbolInfo } from '@/core/types';
import { Tabs } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/components/ui/cn';

interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  time: number;
  summary: string;
  image?: string;
  category: string;
}

type Tab = 'symbol' | 'forex' | 'crypto' | 'stocks' | 'commodities';

const cache = new Map<string, { at: number; items: NewsItem[] }>();

async function load(category: string, force = false): Promise<NewsItem[]> {
  const c = cache.get(category);
  if (!force && c && Date.now() - c.at < 5 * 60_000) return c.items;
  const res = await fetch(`/api/news?category=${category}`);
  const j = (await res.json()) as { items: NewsItem[] };
  cache.set(category, { at: Date.now(), items: j.items });
  return j.items;
}

const CCY_WORDS: Record<string, string[]> = {
  USD: ['usd', 'dollar', 'dólar', 'fed', 'fomc', 'powell', 'nfp', 'payrolls', 'cpi', 'treasury', 'us '],
  EUR: ['eur', 'euro', 'ecb', 'lagarde', 'eurozone'],
  GBP: ['gbp', 'pound', 'sterling', 'boe', 'bank of england', 'uk '],
  JPY: ['jpy', 'yen', 'boj', 'japan'],
  AUD: ['aud', 'aussie', 'rba', 'australia'],
  CAD: ['cad', 'loonie', 'boc', 'canada'],
  CHF: ['chf', 'franc', 'snb', 'swiss'],
  NZD: ['nzd', 'kiwi', 'rbnz', 'zealand'],
  XAU: ['gold', 'ouro', 'xau', 'bullion'],
  XAG: ['silver', 'prata', 'xag'],
};

function keywordsFor(s: SymbolInfo): string[] {
  const words = new Set<string>();
  [s.baseCurrency, s.quoteCurrency].forEach((c) => c && (CCY_WORDS[c] ?? [c.toLowerCase()]).forEach((w) => words.add(w)));
  if (s.assetClass === 'crypto' && s.baseCurrency) {
    words.add(s.baseCurrency.toLowerCase());
    const names: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'xrp', BNB: 'bnb', DOGE: 'dogecoin', ADA: 'cardano' };
    if (names[s.baseCurrency]) words.add(names[s.baseCurrency]);
  }
  if (s.assetClass === 'stocks' || s.assetClass === 'indices' || s.assetClass === 'futures') {
    s.description
      .toLowerCase()
      .split(/[\s,.()]+/)
      .filter((w) => w.length > 3 && !['inc', 'corp', 'index', 'average', 'industrial', 'futures'].includes(w))
      .forEach((w) => words.add(w));
    words.add(s.name.toLowerCase());
  }
  return Array.from(words);
}

function categoryFor(s: SymbolInfo): string {
  if (s.assetClass === 'crypto') return 'crypto';
  if (s.assetClass === 'stocks' || s.assetClass === 'indices' || s.assetClass === 'futures') return 'stocks';
  if (s.assetClass === 'commodities') return 'commodities,forex';
  return 'forex';
}

function ago(t: number): string {
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}

export function NewsPanel() {
  const symbolId = useWorkspace((s) => s.charts[s.active]?.symbolId);
  const sym = useMemo(() => (symbolId ? resolveSymbol(symbolId) : null), [symbolId]);
  const [tab, setTab] = useState<Tab>('symbol');
  const [nonce, setNonce] = useState(0);
  const category = tab === 'symbol' ? (sym ? categoryFor(sym) : 'forex') : tab;
  const key = `${category}|${nonce}`;
  const [result, setResult] = useState<{ key: string; items: NewsItem[]; error: string | null } | null>(null);
  const current = result?.key === key ? result : null;
  const items = useMemo(() => current?.items ?? result?.items ?? [], [current, result]);
  const error = current?.error ?? null;
  const loading = !current;

  useEffect(() => {
    let alive = true;
    load(category, nonce > 0)
      .then((r) => alive && setResult({ key, items: r, error: null }))
      .catch(() => alive && setResult({ key, items: [], error: 'Não foi possível carregar as notícias.' }));
    return () => {
      alive = false;
    };
  }, [category, nonce, key]);

  const shown = useMemo(() => {
    if (tab !== 'symbol' || !sym) return items;
    if (sym.assetClass === 'synthetic' || sym.assetClass === 'demo') return items;
    const kws = keywordsFor(sym);
    const hits = items.filter((n) => {
      const t = `${n.title} ${n.summary}`.toLowerCase();
      return kws.some((k) => t.includes(k));
    });
    return hits.length >= 3 ? hits : items;
  }, [items, tab, sym]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <Tabs
          size="sm"
          className="flex-1"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'symbol', label: sym ? sym.name : 'Símbolo' },
            { value: 'forex', label: 'Forex' },
            { value: 'crypto', label: 'Cripto' },
            { value: 'stocks', label: 'Ações' },
            { value: 'commodities', label: 'Matérias' },
          ]}
        />
        <button type="button" aria-label="Atualizar" onClick={() => setNonce((n) => n + 1)} className="rounded p-1.5 text-muted hover:bg-hover hover:text-text">
          <RefreshCw size={14} />
        </button>
      </div>
      {tab === 'symbol' && sym?.assetClass === 'synthetic' && (
        <div className="m-2 flex gap-2 rounded-md bg-accent-soft p-2.5 text-xs text-text">
          <Info size={15} className="mt-0.5 shrink-0 text-accent" />
          <span>Os índices sintéticos são gerados por um algoritmo e não reagem a notícias. Abaixo ficam as notícias gerais de mercado.</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !items.length && (
          <div className="flex justify-center py-10">
            <Spinner className="text-accent" />
          </div>
        )}
        {error && <div className="px-4 py-8 text-center text-xs text-down">{error}</div>}
        {!loading && !error && !shown.length && <div className="px-4 py-8 text-center text-xs text-muted">Sem notícias de momento.</div>}
        {shown.map((n) => (
          <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer" className="group flex gap-3 border-b border-line px-3 py-2.5 hover:bg-hover">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="font-semibold">{n.source}</span>
                <span>·</span>
                <span>{ago(n.time)}</span>
                <ExternalLink size={11} className="opacity-0 group-hover:opacity-100" />
              </div>
              <div className={cn('mt-0.5 text-[13px] leading-snug font-medium')}>{n.title}</div>
              {n.summary && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{n.summary}</div>}
            </div>
            {n.image && <img src={n.image} alt="" loading="lazy" className="h-14 w-20 shrink-0 rounded object-cover" />}
          </a>
        ))}
      </div>
    </div>
  );
}
