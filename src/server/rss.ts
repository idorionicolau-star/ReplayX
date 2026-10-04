import { XMLParser } from 'fast-xml-parser';

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  time: number;
  summary: string;
  image?: string;
  category: string;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', processEntities: true, htmlEntities: true });

function text(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return text(o['#text'] ?? o['@_href'] ?? '');
  }
  return '';
}

export function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function linkOf(item: Record<string, unknown>): string {
  const l = item.link;
  if (Array.isArray(l)) {
    const alt = l.find((x) => typeof x === 'object' && (x as Record<string, unknown>)['@_rel'] !== 'self') ?? l[0];
    return text(alt);
  }
  if (l && typeof l === 'object') return text((l as Record<string, unknown>)['@_href'] ?? l);
  return text(l) || text(item.guid);
}

function imageOf(item: Record<string, unknown>): string | undefined {
  const cands = [item['media:content'], item['media:thumbnail'], item.enclosure, item['media:group']];
  for (const c of cands) {
    const arr = Array.isArray(c) ? c : [c];
    for (const x of arr) {
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        const url = o['@_url'] ?? (o['media:content'] as Record<string, unknown> | undefined)?.['@_url'];
        if (typeof url === 'string' && /^https?:/.test(url)) return url;
      }
    }
  }
  const html = text(item['content:encoded'] ?? item.description);
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m?.[1];
}

export function parseFeed(xml: string, source: string, category: string): NewsItem[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = (rss?.channel ?? (doc['rdf:RDF'] as Record<string, unknown> | undefined)) as Record<string, unknown> | undefined;
  const feed = doc.feed as Record<string, unknown> | undefined;
  let items: Record<string, unknown>[] = [];
  if (channel) {
    const it = channel.item ?? (doc['rdf:RDF'] as Record<string, unknown> | undefined)?.item;
    items = (Array.isArray(it) ? it : it ? [it] : []) as Record<string, unknown>[];
  } else if (feed) {
    const e = feed.entry;
    items = (Array.isArray(e) ? e : e ? [e] : []) as Record<string, unknown>[];
  }
  const out: NewsItem[] = [];
  for (const item of items.slice(0, 40)) {
    const title = stripHtml(text(item.title));
    const link = linkOf(item);
    if (!title || !link) continue;
    const date = text(item.pubDate ?? item.published ?? item.updated ?? item['dc:date']);
    const time = Math.floor((Date.parse(date) || Date.now()) / 1000);
    const summary = stripHtml(text(item.description ?? item.summary ?? item['content:encoded'] ?? '')).slice(0, 280);
    out.push({ id: link, title, link, source, time, summary, image: imageOf(item), category });
  }
  return out;
}

export const FEEDS: Record<string, { url: string; source: string }[]> = {
  forex: [
    { url: 'https://www.fxstreet.com/rss/news', source: 'FXStreet' },
    { url: 'https://investinglive.com/feed/', source: 'investingLive' },
    { url: 'https://www.forexlive.com/feed/news', source: 'ForexLive' },
    { url: 'https://www.investing.com/rss/news_1.rss', source: 'Investing.com' },
  ],
  crypto: [
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
    { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
    { url: 'https://decrypt.co/feed', source: 'Decrypt' },
  ],
  stocks: [
    { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch' },
    { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC' },
    { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance' },
  ],
  commodities: [
    { url: 'https://www.investing.com/rss/news_11.rss', source: 'Investing.com' },
    { url: 'https://www.fxstreet.com/rss/news', source: 'FXStreet' },
  ],
};

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export async function fetchText(url: string, timeoutMs = 9000, revalidate = 300): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, application/json, */*' }, next: { revalidate } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}
