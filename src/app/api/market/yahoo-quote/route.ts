import { NextResponse } from 'next/server';
import { UA } from '@/server/rss';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const symbols = (new URL(req.url).searchParams.get('symbols') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[\w.^=\-]{1,24}$/.test(s))
    .slice(0, 20);
  const out: Record<string, { price: number; changePct?: number; time: number }> = {};
  await Promise.all(
    symbols.map(async (s) => {
      try {
        const res = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=5m`, { headers: { 'User-Agent': UA }, cache: 'no-store' });
        if (!res.ok) return;
        const j = (await res.json()) as { chart: { result?: { meta: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; regularMarketTime?: number } }[] } };
        const m = j.chart.result?.[0]?.meta;
        if (!m?.regularMarketPrice) return;
        const prev = m.chartPreviousClose ?? m.previousClose;
        out[s] = { price: m.regularMarketPrice, changePct: prev ? ((m.regularMarketPrice - prev) / prev) * 100 : undefined, time: m.regularMarketTime ?? Math.floor(Date.now() / 1000) };
      } catch {
        /* ignora */
      }
    }),
  );
  return NextResponse.json(out, { headers: { 'Cache-Control': 's-maxage=20' } });
}
