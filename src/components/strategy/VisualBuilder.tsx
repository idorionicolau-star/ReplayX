'use client';
import { useRef, useState } from 'react';
import { ChevronDown, Code2, Copy, FilePlus2, Play, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useStrategies } from '@/store/strategies';
import { useWorkspace } from '@/store/workspace';
import { INDICATORS, getIndicator, defaultParams } from '@/core/indicators/registry';
import { SOURCES } from '@/core/indicators/ta';
import { OP_LABEL, cond, emptyStrategy, templates, toScript, vid, type VCondition, type VOperand, type VOp, type VRules, type VisualStrategy } from '@/core/strategy/visual';
import { runTester } from './run';
import { Button } from '@/components/ui/Button';
import { NumberInput, Select, Switch, Input } from '@/components/ui/Field';
import { Popover } from '@/components/ui/Popover';
import { MenuHeader, MenuItem, MenuList } from '@/components/ui/Menu';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';

const KEYS = 'ABCDEFGHIJKLMNOP'.split('');
const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function OperandEditor({ o, s, onChange }: { o: VOperand; s: VisualStrategy; onChange: (o: VOperand) => void }) {
  const ind = o.kind === 'indicator' ? s.indicators.find((x) => x.key === o.ref) : undefined;
  const def = ind ? getIndicator(ind.type) : undefined;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Select
        className="h-7 w-[104px] text-xs"
        value={o.kind === 'indicator' ? `ind:${o.ref}` : o.kind}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'price') onChange({ kind: 'price', field: 'close', offset: 0 });
          else if (v === 'value') onChange({ kind: 'value', value: 0 });
          else {
            const key = v.slice(4);
            const vi = s.indicators.find((x) => x.key === key);
            const d = vi ? getIndicator(vi.type) : undefined;
            onChange({ kind: 'indicator', ref: key, output: d?.outputs[0]?.key ?? '', offset: 0 });
          }
        }}
      >
        <option value="price">Preço</option>
        <option value="value">Valor</option>
        {s.indicators.map((vi) => (
          <option key={vi.key} value={`ind:${vi.key}`}>
            {vi.key}: {getIndicator(vi.type)?.short ?? vi.type}
          </option>
        ))}
      </Select>
      {o.kind === 'price' && (
        <Select className="h-7 w-[78px] text-xs" value={o.field ?? 'close'} onChange={(e) => onChange({ ...o, field: e.target.value as VOperand['field'] })}>
          {SOURCES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </Select>
      )}
      {o.kind === 'indicator' && def && def.outputs.length > 1 && (
        <Select className="h-7 w-[92px] text-xs" value={o.output} onChange={(e) => onChange({ ...o, output: e.target.value })}>
          {def.outputs.map((out) => (
            <option key={out.key} value={out.key}>
              {out.label}
            </option>
          ))}
        </Select>
      )}
      {o.kind === 'value' && <NumberInput className="w-[78px] [&_input]:h-7 [&_input]:text-xs" value={o.value} step={1} onChange={(v) => onChange({ ...o, value: v ?? 0 })} />}
      {o.kind !== 'value' && (
        <Select className="h-7 w-[64px] text-xs" title="Barras atrás" value={String(o.offset ?? 0)} onChange={(e) => onChange({ ...o, offset: Number(e.target.value) })}>
          {[0, 1, 2, 3, 5, 10].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'atual' : `[${n}]`}
            </option>
          ))}
        </Select>
      )}
    </span>
  );
}

