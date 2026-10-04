import { NextResponse } from 'next/server';
import { fetchText } from '@/server/rss';

export const runtime = 'nodejs';

interface FFEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

const URLS: Record<string, string> = {
  this: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  next: 'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
};

export async function GET(req: Request) {
  const week = new URL(req.url).searchParams.get('week') === 'next' ? 'next' : 'this';
  try {
    const raw = await fetchText(URLS[week], 12000, 1800);
    const list = JSON.parse(raw) as FFEvent[];
    const events = list.map((e, i) => ({
      id: `${week}-${i}`,
      title: e.title,
      currency: e.country,
      time: Math.floor(Date.parse(e.date) / 1000),
      impact: (e.impact || 'Low').toLowerCase(),
      forecast: e.forecast || '',
      previous: e.previous || '',
      actual: e.actual || '',
    }));
    return NextResponse.json({ events }, { headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600' } });
  } catch (e) {
    return NextResponse.json({ events: [], error: `Calendário indisponível (${(e as Error).message})` }, { status: 200 });
  }
}
