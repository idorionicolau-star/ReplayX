'use client';
import { useEffect, useState } from 'react';
import { useUi } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { useStrategies } from '@/store/strategies';
import { getIndicator, defaultParams, type ParamValue } from '@/core/indicators/registry';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { NumberInput, Row, Select, Switch } from '@/components/ui/Field';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Tabs } from '@/components/ui/Tabs';
import { getChart } from '@/chart/registry';
import { runStrategy } from '@/core/strategy/client';
import type { ScriptInput, ScriptRunResult } from '@/core/strategy/script';
import { MA_TYPES, SOURCES } from '@/core/indicators/ta';

export function IndicatorSettings() {
  const target = useUi((s) => s.indicatorSettings);
  const inst = useWorkspace((s) => (target ? s.charts[target.chart]?.indicators.find((i) => i.uid === target.uid) : undefined));
  const chartId = useWorkspace((s) => (target ? s.charts[target.chart]?.id : undefined));
  const update = useWorkspace((s) => s.updateIndicator);
  const scripts = useStrategies((s) => s.scripts);
  const [tab, setTab] = useState<'inputs' | 'style'>('inputs');
  const [scriptInputs, setScriptInputs] = useState<ScriptInput[] | null>(null);
  const [plots, setPlots] = useState<{ key: string; label: string; color: string }[]>([]);
  const close = () => useUi.getState().set({ indicatorSettings: null });

  const isScript = inst?.type.startsWith('script:');
  const def = inst && !isScript ? getIndicator(inst.type) : undefined;
  const script = isScript ? scripts.find((s) => s.id === inst!.type.slice(7)) : undefined;

  useEffect(() => {
    if (!inst || !isScript || !script || !chartId) return;
    const c = getChart(chartId);
    const bars = c?.bars.slice(-500) ?? [];
    runStrategy<ScriptRunResult>({ type: 'script', code: script.code, bars, overrides: inst.params }, { timeoutMs: 5000 })
      .then((r) => {
        setScriptInputs(r.inputs);
        setPlots(r.plots.map((p, i) => ({ key: `p${i}`, label: p.title, color: p.color })));
      })
      .catch(() => setScriptInputs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst?.uid, script?.code]);

  if (!target || !inst) return null;
  const setParam = (k: string, v: ParamValue) => update(inst.uid, { params: { ...inst.params, [k]: v } }, target.chart);
  const setStyle = (k: string, patch: { color?: string; width?: number; visible?: boolean }) => update(inst.uid, { styles: { ...inst.styles, [k]: { ...inst.styles[k], ...patch } } }, target.chart);
  const outputs = def ? def.outputs.map((o) => ({ key: o.key, label: o.label, color: o.color, width: o.width ?? 1, hidden: !!o.hiddenByDefault })) : plots.map((p) => ({ ...p, width: 2, hidden: false }));

  return (
    <Dialog
      open
      onClose={close}
      title={def?.name ?? script?.name ?? 'Indicador'}
      width={440}
      footer={
        <>
          {def && (
            <Button variant="ghost" onClick={() => update(inst.uid, { params: defaultParams(def), styles: {} }, target.chart)}>
              Repor padrão
            </Button>
          )}
          <Button variant="primary" onClick={close}>
            Ok
          </Button>
        </>
      }
    >
      <Tabs
        className="mb-3"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'inputs', label: 'Parâmetros' },
          { value: 'style', label: 'Estilo' },
        ]}
      />
      {tab === 'inputs' && (
        <div className="divide-y divide-line">
          {def?.inputs.map((inp) => {
            const v = inst.params[inp.key] ?? inp.default;
            return (
              <Row key={inp.key} label={inp.label}>
                {inp.type === 'int' || inp.type === 'float' ? (
                  <NumberInput className="w-28" value={Number(v)} step={inp.step ?? 1} min={inp.min} max={inp.max} onChange={(x) => x !== undefined && setParam(inp.key, inp.type === 'int' ? Math.round(x) : x)} />
                ) : inp.type === 'bool' ? (
                  <Switch checked={Boolean(v)} onChange={(x) => setParam(inp.key, x)} />
                ) : (
                  <Select className="w-36" value={String(v)} onChange={(e) => setParam(inp.key, e.target.value)}>
                    {(inp.options ?? (inp.type === 'source' ? SOURCES.map((s) => ({ value: s, label: s })) : MA_TYPES.map((m) => ({ value: m, label: m.toUpperCase() })))).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Row>
            );
          })}
          {def && !def.inputs.length && <div className="py-4 text-center text-xs text-muted">Este indicador não tem parâmetros.</div>}
          {isScript && scriptInputs === null && <div className="py-4 text-center text-xs text-muted">A ler os parâmetros do script…</div>}
          {isScript &&
            scriptInputs?.map((inp) => {
              const v = inst.params[inp.title] ?? inp.default;
              return (
                <Row key={inp.title} label={inp.title}>
                  {inp.type === 'int' || inp.type === 'float' ? (
                    <NumberInput className="w-28" value={Number(v)} step={inp.step ?? 1} min={inp.min} max={inp.max} onChange={(x) => x !== undefined && setParam(inp.title, inp.type === 'int' ? Math.round(x) : x)} />
                  ) : inp.type === 'bool' ? (
                    <Switch checked={Boolean(v)} onChange={(x) => setParam(inp.title, x)} />
                  ) : (
                    <Select className="w-36" value={String(v)} onChange={(e) => setParam(inp.title, e.target.value)}>
                      {(inp.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  )}
                </Row>
              );
            })}
          {isScript && scriptInputs && !scriptInputs.length && <div className="py-4 text-center text-xs text-muted">Este script não tem parâmetros (input.*).</div>}
        </div>
      )}
      {tab === 'style' && (
        <div className="divide-y divide-line">
          {outputs.map((o) => {
            const s = inst.styles[o.key] ?? {};
            return (
              <Row key={o.key} label={o.label}>
                <Switch checked={s.visible ?? !o.hidden} onChange={(x) => setStyle(o.key, { visible: x })} />
                <ColorPicker value={s.color ?? o.color} onChange={(c) => setStyle(o.key, { color: c })} />
                <Select className="w-20" value={String(s.width ?? o.width)} onChange={(e) => setStyle(o.key, { width: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((w) => (
                    <option key={w} value={w}>
                      {w}px
                    </option>
                  ))}
                </Select>
              </Row>
            );
          })}
          {!outputs.length && <div className="py-4 text-center text-xs text-muted">Sem linhas para configurar.</div>}
        </div>
      )}
    </Dialog>
  );
}
