'use client';
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useSettings } from '@/store/settings';
import { resolveSymbol } from '@/core/symbols';
import { Segmented } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Field';
import { fmtTime } from '@/lib/format';
import { cn } from '@/components/ui/cn';

interface CalEvent {
  id: string;
  title: string;
  currency: string;
  time: number;
  impact: string;
  forecast: string;
  previous: string;
  actual: string;
}

const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY'];
const cache = new Map<string, { at: number; events: CalEvent[]; error?: string }>();

function ImpactBars({ impact }: { impact: string }) {
  const n = impact === 'high' ? 3 : impact === 'medium' ? 2 : impact === 'low' ? 1 : 0;
  const color = impact === 'high' ? 'bg-down' : impact === 'medium' ? 'bg-warn' : impact === 'low' ? 'bg-[#f5c518]' : 'bg-faint';
  return (
    <span className="flex items-end gap-[2px]" title={`Impacto: ${impact}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn('w-[3px] rounded-sm', i <= n ? color : 'bg-line')} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}

export function CalendarPanel() {
  const symbolId = useWorkspace((s) => s.charts[s.active]?.symbolId);
  const tz = useSettings((s) => s.timezone);
  const [week, setWeek] = useState<'this' | 'next'>('this');
  const [loaded, setLoaded] = useState<{ week: string; events: CalEvent[]; error?: string; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [impacts, setImpacts] = useState<Record<string, boolean>>({ high: true, medium: true, low: false, holiday: false });
  const [ccys, setCcys] = useState<string[]>([]);
  const [onlySymbol, setOnlySymbol] = useState(false);
  const [nonce, setNonce] = useState(0);

  const cached = cache.get(week);
  const fresh = cached && now * 1000 - cached.at < 30 * 60_000 && !nonce ? cached : null;
  const data = fresh ?? (loaded?.week === week ? loaded : null);
  const loading = !data;

  useEffect(() => {
    const c = cache.get(week);
    if (c && Date.now() - c.at < 30 * 60_000 && !nonce) return;
    let alive = true;
    fetch(`/api/calendar?week=${week}`)
      .then((r) => r.json() as Promise<{ events: CalEvent[]; error?: string }>)
      .then((j) => {
        const at = Date.now();
        cache.set(week, { at, ...j });
        if (alive) setLoaded({ week, at, ...j });
      })
      .catch(() => alive && setLoaded({ week, at: Date.now(), events: [], error: 'Calendário indisponível.' }));
    return () => {
      alive = false;
    };
  }, [week, nonce]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 60_000);
    return () => clearInterval(t);
  }, []);

  const sym = symbolId ? resolveSymbol(symbolId) : null;
  const symCcys = sym ? [sym.baseCurrency, sym.quoteCurrency].filter(Boolean).map((c) => (c === 'USDT' ? 'USD' : c === 'XAU' || c === 'XAG' ? 'USD' : c)) : [];

  const groups = useMemo(() => {
    const evs = (data?.events ?? []).filter((e) => {
      if (!impacts[e.impact] && !(e.impact !== 'high' && e.impact !== 'medium' && e.impact !== 'low' && impacts.holiday)) return false;
      if (ccys.length && !ccys.includes(e.currency)) return false;
      if (onlySymbol && symCcys.length && !symCcys.includes(e.currency)) return false;
      return true;
    });
    const map = new Map<string, CalEvent[]>();
    for (const e of evs) {
      const day = new Date(e.time * 1000).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz === 'local' ? undefined : tz });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    }
    return Array.from(map.entries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, impacts, ccys, onlySymbol, tz, symbolId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b border-line p-2">
        <div className="flex items-center gap-2">
          <Segmented
            value={week}
            onChange={setWeek}
            items={[
              { value: 'this', label: 'Esta semana' },
              { value: 'next', label: 'Próxima' },
            ]}
          />
          <div className="flex-1" />
          <button type="button" aria-label="Atualizar" onClick={() => setNonce((n) => n + 1)} className="rounded p-1.5 text-muted hover:bg-hover hover:text-text">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(['high', 'medium', 'low', 'holiday'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setImpacts((s) => ({ ...s, [k]: !s[k] }))} className={cn('h-6 rounded-full px-2 text-[11px]', impacts[k] ? 'bg-text text-bg' : 'bg-hover text-muted')}>
              {k === 'high' ? 'Alto' : k === 'medium' ? 'Médio' : k === 'low' ? 'Baixo' : 'Feriados'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {CCYS.map((c) => (
            <button key={c} type="button" onClick={() => setCcys((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))} className={cn('h-6 rounded px-1.5 text-[11px] font-semibold', ccys.includes(c) ? 'bg-accent text-white' : 'bg-hover text-muted')}>
              {c}
            </button>
          ))}
        </div>
        {symCcys.length > 0 && <Switch checked={onlySymbol} onChange={setOnlySymbol} label={<span className="text-xs text-muted">Só moedas de {sym?.name}</span>} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-10">
            <Spinner className="text-accent" />
          </div>
        )}
        {data?.error && <div className="px-4 py-6 text-center text-xs text-down">{data.error}</div>}
        {data && !data.error && !groups.length && <div className="px-4 py-8 text-center text-xs text-muted">Sem eventos com estes filtros.</div>}
        {groups.map(([day, evs]) => (
          <div key={day}>
            <div className="sticky top-0 z-10 bg-sunken px-3 py-1.5 text-[11px] font-semibold text-muted capitalize">{day}</div>
            {evs.map((e) => (
              <div key={e.id} className={cn('flex items-start gap-2 border-b border-line px-3 py-2 text-xs', e.time < now && 'opacity-60')}>
                <span className="w-11 shrink-0 text-muted tnum">{fmtTime(e.time, tz)}</span>
                <span className="w-9 shrink-0 font-semibold">{e.currency}</span>
                <span className="mt-0.5 shrink-0">
                  <ImpactBars impact={e.impact} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug">{e.title}</span>
                  {(e.actual || e.forecast || e.previous) && (
                    <span className="mt-0.5 flex gap-2 text-[11px] text-muted tnum">
                      {e.actual && <span className="text-text">Atual {e.actual}</span>}
                      {e.forecast && <span>Prev. {e.forecast}</span>}
                      {e.previous && <span>Ant. {e.previous}</span>}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-line px-3 py-1.5 text-[10px] text-muted">Fonte: Forex Factory. Horas no fuso escolhido nas definições.</div>
    </div>
  );
}
