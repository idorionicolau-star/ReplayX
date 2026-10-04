import { NextResponse } from 'next/server';
import { FEEDS, fetchText, parseFeed, type NewsItem } from '@/server/rss';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cat = url.searchParams.get('category') ?? 'all';
  const cats = cat === 'all' ? Object.keys(FEEDS) : cat.split(',').filter((c) => c in FEEDS);
  const jobs: Promise<NewsItem[]>[] = [];
  const seen = new Set<string>();
  for (const c of cats) {
    for (const f of FEEDS[c]) {
      const key = `${c}|${f.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push(fetchText(f.url).then((xml) => parseFeed(xml, f.source, c)).catch(() => []));
    }
  }
  const results = (await Promise.all(jobs)).flat();
  const unique = new Map<string, NewsItem>();
  for (const n of results) {
    const k = n.title.toLowerCase().slice(0, 80);
    if (!unique.has(k)) unique.set(k, n);
  }
  const items = Array.from(unique.values())
    .sort((a, b) => b.time - a.time)
    .slice(0, 150);
  return NextResponse.json({ items, sources: jobs.length }, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900' } });
}
