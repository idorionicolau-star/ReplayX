import type { SymbolInfo } from '@/core/types';

const COLORS: Record<string, string> = {
  synthetic: '#7e57c2',
  forex: '#2962ff',
  crypto: '#f7931a',
  commodities: '#c9a227',
  indices: '#089981',
  stocks: '#00897b',
  futures: '#e65100',
  demo: '#787b86',
};

function initials(s: SymbolInfo): string {
  if (s.assetClass === 'forex' && s.baseCurrency) return s.baseCurrency.slice(0, 2);
  if (s.assetClass === 'crypto' && s.baseCurrency) return s.baseCurrency.slice(0, 2);
  if (s.assetClass === 'commodities') return s.name.startsWith('XAU') ? 'Au' : s.name.startsWith('XAG') ? 'Ag' : s.name.slice(0, 2);
  if (s.assetClass === 'synthetic') {
    const m = /(\d+)/.exec(s.name);
    if (s.name.startsWith('Boom')) return 'B';
    if (s.name.startsWith('Crash')) return 'C';
    if (s.name.startsWith('Step')) return 'S';
    if (s.name.startsWith('Jump')) return 'J';
    return m ? m[1].slice(0, 3) : s.name.slice(0, 1);
  }
  return s.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
}

export function AssetIcon({ symbol, size = 18 }: { symbol: SymbolInfo; size?: number }) {
  const text = initials(symbol);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: COLORS[symbol.assetClass] ?? '#787b86', fontSize: Math.max(7, size * (text.length > 2 ? 0.36 : 0.45)) }}
    >
      {text}
    </span>
  );
}