function RulesEditor({ title, rules, s, onChange, tone }: { title: string; rules: VRules; s: VisualStrategy; onChange: (r: VRules) => void; tone: 'up' | 'down' | 'muted' }) {
  const setCond = (gi: number, ci: number, c: VCondition | null) => {
    const groups = rules.groups.map((g, k) => (k !== gi ? g : { ...g, conditions: c ? g.conditions.map((x, j) => (j === ci ? c : x)) : g.conditions.filter((_, j) => j !== ci) }));
    onChange({ groups: groups.filter((g, k) => g.conditions.length || k === 0) });
  };
  const addCond = (gi: number) => {
    const first = s.indicators[0];
    const d = first ? getIndicator(first.type) : undefined;
    const left: VOperand = first ? { kind: 'indicator', ref: first.key, output: d?.outputs[0]?.key ?? '', offset: 0 } : { kind: 'price', field: 'close' };
    const c = cond(left, 'gt', { kind: 'value', value: 0 });
    const groups = rules.groups.length ? rules.groups.map((g, k) => (k === gi ? { ...g, conditions: [...g.conditions, c] } : g)) : [{ id: vid(), conditions: [c] }];
    onChange({ groups });
  };
  return (
    <div className="rounded-lg border border-line">
      <div className={cn('flex items-center justify-between border-b border-line px-3 py-1.5 text-xs font-semibold', tone === 'up' && 'text-up', tone === 'down' && 'text-down', tone === 'muted' && 'text-muted')}>{title}</div>
      <div className="flex flex-col gap-1.5 p-2">
        {rules.groups.map((g, gi) => (
          <div key={g.id}>
            {gi > 0 && <div className="my-1 text-center text-[10px] font-bold text-warn">— OU —</div>}
            <div className="flex flex-col gap-1">
              {g.conditions.map((c, ci) => (
                <div key={c.id} className="flex flex-wrap items-center gap-1 rounded-md bg-sunken p-1.5">
                  {ci > 0 && <span className="mr-1 text-[10px] font-bold text-accent">E</span>}
                  <OperandEditor o={c.left} s={s} onChange={(left) => setCond(gi, ci, { ...c, left })} />
                  <Select className="h-7 w-[150px] text-xs" value={c.op} onChange={(e) => setCond(gi, ci, { ...c, op: e.target.value as VOp })}>
                    {(Object.keys(OP_LABEL) as VOp[]).map((op) => (
                      <option key={op} value={op}>
                        {OP_LABEL[op]}
                      </option>
                    ))}
                  </Select>
                  {c.op === 'rising' || c.op === 'falling' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <NumberInput className="w-14 [&_input]:h-7 [&_input]:text-xs" value={c.bars ?? 1} min={1} max={50} step={1} onChange={(v) => setCond(gi, ci, { ...c, bars: Math.round(v ?? 1) })} />
                      barras
                    </span>
                  ) : (
                    <OperandEditor o={c.right} s={s} onChange={(right) => setCond(gi, ci, { ...c, right })} />
                  )}
                  <button type="button" aria-label="Remover condição" className="ml-auto rounded p-1 text-muted hover:text-down" onClick={() => setCond(gi, ci, null)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              <div className="flex gap-1">
                <Button size="xs" variant="ghost" onClick={() => addCond(gi)}>
                  <Plus size={12} /> E (condição)
                </Button>
                {gi === rules.groups.length - 1 && g.conditions.length > 0 && (
                  <Button size="xs" variant="ghost" onClick={() => onChange({ groups: [...rules.groups, { id: vid(), conditions: [] }] })}>
                    <Plus size={12} /> OU (grupo)
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
        {!rules.groups.length && (
          <Button size="xs" variant="ghost" onClick={() => addCond(0)}>
            <Plus size={12} /> Adicionar condição
          </Button>
        )}
      </div>
    </div>
  );
}

export function VisualBuilder() {
  const visuals = useStrategies((s) => s.visuals);
  const activeId = useStrategies((s) => s.activeVisual);
  const saveVisual = useStrategies((s) => s.saveVisual);
  const saved = visuals.find((v) => v.id === activeId) ?? visuals[0];
  const [blank] = useState(emptyStrategy);
  const [drafts, setDrafts] = useState<Record<string, VisualStrategy>>({});
  const base = saved ?? blank;
  const s = drafts[base.id] ?? base;
  const newRef = useRef<HTMLButtonElement>(null);
  const [newOpen, setNewOpen] = useState(false);
  const dirty = saved && JSON.stringify({ ...s, updatedAt: 0 }) !== JSON.stringify({ ...saved, updatedAt: 0 });

  const patch = (p: Partial<VisualStrategy>) => setDrafts((d) => ({ ...d, [base.id]: { ...(d[base.id] ?? base), ...p } }));
  const save = () => {
    saveVisual(s);
    toast('Estratégia guardada', { kind: 'success', duration: 1500 });
  };
  const test = async () => {
    saveVisual(s);
    useWorkspace.getState().setBottomTab('tester');
    await runTester({ kind: 'visual', strategy: s }, s.name);
  };
  const toScriptAction = () => {
    const code = toScript(s);
    const id = useStrategies.getState().saveScript({ name: `${s.name} (script)`, code });
    useStrategies.getState().setActiveScript(id);
    useWorkspace.getState().setBottomTab('script');
    toast('Convertido para script', { kind: 'success', body: 'Pode editar o código no separador Scripts.' });
  };

  const addIndicator = (type: string) => {
    const used = new Set(s.indicators.map((i) => i.key));
    const key = KEYS.find((k) => !used.has(k)) ?? `X${s.indicators.length}`;
    const def = getIndicator(type);
    patch({ indicators: [...s.indicators, { key, type, params: def ? defaultParams(def) : {} }] });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5">
        <Select className="w-56" value={saved?.id ?? ''} onChange={(e) => useStrategies.getState().setActiveVisual(e.target.value)}>
          {visuals.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        {dirty && <span className="text-[11px] text-warn">● não guardado</span>}
        <Button ref={newRef} size="sm" variant="ghost" onClick={() => setNewOpen((o) => !o)}>
          <FilePlus2 size={14} /> Nova <ChevronDown size={12} />
        </Button>
        <Popover anchor={newRef} open={newOpen} onClose={() => setNewOpen(false)} placement="top-start">
          <MenuList className="w-[280px]">
            <MenuItem
              label="Em branco"
              onClick={() => {
                saveVisual(emptyStrategy());
                setNewOpen(false);
              }}
            />
            <MenuHeader>Modelos</MenuHeader>
            {templates().map((t) => (
              <MenuItem
                key={t.name}
                label={t.name}
                onClick={() => {
                  saveVisual({ ...t, id: vid() });
                  setNewOpen(false);
                }}
              />
            ))}
          </MenuList>
        </Popover>
        <Button size="sm" variant="ghost" onClick={save} disabled={!dirty}>
          <Save size={14} /> Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => saveVisual({ ...s, id: vid(), name: `${s.name} (cópia)` })}>
          <Copy size={14} />
        </Button>
        <Button size="sm" variant="ghost" className="hover:text-down" onClick={() => saved && confirm(`Apagar "${saved.name}"?`) && useStrategies.getState().deleteVisual(saved.id)}>
          <Trash2 size={14} />
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={toScriptAction}>
          <Code2 size={14} /> Converter em script
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            saveVisual(s);
            useWorkspace.getState().setBottomTab('optimizer');
          }}
        >
          <Sparkles size={14} /> Otimizar
        </Button>
        <Button size="sm" variant="primary" onClick={() => void test()}>
          <Play size={13} fill="currentColor" /> Testar
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="max-w-xs font-semibold" value={s.name} onChange={(e) => patch({ name: e.target.value })} />
              {s.description && <span className="text-xs text-muted">{s.description}</span>}
            </div>
            <div className="rounded-lg border border-line">
              <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
                <span className="text-xs font-semibold">Indicadores usados</span>
                <Select className="h-7 w-48 text-xs" value="" onChange={(e) => e.target.value && addIndicator(e.target.value)}>
                  <option value="">+ Adicionar indicador…</option>
                  {INDICATORS.filter((d) => d.outputs.length > 0).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                {s.indicators.map((vi, k) => {
                  const def = getIndicator(vi.type);
                  return (
                    <div key={vi.key} className="flex flex-wrap items-center gap-1.5 rounded-md bg-sunken p-1.5 text-xs">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-accent font-bold text-white">{vi.key}</span>
                      <span className="w-28 truncate font-medium">{def?.name ?? vi.type}</span>
                      {def?.inputs.map((inp) =>
                        inp.type === 'int' || inp.type === 'float' ? (
                          <label key={inp.key} className="inline-flex items-center gap-1 text-muted">
                            {inp.label}
                            <NumberInput
                              className="w-16 [&_input]:h-7 [&_input]:text-xs"
                              value={Number(vi.params[inp.key] ?? inp.default)}
                              step={inp.step ?? 1}
                              min={inp.min}
                              max={inp.max}
                              onChange={(v) => v !== undefined && patch({ indicators: s.indicators.map((x, j) => (j === k ? { ...x, params: { ...x.params, [inp.key]: inp.type === 'int' ? Math.round(v) : v } } : x)) })}
                            />
                          </label>
                        ) : inp.type === 'source' || inp.type === 'select' || inp.type === 'ma' ? (
                          <Select
                            key={inp.key}
                            className="h-7 w-20 text-xs"
                            value={String(vi.params[inp.key] ?? inp.default)}
                            onChange={(e) => patch({ indicators: s.indicators.map((x, j) => (j === k ? { ...x, params: { ...x.params, [inp.key]: e.target.value } } : x)) })}
                          >
                            {(inp.options ?? []).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </Select>
                        ) : null,
                      )}
                      <button type="button" aria-label="Remover indicador" className="ml-auto rounded p-1 text-muted hover:text-down" onClick={() => patch({ indicators: s.indicators.filter((_, j) => j !== k) })}>
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
                {!s.indicators.length && <div className="py-2 text-center text-xs text-muted">Adicione indicadores para os usar nas condições (ex.: EMA, RSI).</div>}
              </div>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="mb-2 text-xs font-semibold">Gestão de risco</div>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <label className="flex items-center justify-between gap-2 text-muted">
                  Stop loss
                  <span className="flex gap-1">
                    <Select className="h-7 w-28 text-xs" value={s.stopLoss.type} onChange={(e) => patch({ stopLoss: { ...s.stopLoss, type: e.target.value as VisualStrategy['stopLoss']['type'] } })}>
                      <option value="none">Sem stop</option>
                      <option value="atr">x ATR</option>
                      <option value="percent">% do preço</option>
                      <option value="points">Pontos</option>
                      <option value="swing">Último swing</option>
                    </Select>
                    {s.stopLoss.type !== 'none' && s.stopLoss.type !== 'swing' && <NumberInput className="w-16 [&_input]:h-7 [&_input]:text-xs" value={s.stopLoss.value} step={0.25} min={0} onChange={(v) => v !== undefined && patch({ stopLoss: { ...s.stopLoss, value: v } })} />}
                    {s.stopLoss.type === 'swing' && <NumberInput className="w-16 [&_input]:h-7 [&_input]:text-xs" value={s.stopLoss.lookback} step={1} min={2} onChange={(v) => v !== undefined && patch({ stopLoss: { ...s.stopLoss, lookback: Math.round(v) } })} />}
                  </span>
                </label>
                <label className="flex items-center justify-between gap-2 text-muted">
                  Take profit
                  <span className="flex gap-1">
                    <Select className="h-7 w-28 text-xs" value={s.takeProfit.type} onChange={(e) => patch({ takeProfit: { ...s.takeProfit, type: e.target.value as VisualStrategy['takeProfit']['type'] } })}>
                      <option value="none">Sem alvo</option>
                      <option value="rr">x risco (R:R)</option>
                      <option value="atr">x ATR</option>
                      <option value="percent">% do preço</option>
                      <option value="points">Pontos</option>
                    </Select>
                    {s.takeProfit.type !== 'none' && <NumberInput className="w-16 [&_input]:h-7 [&_input]:text-xs" value={s.takeProfit.value} step={0.25} min={0} onChange={(v) => v !== undefined && patch({ takeProfit: { ...s.takeProfit, value: v } })} />}
                  </span>
                </label>
                <label className="flex items-center justify-between gap-2 text-muted">
                  Trailing stop
                  <span className="flex gap-1">
                    <Select className="h-7 w-28 text-xs" value={s.trailing.type} onChange={(e) => patch({ trailing: { ...s.trailing, type: e.target.value as VisualStrategy['trailing']['type'] } })}>
                      <option value="none">Desligado</option>
                      <option value="atr">x ATR</option>
                      <option value="percent">% do preço</option>
                      <option value="points">Pontos</option>
                    </Select>
                    {s.trailing.type !== 'none' && <NumberInput className="w-16 [&_input]:h-7 [&_input]:text-xs" value={s.trailing.value} step={0.25} min={0} onChange={(v) => v !== undefined && patch({ trailing: { ...s.trailing, value: v } })} />}
                  </span>
                </label>
                <label className="flex items-center justify-between gap-2 text-muted">
                  Período do ATR
                  <NumberInput className="w-16 [&_input]:h-7 [&_input]:text-xs" value={s.stopLoss.atrLen} step={1} min={1} onChange={(v) => v !== undefined && patch({ stopLoss: { ...s.stopLoss, atrLen: Math.round(v) } })} />
                </label>
                <label className="flex items-center justify-between gap-2 text-muted">
                  Sair após N barras (0 = não)
                  <NumberInput className="w-16 [&_input]:h-7 [&_input]:text-xs" value={s.maxBarsInTrade} step={1} min={0} onChange={(v) => v !== undefined && patch({ maxBarsInTrade: Math.round(v) })} />
                </label>
                <Switch checked={s.exitOnOpposite} onChange={(v) => patch({ exitOnOpposite: v })} label={<span className="text-muted">Fechar com o sinal contrário</span>} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
                <Switch checked={s.session.enabled} onChange={(v) => patch({ session: { ...s.session, enabled: v } })} label={<span className="text-muted">Só negociar entre</span>} />
                <NumberInput className="w-14 [&_input]:h-7 [&_input]:text-xs" value={s.session.startHour} min={0} max={23} step={1} onChange={(v) => v !== undefined && patch({ session: { ...s.session, startHour: Math.round(v) } })} />
                <span className="text-muted">e</span>
                <NumberInput className="w-14 [&_input]:h-7 [&_input]:text-xs" value={s.session.endHour} min={0} max={24} step={1} onChange={(v) => v !== undefined && patch({ session: { ...s.session, endHour: Math.round(v) } })} />
                <span className="text-muted">h (UTC)</span>
                <span className="flex gap-0.5">
                  {DAYS.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => patch({ session: { ...s.session, days: s.session.days.includes(i) ? s.session.days.filter((x) => x !== i) : [...s.session.days, i] } })}
                      className={cn('h-6 w-6 rounded text-[11px] font-semibold', s.session.days.includes(i) ? 'bg-accent text-white' : 'bg-hover text-muted')}
                    >
                      {d}
                    </button>
                  ))}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 text-xs">
              <Switch checked={s.long.enabled} onChange={(v) => patch({ long: { ...s.long, enabled: v } })} label="Compras (long)" />
              <Switch checked={s.short.enabled} onChange={(v) => patch({ short: { ...s.short, enabled: v } })} label="Vendas (short)" />
            </div>
            {s.long.enabled && (
              <>
                <RulesEditor title="SE … ENTÃO COMPRAR" rules={s.long.entry} s={s} tone="up" onChange={(entry) => patch({ long: { ...s.long, entry } })} />
                <RulesEditor title="Fechar a compra quando (opcional)" rules={s.long.exit} s={s} tone="muted" onChange={(exit) => patch({ long: { ...s.long, exit } })} />
              </>
            )}
            {s.short.enabled && (
              <>
                <RulesEditor title="SE … ENTÃO VENDER" rules={s.short.entry} s={s} tone="down" onChange={(entry) => patch({ short: { ...s.short, entry } })} />
                <RulesEditor title="Fechar a venda quando (opcional)" rules={s.short.exit} s={s} tone="muted" onChange={(exit) => patch({ short: { ...s.short, exit } })} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
