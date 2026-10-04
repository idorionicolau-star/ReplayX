'use client';
import { useEffect } from 'react';
import { useUi } from '@/store/ui';

/** Mostra o intervalo que está a ser escrito (ex.: "15" → Enter = 15 minutos). */
export function TfQuickInput() {
  const v = useUi((s) => s.tfInput);
  useEffect(() => {
    if (v === null) return;
    const t = setTimeout(() => useUi.getState().set({ tfInput: null }), 4000);
    return () => clearTimeout(t);
  }, [v]);
  if (v === null) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div className="rounded-xl border border-line bg-elev px-6 py-4 text-center shadow-pop">
        <div className="text-3xl font-bold tnum">{v}</div>
        <div className="mt-1 text-xs text-muted">Enter = minutos · ou escreva h / D / W / M</div>
      </div>
    </div>
  );
}
