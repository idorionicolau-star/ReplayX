'use client';
import { ChevronDown, ChevronUp, FlaskConical, Code2, Blocks, Sparkles, NotebookPen } from 'lucide-react';
import { useWorkspace, type BottomTab } from '@/store/workspace';
import { StrategyTester } from '@/components/strategy/StrategyTester';
import { ScriptEditor } from '@/components/strategy/ScriptEditor';
import { VisualBuilder } from '@/components/strategy/VisualBuilder';
import { Optimizer } from '@/components/strategy/Optimizer';
import { Journal } from '@/components/panels/Journal';
import { Resizer } from './Resizer';
import { cn } from '@/components/ui/cn';

export const BOTTOM_TABS: { id: BottomTab; label: string; icon: typeof Code2 }[] = [
  { id: 'journal', label: 'Diário', icon: NotebookPen },
  { id: 'tester', label: 'Testador de estratégias', icon: FlaskConical },
  { id: 'visual', label: 'Construtor visual', icon: Blocks },
  { id: 'script', label: 'Scripts', icon: Code2 },
  { id: 'optimizer', label: 'Otimizar / Aprender', icon: Sparkles },
];

export function BottomPanel() {
  const tab = useWorkspace((s) => s.bottomTab);
  const setTab = useWorkspace((s) => s.setBottomTab);
  const height = useWorkspace((s) => s.bottomHeight);
  const setHeight = useWorkspace((s) => s.setBottomHeight);
  return (
    <div className="flex shrink-0 flex-col">
      {tab && <Resizer direction="vertical" onResize={(d) => setHeight(height - d)} />}
      <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-t border-line bg-panel px-1.5 no-select">
        {BOTTOM_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(tab === t.id ? null : t.id)}
            className={cn('flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors', tab === t.id ? 'bg-hover font-medium text-text' : 'text-muted hover:bg-hover hover:text-text')}
            data-testid={`bottom-tab-${t.id}`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button type="button" aria-label={tab ? 'Recolher' : 'Expandir'} onClick={() => setTab(tab ? null : 'journal')} className="rounded p-1 text-muted hover:bg-hover hover:text-text">
          {tab ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {tab && (
        <div style={{ height }} className="min-h-0 overflow-hidden bg-panel">
          {tab === 'tester' && <StrategyTester />}
          {tab === 'script' && <ScriptEditor />}
          {tab === 'visual' && <VisualBuilder />}
          {tab === 'optimizer' && <Optimizer />}
          {tab === 'journal' && <Journal />}
        </div>
      )}
    </div>
  );
}
