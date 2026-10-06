'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pause, Play, SkipBack, SkipForward, X, Save, CalendarDays, Shuffle, MousePointerClick, Gauge, Clock3, PauseCircle, GripVertical, ListPlus } from 'lucide-react';
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
import { QtyStepper } from '@/components/ui/QtyStepper';
import { createPosition } from '@/trading/position';
import { useLotRule } from '@/trading/lotRule';
import { snapLot, fmtLotWith } from '@/core/trading/lots';
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
  const rawQty = useSettings((s) => s.trading.defaultQty);
  const acc = useTrading((s) => s.replay);
  const selRef = useRef<HTMLButtonElement>(null);
  const speedRef = useRef<HTMLButtonElement>(null);
  const stepRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<'select' | 'speed' | 'step' | null>(null);
  const pos = useSettings((s) => s.replayBarPos);
  const setSettings = useSettings((s) => s.set);
  const setTrading = useSettings((s) => s.setTrading);
  const lotRuleNow = useLotRule(cfg?.symbolId);
  // o lote mostrado é sempre válido para este ativo (mínimo, passo e máximo)
  const defaultQty = snapLot(rawQty, lotRuleNow);
  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const shown = st.active && !st.selecting && st.cursor !== null && !!cfg;

  // mantém a barra dentro da área quando a janela muda de tamanho
  useEffect(() => {
    if (!pos || !shown) return;
    const fit = () => {
      const el = barRef.current;
      const parent = wrapRef.current?.parentElement;
      if (!el || !parent) return;
      const x = Math.max(0, Math.min(parent.clientWidth - el.offsetWidth, pos.x));
      const y = Math.max(0, Math.min(parent.clientHeight - el.offsetHeight, pos.y));
      if (x !== pos.x || y !== pos.y) setSettings({ replayBarPos: { x, y } });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [pos, shown, setSettings]);

  const onGrip = (e: React.PointerEvent) => {
    const el = barRef.current;
    const parent = wrapRef.current?.parentElement;
    if (!el || !parent) return;
    e.preventDefault();
    const pr = parent.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    let last = { x: r.left - pr.left, y: r.top - pr.top };
    let moved = false;
    const move = (ev: PointerEvent) => {
      moved = true;
      last = {
        x: Math.max(0, Math.min(pr.width - r.width, ev.clientX - pr.left - dx)),
        y: Math.max(0, Math.min(pr.height - r.height, ev.clientY - pr.top - dy)),
      };
      setDrag(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (moved) setSettings({ replayBarPos: last });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

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

  const at = drag ?? pos;

  return (
    <div
      ref={wrapRef}
      className={cn('absolute z-30', at ? 'max-w-[calc(100%-8px)]' : 'pointer-events-none right-0 bottom-[38px] left-0 flex justify-center px-2')}
      style={at ? { left: at.x, top: at.y } : undefined}
    >
      <div ref={barRef} className="rx-bar-in pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-elev/97 px-1.5 py-1 shadow-pop no-select" data-testid="replay-bar">
        <span
          onPointerDown={onGrip}
          onDoubleClick={() => setSettings({ replayBarPos: null })}
          className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-faint active:cursor-grabbing"
          title="Arrastar a barra (duplo toque para a repor em baixo)"
          data-testid="replay-grip"
        >
          <GripVertical size={15} />
        </span>
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
        <QtyStepper value={defaultQty} rule={lotRuleNow} onChange={(v) => setTrading({ defaultQty: v })} className="shrink-0" />
        <button type="button" onClick={() => quick('long')} className="h-8 rounded-md bg-up px-2.5 text-[12px] font-semibold text-white hover:brightness-110" title={`Comprar ${fmtLotWith(defaultQty, lotRuleNow)} a mercado (lote mín. ${fmtLotWith(lotRuleNow.min, lotRuleNow)})`} data-testid="replay-buy">
          Comprar
        </button>
        <button type="button" onClick={() => quick('short')} className="h-8 rounded-md bg-down px-2.5 text-[12px] font-semibold text-white hover:brightness-110" title={`Vender ${fmtLotWith(defaultQty, lotRuleNow)} a mercado (lote mín. ${fmtLotWith(lotRuleNow.min, lotRuleNow)})`} data-testid="replay-sell">
          Vender
        </button>
        <button type="button" onClick={() => createPosition(cfg.symbolId)} className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-line px-2 text-[12px] font-semibold hover:bg-hover" title="Posição com stop e alvo para arrastar: arrasta a entrada, o SL e o TP e envia a ordem (limite, stop ou mercado)" data-testid="replay-order">
          <ListPlus size={15} /> Ordem
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
