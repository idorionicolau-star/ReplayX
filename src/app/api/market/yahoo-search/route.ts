import { NextResponse } from 'next/server';
import { UA } from '@/server/rss';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 40);
  if (!q) return NextResponse.json({ quotes: [] });
  try {
    const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`, { headers: { 'User-Agent': UA }, next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { quotes?: { symbol: string; shortname?: string; longname?: string; exchDisp?: string; quoteType?: string }[] };
    const quotes = (j.quotes ?? [])
      .filter((x) => x.symbol && ['EQUITY', 'ETF', 'INDEX', 'FUTURE', 'CURRENCY', 'CRYPTOCURRENCY', 'MUTUALFUND'].includes(x.quoteType ?? ''))
      .map((x) => ({ symbol: x.symbol, name: x.longname ?? x.shortname ?? x.symbol, exchange: x.exchDisp ?? '', type: x.quoteType ?? 'EQUITY' }));
    return NextResponse.json({ quotes }, { headers: { 'Cache-Control': 's-maxage=3600' } });
  } catch (e) {
    return NextResponse.json({ quotes: [], error: (e as Error).message });
  }
}
