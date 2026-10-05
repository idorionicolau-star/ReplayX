'use client';
import { useMemo, useState } from 'react';
import { Bell, BellRing, Smartphone, Volume2 } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useAlerts, type Alert } from '@/store/alerts';
import { useWorkspace } from '@/store/workspace';
import { useDrawings } from '@/store/drawings';
import { useSettings } from '@/store/settings';
import { resolveSymbol } from '@/core/symbols';
import { STANDARD_TFS, tfLabel } from '@/core/timeframes';
import { getIndicator, instanceLabel, type IndicatorInstance } from '@/core/indicators/registry';
import {
  CHANNEL_CONDITIONS,
  CHANNEL_DRAWINGS,
  CONDITION_LABEL,
  DEFAULT_NOTIFY,
  LINE_CONDITIONS,
  LINE_DRAWINGS,
  TRIGGER_LABEL,
  type AlertCondition,
  type AlertNotify,
  type AlertSource,
  type AlertTarget,
  type AlertTrigger,
  type IndicatorRef,
} from '@/core/alerts';
import { toolDef } from '@/chart/drawings/tools';
import type { Drawing } from '@/chart/drawings/types';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input, NumberInput, Row, Select, Switch } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { fmtPrice, fromInputDateTime, toInputDateTime } from '@/lib/format';
import { currentPrice } from '@/trading/actions';
import { notifyPermission, requestNotifyPermission } from '@/lib/notify';

type Draft = NonNullable<ReturnType<typeof useUi.getState>['alertDraft']>;

export function AlertDialog() {
  const draft = useUi((s) => s.alertDraft);
  if (!draft) return null;
  return <AlertForm key={JSON.stringify(draft)} draft={draft} />;
}

/** Saídas dos indicadores do gráfico (só os embutidos), como opções "ind:<uid>:<saída>". */
function indicatorOptions(instances: IndicatorInstance[]): { value: string; label: string; ref: IndicatorRef }[] {
  const out: { value: string; label: string; ref: IndicatorRef }[] = [];
  for (const inst of instances) {
    const def = getIndicator(inst.type);
    if (!def) continue;
    const base = instanceLabel(def, inst.params);
    for (const o of def.outputs) {
      const label = def.outputs.length > 1 ? `${base} · ${o.label}` : base;
      out.push({ value: `ind:${inst.uid}:${o.key}`, label, ref: { type: inst.type, params: { ...inst.params }, output: o.key, label } });
    }
  }
  return out;
}

/** Desenhos que podem servir de alvo. */
function drawingOptions(drawings: Drawing[]): { value: string; label: string; d: Drawing }[] {
  const count: Record<string, number> = {};
  return drawings
    .filter((d) => LINE_DRAWINGS.has(d.type) || CHANNEL_DRAWINGS.has(d.type))
    .map((d) => {
      count[d.type] = (count[d.type] ?? 0) + 1;
      const name = toolDef(d.type)?.label ?? d.type;
      return { value: `draw:${d.id}`, label: `${name} ${count[d.type]}`, d };
    });
}

const EMPTY: Drawing[] = [];

