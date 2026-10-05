'use client';
import { canAddIndicator } from '@/lib/billing';
import { useMemo, useState } from 'react';
import { Search, Code2, Plus } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { useStrategies } from '@/store/strategies';
import { INDICATORS } from '@/core/indicators/registry';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/components/ui/cn';
import { uid } from '@/lib/uid';
import { toast } from '@/components/ui/Toast';

const CATS = ['Todos', 'Médias móveis', 'Tendência', 'Osciladores', 'Volatilidade', 'Volume', 'Outros', 'Os meus scripts'] as const;

const EMPTY: never[] = [];

export function IndicatorsDialog() {
  const open = useUi((s) => s.indicators);
  const active = useWorkspace((s) => s.active);
  const current = useWorkspace((s) => s.charts[s.active]?.indicators) ?? EMPTY;
  const add = useWorkspace((s) => s.addIndicator);
  const update = useWorkspace((s) => s.updateChart);
  const scripts = useStrategies((s) => s.scripts);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<(typeof CATS)[number]>('Todos');
  const close = () => useUi.getState().set({ indicators: false });

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return INDICATORS.filter((d) => (cat === 'Todos' || d.category === cat) && (!t || `${d.name} ${d.short} ${d.description}`.toLowerCase().includes(t)));
  }, [q, cat]);

  const scriptList = scripts.filter((s) => (!q || s.name.toLowerCase().includes(q.toLowerCase())) && /indicator\s*\(/.test(s.code));

  return (
    <Dialog open={open} onClose={close} title="Indicadores" width={760} bodyClassName="p-0">
      <div className="flex h-[min(560px,70vh)] flex-col sm:flex-row">
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 sm:w-48 sm:flex-col sm:border-r sm:border-b-0">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn('h-8 shrink-0 rounded-md px-3 text-left text-[13px] whitespace-nowrap', cat === c ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-11 items-center gap-2 border-b border-line px-3">
            <Search size={16} className="text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar indicador" className="h-full flex-1 bg-transparent outline-none placeholder:text-faint" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {cat !== 'Os meus scripts' &&
              list.map((d) => {
                const count = current.filter((i) => i.type === d.id).length;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      if (!canAddIndicator(current.length)) return close();
                      add(d.id, active);
                      toast(`${d.name} adicionado`, { kind: 'success', duration: 1800 });
                    }}
                    className="flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-hover"
                    data-testid={`indicator-${d.id}`}
                  >
                    <span className="mt-0.5 w-16 shrink-0 text-xs font-semibold text-accent">{d.short}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px]">{d.name}</span>
                      <span className="block text-xs text-muted">{d.description}</span>
                    </span>
                    {count > 0 && <span className="rounded bg-accent-soft px-1.5 text-[11px] text-accent">{count}</span>}
                  </button>
                );
              })}
            {(cat === 'Os meus scripts' || (cat === 'Todos' && q)) && (
              <>
                {cat === 'Os meus scripts' && !scriptList.length && <div className="px-4 py-8 text-center text-xs text-muted">Ainda não tem scripts de indicador. Crie um no separador “Scripts” em baixo.</div>}
                {scriptList.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (!canAddIndicator(current.length)) return close();
                      update(active, { indicators: [...current, { uid: uid('si'), type: `script:${s.id}`, params: {}, styles: {} }] });
                      toast(`${s.name} adicionado`, { kind: 'success', duration: 1800 });
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover"
                  >
                    <Code2 size={16} className="text-accent" />
                    <span className="flex-1 text-[13px]">{s.name}</span>
                    <Plus size={14} className="text-muted" />
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
