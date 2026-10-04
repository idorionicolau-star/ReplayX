'use client';
import { useEffect, useRef } from 'react';
import { AreaSeries, createChart, LineSeries, LineStyle, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { useSettings } from '@/store/settings';
import { fmtDateTime } from '@/lib/format';

/** Curva de capital (com linha de comparação opcional). */
export function EquityChart({ points, initial, compare, height = 180 }: { points: { time: number; value: number }[]; initial: number; compare?: { time: number; value: number }[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const dark = useSettings((s) => s.theme === 'dark');
  const tz = useSettings((s) => s.timezone);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: dark ? '#868993' : '#6a6d78', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? 'rgba(42,46,57,0.5)' : 'rgba(224,227,235,0.6)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      localization: { timeFormatter: (t: number) => fmtDateTime(t, tz), priceFormatter: (p: number) => p.toFixed(2) },
      crosshair: { horzLine: { labelBackgroundColor: '#2962ff' }, vertLine: { labelBackgroundColor: '#2962ff' } },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    const last = points[points.length - 1]?.value ?? initial;
    const up = last >= initial;
    const s = chart.addSeries(AreaSeries, {
      lineColor: up ? '#089981' : '#f23645',
      topColor: up ? 'rgba(8,153,129,0.3)' : 'rgba(242,54,69,0.3)',
      bottomColor: 'rgba(0,0,0,0)',
      lineWidth: 2,
      priceLineVisible: false,
    });
    const dedup = new Map<number, number>();
    for (const p of points) dedup.set(p.time, p.value);
    s.setData(Array.from(dedup.entries()).sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time: time as UTCTimestamp, value })));
    s.createPriceLine({ price: initial, color: dark ? '#50535e' : '#b2b5be', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: '' });
    if (compare && compare.length) {
      const c = chart.addSeries(LineSeries, { color: '#787b86', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false });
      const dd = new Map<number, number>();
      for (const p of compare) dd.set(p.time, p.value);
      c.setData(Array.from(dd.entries()).sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time: time as UTCTimestamp, value })));
    }
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points, initial, compare, dark, tz]);

  return <div ref={ref} style={{ height }} className="w-full" />;
}