function AlertForm({ draft }: { draft: Draft }) {
  const editing = useAlerts((s) => (draft.editId ? s.alerts.find((a) => a.id === draft.editId) : undefined));
  const symbolId = editing?.symbolId ?? draft.symbolId;
  const sym = resolveSymbol(symbolId);
  const chart = useWorkspace((s) => s.charts.find((c) => c.symbolId === symbolId) ?? s.charts[s.active]);
  const drawings = useDrawings((s) => s.bySymbol[symbolId]) ?? EMPTY;
  const tz = useSettings((s) => s.timezone);
  const step = Math.pow(10, -sym.precision);

  const indOpts = useMemo(() => (chart?.symbolId === symbolId ? indicatorOptions(chart.indicators) : []), [chart, symbolId]);
  const drawOpts = useMemo(() => drawingOptions(drawings), [drawings]);

  // ---------- estado inicial ----------
  const [initial] = useState(() => {
    const round = (v: number) => +v.toFixed(sym.precision);
    const price = draft.price ?? currentPrice(symbolId) ?? 0;
    const band = { low: round(price * 0.995), high: round(price * 1.005) };
    if (editing) {
      const t = editing.target;
      return {
        srcKey: editing.source.kind === 'price' ? 'price' : 'cur-src',
        tgtKey: t.kind === 'drawing' ? `draw:${t.drawingId}` : t.kind === 'indicator' ? 'cur-tgt' : t.kind,
        value: t.kind === 'value' ? t.value : round(price),
        low: t.kind === 'range' ? t.low : band.low,
        high: t.kind === 'range' ? t.high : band.high,
        cond: editing.condition,
      };
    }
    if (draft.drawingId) {
      const d = drawings.find((x) => x.id === draft.drawingId);
      const cond: AlertCondition = d && CHANNEL_DRAWINGS.has(d.type) ? 'enter' : 'cross';
      return { srcKey: 'price', tgtKey: `draw:${draft.drawingId}`, value: round(price), ...band, cond };
    }
    if (draft.indicatorUid) {
      const first = indOpts.find((o) => o.value.startsWith(`ind:${draft.indicatorUid}:`));
      const def = first ? getIndicator(first.ref.type) : undefined;
      const oscillator = !!def && !def.overlay;
      const lvl = def?.levels?.[0]?.value;
      return { srcKey: first?.value ?? 'price', tgtKey: oscillator ? 'value' : 'price', value: lvl ?? (oscillator ? 50 : round(price)), ...band, cond: 'cross' as AlertCondition };
    }
    return { srcKey: 'price', tgtKey: 'value', value: round(price), ...band, cond: 'cross' as AlertCondition };
  });

  const [srcKey, setSrcKey] = useState(initial.srcKey);
  const [tgtKey, setTgtKey] = useState(initial.tgtKey);
  const [value, setValue] = useState<number | undefined>(initial.value);
  const [low, setLow] = useState<number | undefined>(initial.low);
  const [high, setHigh] = useState<number | undefined>(initial.high);
  const [cond, setCond] = useState<AlertCondition>(initial.cond);
  const [tf, setTf] = useState(editing?.tf ?? chart?.tf ?? '15m');
  const [trigger, setTrigger] = useState<AlertTrigger>(editing?.trigger ?? 'once');
  const [expires, setExpires] = useState<number | null>(editing?.expiresAt ?? null);
  const [name, setName] = useState(editing?.name ?? '');
  const [msg, setMsg] = useState(editing?.message ?? '');
  const [notify, setNotify] = useState<AlertNotify>(editing?.notify ?? { ...DEFAULT_NOTIFY });
  const [perm, setPerm] = useState(notifyPermission);

  const tgtDrawing = tgtKey.startsWith('draw:') ? drawOpts.find((o) => o.value === tgtKey)?.d : undefined;
  const channel = tgtKey === 'range' || (!!tgtDrawing && CHANNEL_DRAWINGS.has(tgtDrawing.type));
  const conds = channel ? CHANNEL_CONDITIONS : LINE_CONDITIONS;
  const condNow = conds.includes(cond) ? cond : conds[0];

  const close = () => useUi.getState().set({ alertDraft: null });

  const source = (): AlertSource | null => {
    if (srcKey === 'price') return { kind: 'price' };
    if (srcKey === 'cur-src' && editing?.source.kind === 'indicator') return editing.source;
    const o = indOpts.find((x) => x.value === srcKey);
    return o ? { kind: 'indicator', ...o.ref } : null;
  };
  const target = (): AlertTarget | null => {
    if (tgtKey === 'value') return value === undefined ? null : { kind: 'value', value };
    if (tgtKey === 'range') return low === undefined || high === undefined ? null : { kind: 'range', low: Math.min(low, high), high: Math.max(low, high) };
    if (tgtKey === 'price') return { kind: 'price' };
    if (tgtKey === 'cur-tgt' && editing?.target.kind === 'indicator') return editing.target;
    if (tgtDrawing) return { kind: 'drawing', drawingId: tgtDrawing.id, label: drawOpts.find((o) => o.value === tgtKey)!.label };
    const o = indOpts.find((x) => x.value === tgtKey);
    return o ? { kind: 'indicator', ...o.ref } : null;
  };

  const save = () => {
    const s = source();
    const t = target();
    if (!s || !t) {
      toast('Falta escolher o valor do alerta', { kind: 'error' });
      return;
    }
    if (s.kind === 'price' && t.kind === 'price') {
      toast('Escolha um alvo diferente do preço', { kind: 'error' });
      return;
    }
    const data: Omit<Alert, 'id' | 'createdAt' | 'active'> = {
      name: name.trim(),
      symbolId,
      tf,
      source: s,
      condition: condNow,
      target: t,
      trigger,
      expiresAt: expires,
      message: msg.trim(),
      notify,
    };
    const st = useAlerts.getState();
    if (editing) st.update(editing.id, { ...data, active: true, stopped: undefined, lastBar: undefined });
    else st.add(data);
    if (notify.push && perm === 'default') void requestNotifyPermission().then(setPerm);
    toast(editing ? 'Alerta atualizado' : 'Alerta criado', { kind: 'success' });
    close();
  };

  const tfOptions: string[] = (STANDARD_TFS as readonly string[]).includes(tf) ? [...STANDARD_TFS] : [tf, ...STANDARD_TFS];

  return (
    <Dialog
      open
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          <BellRing size={17} className="text-warn" /> {editing ? 'Editar alerta' : 'Criar alerta'} · {sym.name}
        </span>
      }
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} data-testid="alert-save">
            {editing ? 'Guardar' : 'Criar alerta'}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5" data-testid="alert-dialog">
        <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">Condição</div>
        <Select value={srcKey} onChange={(e) => setSrcKey(e.target.value)} data-testid="alert-source">
          <option value="price">Preço ({sym.name})</option>
          {editing?.source.kind === 'indicator' && <option value="cur-src">{editing.source.label}</option>}
          {indOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select value={condNow} onChange={(e) => setCond(e.target.value as AlertCondition)} data-testid="alert-condition">
          {conds.map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABEL[c]}
            </option>
          ))}
        </Select>
        <Select value={tgtKey} onChange={(e) => setTgtKey(e.target.value)} data-testid="alert-target">
          <option value="value">Valor</option>
          <option value="range">Canal entre dois valores</option>
          {srcKey !== 'price' && <option value="price">Preço ({sym.name})</option>}
          {drawOpts.length > 0 && (
            <optgroup label="Desenhos">
              {drawOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {(indOpts.length > 0 || editing?.target.kind === 'indicator') && (
            <optgroup label="Indicadores">
              {editing?.target.kind === 'indicator' && <option value="cur-tgt">{editing.target.label}</option>}
              {indOpts
                .filter((o) => o.value !== srcKey)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          )}
        </Select>
        {tgtKey === 'value' && <NumberInput value={value} step={srcKey === 'price' ? step : 0.1} onChange={setValue} />}
        {tgtKey === 'range' && (
          <div className="grid grid-cols-2 gap-2">
            <NumberInput value={high} step={step} onChange={setHigh} placeholder="Limite de cima" />
            <NumberInput value={low} step={step} onChange={setLow} placeholder="Limite de baixo" />
          </div>
        )}
        {srcKey === 'price' && <div className="text-[11px] text-muted">Preço atual: {fmtPrice(currentPrice(symbolId), sym.precision)}</div>}

        <div className="divide-y divide-line pt-1">
          <Row label="Intervalo">
            <Select className="w-40" value={tf} onChange={(e) => setTf(e.target.value)}>
              {tfOptions.map((t) => (
                <option key={t} value={t}>
                  {tfLabel(t)}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Frequência">
            <Select className="w-52" value={trigger} onChange={(e) => setTrigger(e.target.value as AlertTrigger)} data-testid="alert-trigger">
              {(Object.keys(TRIGGER_LABEL) as AlertTrigger[]).map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABEL[t]}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Validade">
            <Switch checked={expires === null} onChange={(v) => setExpires(v ? null : Math.floor(Date.now() / 1000) + 30 * 86400)} label="Sem fim" />
            {expires !== null && (
              <input
                type="datetime-local"
                value={toInputDateTime(expires, tz)}
                onChange={(e) => e.target.value && setExpires(fromInputDateTime(e.target.value, tz))}
                className="h-8 rounded-md border border-line bg-input px-2 text-[13px] outline-none focus:border-accent"
              />
            )}
          </Row>
        </div>

        <div className="pt-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Nome e mensagem</div>
        <Input placeholder="Nome do alerta (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea
          placeholder="Mensagem (opcional). Pode usar {{ticker}}, {{close}}, {{value}}, {{time}}, {{interval}}"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-md border border-line bg-input px-2.5 py-1.5 text-[13px] outline-none placeholder:text-faint focus:border-accent"
        />

        <div className="pt-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Avisar com</div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['popup', 'Janela no ecrã', Bell],
              ['sound', 'Som', Volume2],
              ['push', 'Notificação no telemóvel', Smartphone],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                const on = !notify[k];
                setNotify({ ...notify, [k]: on });
                if (k === 'push' && on && perm === 'default') void requestNotifyPermission().then(setPerm);
              }}
              className={cn('flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors', notify[k] ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-hover')}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {notify.push && perm === 'denied' && <div className="text-[11px] text-down">As notificações estão bloqueadas neste navegador. Ative-as nas definições do site.</div>}
        {notify.push && perm === 'unsupported' && <div className="text-[11px] text-muted">Este navegador não suporta notificações. No iPhone, instale primeiro a app no ecrã principal.</div>}
        <div className="pt-1 text-[11px] text-muted">Os alertas são verificados enquanto a app está aberta (no telemóvel, com a app no ecrã; o sistema pode pausá-la em segundo plano). Funcionam da mesma forma durante o replay.</div>
      </div>
    </Dialog>
  );
}
