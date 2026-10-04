import { NextResponse } from 'next/server';
import { UA } from '@/server/rss';
import { alignTime } from '@/core/timeframes';

export const runtime = 'nodejs';

const INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']);
const SYMBOL_RE = /^[\w.^=\-]{1,24}$/;

interface YChart {
  chart: {
    result?: {
      meta: { gmtoffset?: number; currency?: string; priceHint?: number };
      timestamp?: number[];
      indicators: { quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const symbol = u.searchParams.get('symbol') ?? '';
  const interval = u.searchParams.get('interval') ?? '1d';
  const p1 = Number(u.searchParams.get('period1'));
  const p2 = Number(u.searchParams.get('period2'));
  if (!SYMBOL_RE.test(symbol) || !INTERVALS.has(interval) || !Number.isFinite(p1) || !Number.isFinite(p2)) {
    return NextResponse.json({ bars: [], error: 'Pedido inválido' }, { status: 400 });
  }
  const qs = `interval=${interval}&period1=${Math.floor(p1)}&period2=${Math.floor(p2)}&includePrePost=false&events=div%2Csplits`;
  let data: YChart | null = null;
  let lastErr = '';
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const res = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      data = (await res.json()) as YChart;
      break;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  if (!data) return NextResponse.json({ bars: [], error: `Yahoo Finance indisponível (${lastErr})` }, { status: 502 });
  const r = data.chart.result?.[0];
  if (!r || !r.timestamp) return NextResponse.json({ bars: [], error: data.chart.error?.description }, { status: 200 });
  const q = r.indicators.quote[0];
  const daily = interval === '1d' || interval === '5d' || interval === '1wk' || interval === '1mo' || interval === '3mo';
  const tf = interval === '1wk' ? '1W' : interval === '1mo' || interval === '3mo' ? '1M' : '1D';
  const off = r.meta.gmtoffset ?? 0;
  const bars = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i];
    const h = q.high[i];
    const l = q.low[i];
    const c = q.close[i];
    if (o === null || h === null || l === null || c === null || o === undefined) continue;
    const t = daily ? alignTime(r.timestamp[i] + off, tf) : r.timestamp[i];
    bars.push({ time: t, open: o, high: h, low: l, close: c, volume: q.volume[i] ?? 0 });
  }
  // remove duplicados (Yahoo repete a barra atual)
  const dedup = new Map<number, (typeof bars)[number]>();
  for (const b of bars) dedup.set(b.time, b);
  const out = Array.from(dedup.values()).sort((a, b) => a.time - b.time);
  const historical = p2 < Date.now() / 1000 - 86400;
  return NextResponse.json({ bars: out }, { headers: { 'Cache-Control': historical ? 's-maxage=86400' : 's-maxage=20, stale-while-revalidate=60' } });
}
