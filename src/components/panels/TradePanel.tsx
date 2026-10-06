'use client';
import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, X, XCircle } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useSettings } from '@/store/settings';
import { useTrading, specFor } from '@/store/trading';
import { useReplay } from '@/replay/engine';
import { resolveSymbol, pipSize } from '@/core/symbols';
import { qtyForRisk, unrealized, pnlFor, type OrderType, type Side } from '@/core/trading/engine';
import { applyTradeAction, closeAll, currentPrice, moveToBreakEven, submitOrder, tradingMode } from '@/trading/actions';
import { Button } from '@/components/ui/Button';
import { useLotRule } from '@/trading/lotRule';
import { fmtLotWith, lotForRisk, snapLot } from '@/core/trading/lots';
import { NumberInput, Switch } from '@/components/ui/Field';
import { Segmented, Tabs } from '@/components/ui/Tabs';
import { fmtDateTime, fmtMoney, fmtPrice } from '@/lib/format';
import { cn } from '@/components/ui/cn';

export function TradePanel() {
  const symbolId = useWorkspace((s) => s.charts[s.active]?.symbolId);
  const trading = useSettings((s) => s.trading);
  const setTrading = useSettings((s) => s.setTrading);
  const tz = useSettings((s) => s.timezone);
  useReplay((s) => s.prices);
  const replayOn = useReplay((s) => s.active && !s.selecting && s.cursor !== null);
  const mode = replayOn ? 'replay' : 'live';
  const acc = useTrading((s) => s[mode]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (mode !== 'live') return;
    const t = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [mode]);

  const sym = useMemo(() => (symbolId ? resolveSymbol(symbolId) : null), [symbolId]);
  const [side, setSide] = useState<Side>('long');
  const [type, setType] = useState<OrderType>('market');
  const [limitPrice, setLimitPrice] = useState<number | undefined>();
  const [useSl, setUseSl] = useState(true);
  const [useTp, setUseTp] = useState(true);
  const [slPips, setSlPips] = useState<number | undefined>(20);
  const [rr, setRr] = useState<number | undefined>(2);
  const [qtyManual, setQtyManual] = useState<number | undefined>(trading.defaultQty);
  const [tab, setTab] = useState<'positions' | 'orders' | 'history'>('positions');
  const lotRuleNow = useLotRule(symbolId);

  if (!sym || !symbolId) return null;
  const spec = specFor(sym);
  const price = currentPrice(symbolId);
  const pip = pipSize(sym);
  const entry = type === 'market' ? price : limitPrice ?? price;
  const d = side === 'long' ? 1 : -1;
  const sl = useSl && entry !== undefined && slPips ? entry - d * slPips * pip : undefined;
  const tp = useTp && entry !== undefined && sl !== undefined && rr ? entry + d * Math.abs(entry - sl) * rr : undefined;
  const riskAmount = (acc.balance * trading.defaultRiskPct) / 100;
  const rl = entry !== undefined && sl !== undefined ? lotForRisk(side, riskAmount, entry, sl, spec, lotRuleNow) : undefined;
  // o lote respeita sempre o mínimo, o passo e o máximo do tipo de mercado
  const qtyRounded = trading.sizing === 'risk' && rl ? rl.qty : snapLot(qtyManual ?? 0, lotRuleNow);
  const openPnl = acc.positions.reduce((a, p) => {
    const px = currentPrice(p.symbolId);
    return a + (px === undefined ? 0 : unrealized(p, px, specFor(resolveSymbol(p.symbolId))));
  }, 0);
  const equity = acc.balance + openPnl;
  const lotLabel = sym.contractSize && sym.contractSize > 1 ? 'lotes' : 'unidades';

  const send = () => {
    if (trading.confirmOrders && !confirm(`${side === 'long' ? 'Comprar' : 'Vender'} ${qtyRounded} ${sym.name}?`)) return;
    submitOrder({ symbolId, side, type, qty: qtyRounded, price: type === 'market' ? undefined : limitPrice, sl, tp });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-line p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide', mode === 'replay' ? 'bg-accent/15 text-accent' : 'bg-up/15 text-up')}>{mode === 'replay' ? 'CONTA DE REPLAY' : 'CONTA DEMO · TEMPO REAL'}</span>
          <span className="text-[11px] text-muted">{sym.name}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[11px] text-muted">Saldo</div>
            <div className="text-[13px] font-semibold tnum">{fmtMoney(acc.balance)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Capital</div>
            <div className="text-[13px] font-semibold tnum">{fmtMoney(equity)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Aberto</div>
            <div className={cn('text-[13px] font-semibold tnum', openPnl >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(openPnl)}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-b border-line p-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setSide('short')} className={cn('rounded-lg border px-2 py-1.5 text-left transition-colors', side === 'short' ? 'border-down bg-down/10' : 'border-line hover:bg-hover')}>
            <div className="text-[11px] text-down">Vender</div>
            <div className="text-[15px] font-semibold tnum">{fmtPrice(price !== undefined ? price - spec.spread / 2 : undefined, sym.precision)}</div>
          </button>
          <button type="button" onClick={() => setSide('long')} className={cn('rounded-lg border px-2 py-1.5 text-right transition-colors', side === 'long' ? 'border-up bg-up/10' : 'border-line hover:bg-hover')}>
            <div className="text-[11px] text-up">Comprar</div>
            <div className="text-[15px] font-semibold tnum">{fmtPrice(price !== undefined ? price + spec.spread / 2 : undefined, sym.precision)}</div>
          </button>
        </div>
        <Segmented
          className="w-full"
          value={type}
          onChange={(v) => {
            setType(v);
            if (v !== 'market' && price !== undefined) setLimitPrice(+price.toFixed(sym.precision));
          }}
          items={[
            { value: 'market', label: 'Mercado' },
            { value: 'limit', label: 'Limite' },
            { value: 'stop', label: 'Stop' },
          ]}
        />
        {type !== 'market' && (
          <label className="flex items-center justify-between gap-2 text-xs text-muted">
            Preço
            <NumberInput className="w-36" value={limitPrice} step={pip} onChange={setLimitPrice} />
          </label>
        )}
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <Segmented
            value={trading.sizing}
            onChange={(v) => setTrading({ sizing: v })}
            items={[
              { value: 'risk', label: 'Risco %' },
              { value: 'qty', label: 'Quantidade' },
            ]}
          />
          {trading.sizing === 'risk' ? (
            <NumberInput className="w-24" value={trading.defaultRiskPct} step={0.25} min={0.01} max={100} onChange={(v) => v !== undefined && setTrading({ defaultRiskPct: v })} suffix="%" />
          ) : (
            <NumberInput className="w-24" value={qtyManual} step={0.01} min={0} onChange={setQtyManual} />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <Switch checked={useSl} onChange={setUseSl} label={<span className="text-muted">Stop loss ({sym.assetClass === 'forex' ? 'pips' : 'pontos'})</span>} />
          <NumberInput className="w-24" value={slPips} step={1} min={0} onChange={setSlPips} disabled={!useSl} />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <Switch checked={useTp} onChange={setUseTp} label={<span className="text-muted">Take profit (R:R)</span>} />
          <NumberInput className="w-24" value={rr} step={0.25} min={0.1} onChange={setRr} disabled={!useTp || !useSl} />
        </div>
        <div className="rounded-md bg-sunken px-2.5 py-2 text-[11px] leading-relaxed text-muted tnum">
          <div className="flex justify-between">
            <span>Quantidade</span>
            <span className="text-text">
              {fmtLotWith(qtyRounded, lotRuleNow)} {lotLabel}
            </span>
          </div>
          <div className="flex justify-between text-faint">
            <span>Regras deste ativo</span>
            <span>
              mín. {fmtLotWith(lotRuleNow.min, lotRuleNow)} · passo {fmtLotWith(lotRuleNow.step, lotRuleNow)}
            </span>
          </div>
          {trading.sizing === 'risk' && rl?.minExceeds && <div className="text-warn">O lote mínimo já arrisca mais do que {trading.defaultRiskPct}%. Afaste o stop ou aumente o risco.</div>}
          {sl !== undefined && (
            <div className="flex justify-between">
              <span>SL {fmtPrice(sl, sym.precision)}</span>
              <span className="text-down">{entry !== undefined ? fmtMoney(pnlFor(side, qtyRounded, entry, sl, spec)) : '—'}</span>
            </div>
          )}
          {tp !== undefined && (
            <div className="flex justify-between">
              <span>TP {fmtPrice(tp, sym.precision)}</span>
              <span className="text-up">{entry !== undefined ? fmtMoney(pnlFor(side, qtyRounded, entry, tp, spec)) : '—'}</span>
            </div>
          )}
          {trading.sizing === 'risk' && sl === undefined && <div className="text-warn">Defina um stop para calcular a quantidade pelo risco.</div>}
        </div>
        <Button variant={side === 'long' ? 'success' : 'danger'} size="lg" block disabled={price === undefined || !(qtyRounded > 0)} onClick={send} data-testid="order-submit">
          {side === 'long' ? 'Comprar' : 'Vender'} {qtyRounded} {type === 'market' ? 'a mercado' : type === 'limit' ? 'limite' : 'stop'}
        </Button>
        {price === undefined && <div className="text-center text-[11px] text-muted">{mode === 'replay' ? 'À espera do preço do replay…' : 'À espera do preço em tempo real…'}</div>}
      </div>

      <div className="flex items-center justify-between px-2 pt-2">
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'positions', label: `Posições (${acc.positions.length})` },
            { value: 'orders', label: `Ordens (${acc.orders.length})` },
            { value: 'history', label: 'Histórico' },
          ]}
        />
        {tab === 'positions' && acc.positions.length > 0 && (
          <button type="button" className="text-[11px] text-down hover:underline" onClick={() => closeAll()}>
            Fechar todas
          </button>
        )}
      </div>
      <div className="flex-1 p-2">
        {tab === 'positions' &&
          acc.positions.map((p) => {
            const s = resolveSymbol(p.symbolId);
            const px = currentPrice(p.symbolId);
            const pnl = px === undefined ? 0 : unrealized(p, px, specFor(s));
            return (
              <div key={p.id} className="mb-1.5 rounded-lg border border-line p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    <span className={p.side === 'long' ? 'text-up' : 'text-down'}>{p.side === 'long' ? 'COMPRA' : 'VENDA'}</span> {s.name} · {+p.qty.toFixed(4)}
                  </span>
                  <span className={cn('font-semibold tnum', pnl >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(pnl)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-muted tnum">
                  <span>Entrada {fmtPrice(p.entryPrice, s.precision)}</span>
                  <span>SL {p.sl !== undefined ? fmtPrice(p.sl, s.precision) : '—'}</span>
                  <span>TP {p.tp !== undefined ? fmtPrice(p.tp, s.precision) : '—'}</span>
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  <Button size="xs" variant="subtle" onClick={() => moveToBreakEven(p.id)} title="Mover stop para a entrada">
                    <ShieldCheck size={12} /> BE
                  </Button>
                  <Button size="xs" variant="subtle" onClick={() => applyTradeAction({ type: 'modify-position', id: p.id, sl: null, tp: null })}>
                    Sem SL/TP
                  </Button>
                  <div className="flex-1" />
                  <Button size="xs" variant="danger" onClick={() => applyTradeAction({ type: 'close-position', id: p.id })}>
                    <X size={12} /> Fechar
                  </Button>
                </div>
              </div>
            );
          })}
        {tab === 'positions' && !acc.positions.length && <div className="py-6 text-center text-xs text-muted">Sem posições abertas. Também pode arrastar as linhas de SL/TP no gráfico.</div>}
        {tab === 'orders' &&
          acc.orders.map((o) => {
            const s = resolveSymbol(o.symbolId);
            return (
              <div key={o.id} className="mb-1.5 flex items-center justify-between rounded-lg border border-line p-2 text-xs">
                <div>
                  <div className="font-semibold">
                    <span className={o.side === 'long' ? 'text-up' : 'text-down'}>{o.side === 'long' ? 'COMPRA' : 'VENDA'}</span> {o.type === 'limit' ? 'LIMITE' : 'STOP'} {s.name}
                  </div>
                  <div className="text-muted tnum">
                    {+o.qty.toFixed(4)} @ {fmtPrice(o.price, s.precision)}
                    {o.sl !== undefined && ` · SL ${fmtPrice(o.sl, s.precision)}`}
                    {o.tp !== undefined && ` · TP ${fmtPrice(o.tp, s.precision)}`}
                  </div>
                </div>
                <button type="button" aria-label="Cancelar ordem" onClick={() => applyTradeAction({ type: 'cancel-order', id: o.id })} className="rounded p-1 text-muted hover:text-down">
                  <XCircle size={16} />
                </button>
              </div>
            );
          })}
        {tab === 'orders' && !acc.orders.length && <div className="py-6 text-center text-xs text-muted">Sem ordens pendentes.</div>}
        {tab === 'history' &&
          [...acc.trades]
            .reverse()
            .slice(0, 100)
            .map((t) => {
              const s = resolveSymbol(t.symbolId);
              return (
                <div key={t.id} className="flex items-center justify-between border-b border-line py-1.5 text-xs last:border-0">
                  <div>
                    <div>
                      <span className={t.side === 'long' ? 'text-up' : 'text-down'}>{t.side === 'long' ? 'Compra' : 'Venda'}</span> {s.name} · {+t.qty.toFixed(4)}
                    </div>
                    <div className="text-[11px] text-muted">{fmtDateTime(t.exitTime, tz)} · {t.exitReason.toUpperCase()}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn('font-semibold tnum', t.pnl >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(t.pnl)}</div>
                    {t.r !== undefined && <div className="text-[11px] text-muted tnum">{t.r >= 0 ? '+' : ''}{t.r.toFixed(2)}R</div>}
                  </div>
                </div>
              );
            })}
        {tab === 'history' && !acc.trades.length && <div className="py-6 text-center text-xs text-muted">Ainda sem operações fechadas.</div>}
      </div>
      <div className="px-3 pb-3 text-[11px] text-muted">{tradingMode() === 'replay' ? 'As ordens são executadas à medida que o replay avança.' : 'Conta simulada: executa com os preços em tempo real.'}</div>
    </div>
  );
}
