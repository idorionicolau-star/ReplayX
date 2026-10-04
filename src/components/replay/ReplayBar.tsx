'use client';
import { useRef, useState } from 'react';
import { ChevronDown, Pause, Play, SkipBack, SkipForward, X, Save, CalendarDays, Shuffle, MousePointerClick, Gauge, Clock3, PauseCircle } from 'lucide-react';
import { replay, SPEEDS, useReplay } from '@/replay/engine';
import { useWorkspace } from '@/store/workspace';
import { useSettings } from '@/store/settings';
import { useTrading, specFor } from '@/store/trading';
import { useUi } from '@/store/ui';
import { resolveSymbol } from '@/core/symbols';
import { unrealized } from '@/core/trading/engine';
import { tfLabel, tfShort, STANDARD_TFS } from '@/core/timeframes';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { submitOrder } from '@/trading/actions';
import { Popover } from '@/components/ui/Popover';
import { MenuHeader, MenuItem, MenuList, MenuSeparator } from '@/components/ui/Menu';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';

function Btn({ label, onClick, children, disabled, className, testid }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; className?: string; testid?: string }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} data-testid={testid} className={cn('flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-[13px] hover:bg-hover', className)}>
      {children}
    </button>
  );
}

export function ReplayBar() {
  const st = useReplay();
  const cfg = useWorkspace((s) => s.charts[s.active]);
  const tz = useSettings((s) => s.timezone);
  const defaultQty = useSettings((s) => s.trading.defaultQty);
  const acc = useTrading((s) => s.replay);
  const selRef = useRef<HTMLButtonElement>(null);
  const speedRef = useRef<HTMLButtonElement>(null);
  const stepRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<'select' | 'speed' | 'step' | null>(null);

  if (!st.active || st.selecting || st.cursor === null || !cfg) return null;
  const sym = resolveSymbol(cfg.symbolId);
  const open = acc.positions.reduce((a, p) => {
    const px = st.prices[p.symbolId];
    return a + (px === undefined ? 0 : unrealized(p, px, specFor(resolveSymbol(p.symbolId))));
  }, 0);
  const realized = acc.balance - acc.initial;
  const speed = SPEEDS.find((s) => s.ms === st.speedMs) ?? SPEEDS[3];
  const stepTf = st.stepTf;

  const quick = (side: 'long' | 'short') => {
    submitOrder({ symbolId: cfg.symbolId, side, type: 'market', qty: defaultQty });
  };

  return (
    <div className="pointer-events-none absolute right-0 bottom-[38px] left-0 z-30 flex justify-center px-2">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-elev/97 px-1.5 py-1 shadow-pop no-select" data-testid="replay-bar">
        <button ref={selRef} type="button" onClick={() => setMenu(menu === 'select' ? null : 'select')} className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] hover:bg-hover" title="Escolher ponto de partida">
          <MousePointerClick size={16} className="text-accent" />
          <span className="hidden md:inline">Selecionar</span>
          <ChevronDown size={13} />
        </button>
        <Popover anchor={selRef} open={menu === 'select'} onClose={() => setMenu(null)} placement="top-start">
          <MenuList className="w-[230px]">
            <MenuItem icon={<MousePointerClick size={15} />} label="Selecionar barra no gráfico" onClick={() => (replay.enter(), setMenu(null))} />
            <MenuItem icon={<CalendarDays size={15} />} label="Ir para data…" onClick={() => (useUi.getState().set({ gotoDate: true }), setMenu(null))} />
            <MenuItem icon={<Shuffle size={15} />} label="Barra aleatória" onClick={() => (void replay.randomStart(), setMenu(null))} />
            <MenuSeparator />
            <MenuItem icon={<PauseCircle size={15} />} label="Pausar quando uma ordem executa" checked={st.pauseOnFill} onClick={() => useReplay.setState({ pauseOnFill: !st.pauseOnFill })} />
          </MenuList>
        </Popover>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <Btn label="Recuar uma barra (Shift+←)" onClick={() => void replay.stepBack()} testid="replay-back">
          <SkipBack size={17} />
        </Btn>
        <Btn label={st.playing ? 'Pausa (Shift+↓)' : 'Reproduzir (Shift+↓)'} onClick={() => replay.toggle()} className={cn('w-9', st.playing && 'text-accent')} testid="replay-play">
          {st.busy && st.playing ? <Spinner size={15} className="text-accent" /> : st.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </Btn>
        <Btn label="Avançar uma barra (Shift+→)" onClick={() => void replay.stepForward()} disabled={st.busy && !st.playing} testid="replay-forward">
          {st.busy && !st.playing ? <Spinner size={15} className="text-accent" /> : <SkipForward size={17} />}
        </Btn>
        <button ref={speedRef} type="button" onClick={() => setMenu(menu === 'speed' ? null : 'speed')} className="flex h-8 items-center gap-1 rounded-md px-1.5 text-[13px] hover:bg-hover" title="Velocidade">
          <Gauge size={15} className="text-muted" />
          {speed.label}
        </button>
        <Popover anchor={speedRef} open={menu === 'speed'} onClose={() => setMenu(null)} placement="top-start">
          <MenuList className="w-[180px]">
            <MenuHeader>Velocidade</MenuHeader>
            {SPEEDS.map((s) => (
              <MenuItem key={s.ms} label={s.label} hint={s.ms ? `${s.ms >= 1000 ? `${s.ms / 1000} s` : `${s.ms} ms`}/barra` : 'sem pausa'} active={s.ms === st.speedMs} onClick={() => (replay.setSpeed(s.ms), setMenu(null))} />
            ))}
          </MenuList>
        </Popover>
        <button ref={stepRef} type="button" onClick={() => setMenu(menu === 'step' ? null : 'step')} className="flex h-8 items-center gap-1 rounded-md px-1.5 text-[13px] hover:bg-hover" title="Intervalo de atualização: quanto avança cada passo">
          <Clock3 size={15} className="text-muted" />
          {stepTf ? tfShort(stepTf) : tfShort(cfg.tf)}
          {!stepTf && <span className="hidden text-[11px] text-muted lg:inline">(gráfico)</span>}
        </button>
        <Popover anchor={stepRef} open={menu === 'step'} onClose={() => setMenu(null)} placement="top-start">
          <MenuList className="w-[230px]">
            <MenuHeader>Intervalo de atualização</MenuHeader>
            <MenuItem label="Igual ao gráfico" active={!stepTf} onClick={() => (replay.setStepTf(null), setMenu(null))} />
            {STANDARD_TFS.filter((t) => t !== '45m').map((t) => (
              <MenuItem key={t} label={tfLabel(t)} active={stepTf === t} onClick={() => (replay.setStepTf(t), setMenu(null))} />
            ))}
            <div className="px-3 pt-1 pb-1 text-[11px] leading-snug text-muted">Ex.: gráfico de 4h com atualização de 15m mostra a vela de 4h a formar-se a cada 15 minutos.</div>
          </MenuList>
        </Popover>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <button type="button" onClick={() => useUi.getState().set({ gotoDate: true })} className="flex h-8 items-center rounded-md px-2 text-[12px] tnum hover:bg-hover" title="Data atual do replay — clique para saltar">
          {fmtDateTime(st.cursor, tz)}
        </button>
        {st.ended && <span className="px-1 text-[11px] text-warn">Chegou ao tempo real</span>}
        {st.error && (
          <span className="max-w-[160px] truncate px-1 text-[11px] text-down" title={st.error}>
            {st.error}
          </span>
        )}
        <span className="mx-0.5 h-5 w-px bg-line" />
        <button type="button" onClick={() => quick('long')} className="h-8 rounded-md bg-up px-2.5 text-[12px] font-semibold text-white hover:brightness-110" title={`Comprar ${defaultQty} a mercado`} data-testid="replay-buy">
          Comprar
        </button>
        <button type="button" onClick={() => quick('short')} className="h-8 rounded-md bg-down px-2.5 text-[12px] font-semibold text-white hover:brightness-110" title={`Vender ${defaultQty} a mercado`} data-testid="replay-sell">
          Vender
        </button>
        <div className="flex flex-col px-2 leading-tight" title="Saldo da conta de replay">
          <span className="text-[11px] text-muted tnum">{fmtMoney(acc.balance)}</span>
          <span className={cn('text-[11px] font-semibold tnum', open + realized >= 0 ? 'text-up' : 'text-down')}>
            {open + realized >= 0 ? '+' : ''}
            {fmtMoney(open + realized)}
          </span>
        </div>
        <Btn
          label="Guardar sessão de replay"
          onClick={() => {
            replay.saveCurrent();
            toast('Sessão guardada', { kind: 'success', body: 'Pode continuá-la mais tarde no Diário.' });
          }}
        >
          <Save size={16} />
        </Btn>
        <Btn label="Sair do replay" onClick={() => replay.exit()} className="hover:text-down" testid="replay-exit">
          <X size={17} />
        </Btn>
        <span className="sr-only">{sym.name}</span>
      </div>
    </div>
  );
}
