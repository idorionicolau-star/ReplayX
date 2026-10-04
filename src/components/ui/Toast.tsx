'use client';
import { create } from 'zustand';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { cn } from './cn';

type Kind = 'info' | 'success' | 'error' | 'warning';

interface ToastItem {
  id: number;
  kind: Kind;
  title: string;
  body?: string;
}

const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let seq = 1;

export function toast(title: string, opts: { kind?: Kind; body?: string; duration?: number } = {}) {
  const id = seq++;
  useToasts.setState((s) => ({ items: [...s.items.slice(-4), { id, kind: opts.kind ?? 'info', title, body: opts.body }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), opts.duration ?? 4000);
}

const ICON = { info: Info, success: CheckCircle2, error: XCircle, warning: AlertTriangle };
const COLOR = { info: 'text-accent', success: 'text-up', error: 'text-down', warning: 'text-warn' };

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2">
      {items.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div key={t.id} className="pointer-events-auto flex gap-3 rounded-lg border border-line bg-elev p-3 shadow-pop animate-pop">
            <Icon size={18} className={cn('mt-0.5 shrink-0', COLOR[t.kind])} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{t.title}</div>
              {t.body && <div className="mt-0.5 text-xs text-muted">{t.body}</div>}
            </div>
            <button type="button" aria-label="Fechar" className="text-muted hover:text-text" onClick={() => useToasts.setState((s) => ({ items: s.items.filter((x) => x.id !== t.id) }))}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
