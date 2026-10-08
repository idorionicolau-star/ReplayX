import type { Bar, SymbolInfo } from '../types';
import { aggregate } from '../bars';
import { tfSeconds, type Timeframe } from '../timeframes';
import type { FetchArgs } from './provider';
import { yahooProvider } from './yahoo';

/**
 * Passado extra do Yahoo para símbolos da Deriv com pouco histórico, só em H4 e diário.
 *
 * A Deriv dá poucas velas de Forex e metais nestes intervalos. Quando ela acaba, as velas mais antigas pedem-se ao
 * Yahoo e juntam-se antes das da Deriv. É uma ponte provisória: os preços do Yahoo podem diferir um pouco, e se o
 * Yahoo falhar ou não tiver o símbolo, fica só o que a Deriv deu.
 */

const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'SEK', 'NOK', 'PLN', 'ZAR', 'MXN', 'SGD', 'HKD', 'TRY', 'CNH', 'CNY']);
const METALS = new Set(['XAUUSD', 'XAGUSD']);

/** Código do Yahoo para um símbolo da Deriv (frxEURUSD → EURUSD=X), ou null se não houver equivalente fiável. */
export function yahooTickerFor(symbol: SymbolInfo): string | null {
  if (symbol.provider !== 'deriv') return null;
  const m = /^frx([A-Z]{6})$/.exec(symbol.ticker);
  if (!m) return null;
  const pair = m[1];
  if (METALS.has(pair)) return `${pair}=X`;
  return CURRENCIES.has(pair.slice(0, 3)) && CURRENCIES.has(pair.slice(3)) ? `${pair}=X` : null;
}

/** O passado extra só se pede em H4 e diário. */
export function fallbackEligible(tf: Timeframe): boolean {
  return tf.unit === 'D' ? tf.n === 1 : tfSeconds(tf) === 4 * 3600;
}

const HOUR: Timeframe = { n: 1, unit: 'h' };
const DAY: Timeframe = { n: 1, unit: 'D' };

/** Até `limit` velas do Yahoo, todas antes de `to`. Em H4 monta-as de velas de 1 hora. */
export async function fetchYahooBefore(symbol: SymbolInfo, tf: Timeframe, to: number, limit: number): Promise<Bar[]> {
  const ticker = yahooTickerFor(symbol);
  if (!ticker || limit <= 0) return [];
  const ys: SymbolInfo = { ...symbol, provider: 'yahoo', ticker, id: `YAHOO:${ticker}` };
  if (tf.unit === 'D') return (await yahooProvider.fetch(ys, DAY, { to, limit })).filter((b) => b.time < to);
  const hours = await yahooProvider.fetch(ys, HOUR, { to, limit: limit * 4 + 4 });
  const bars = aggregate(hours, tf).filter((b) => b.time + tfSeconds(tf) <= to);
  // o primeiro grupo pode estar incompleto
  return bars.length > 1 ? bars.slice(1).slice(-limit) : bars.slice(-limit);
}

/**
 * Se a Deriv devolveu menos velas do que as pedidas (acabou o histórico dela), completa com as mais antigas do Yahoo.
 * Nunca estoira: em caso de falha devolve só o que a Deriv deu.
 */
export async function extendWithYahoo(symbol: SymbolInfo, tf: Timeframe, args: FetchArgs, derivBars: Bar[]): Promise<Bar[]> {
  if (args.from !== undefined || !fallbackEligible(tf) || !yahooTickerFor(symbol)) return derivBars;
  if (derivBars.length >= args.limit) return derivBars;
  const to = derivBars.length ? derivBars[0].time : args.to;
  try {
    const extra = await fetchYahooBefore(symbol, tf, to, args.limit - derivBars.length);
    return extra.length ? [...extra, ...derivBars] : derivBars;
  } catch {
    return derivBars;
  }
}
