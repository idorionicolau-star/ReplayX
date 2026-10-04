'use client';
import { useWorkspace } from '@/store/workspace';
import { ChartPane } from '@/components/chart/ChartPane';
import { cn } from '@/components/ui/cn';

export function ChartGrid() {
  const layout = useWorkspace((s) => s.layout);
  const charts = useWorkspace((s) => s.charts);
  const grid =
    layout === '2h'
      ? 'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1'
      : layout === '2v'
        ? 'grid-cols-1 grid-rows-2'
        : layout === '3'
          ? 'grid-cols-1 grid-rows-3 sm:grid-cols-2 sm:grid-rows-2'
          : layout === '4'
            ? 'grid-cols-2 grid-rows-2'
            : 'grid-cols-1 grid-rows-1';
  return (
    <div className={cn('grid h-full w-full gap-[2px] bg-line', grid)}>
      {charts.map((c, i) => (
        <div key={c.id} className={cn('min-h-0 min-w-0 bg-bg', layout === '3' && i === 0 && 'sm:row-span-2')}>
          <ChartPane index={i} />
        </div>
      ))}
    </div>
  );
}
