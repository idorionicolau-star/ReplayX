'use client';
import { useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Plus, Trash2 } from 'lucide-react';
import { TemplateMenu } from '@/components/chart/TemplateMenu';
import { cn } from '@/components/ui/cn';
import { useUi } from '@/store/ui';
import { useDrawings } from '@/store/drawings';
import { useSettings } from '@/store/settings';
import { toolDef } from '@/chart/drawings/tools';
import { DEFAULT_FIB_LEVELS, type DrawingStyle, type FibLevel } from '@/chart/drawings/types';
import { resolveSymbol } from '@/core/symbols';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, NumberInput, Row, Select, Switch } from '@/components/ui/Field';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Tabs } from '@/components/ui/Tabs';
import { fromInputDateTime, toInputDateTime } from '@/lib/format';

type Tab = 'style' | 'text' | 'coords' | 'levels' | 'visibility';

const TF_GROUPS: { id: 'm' | 'h' | 'D' | 'W' | 'M'; label: string }[] = [
  { id: 'm', label: 'Minutos' },
  { id: 'h', label: 'Horas' },
  { id: 'D', label: 'Dias' },
  { id: 'W', label: 'Semanas' },
  { id: 'M', label: 'Meses' },
];

export function DrawingSettings() {
  const target = useUi((s) => s.drawingSettings);
  if (!target) return null;
  return <DrawingSettingsInner key={`${target.id}|${target.tab ?? ''}`} target={target} />;
}

function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: React.ReactNode; title: string }[] }) {
  return (
    <div className="inline-flex rounded-md border border-line p-0.5">
      {items.map((it) => (
        <button key={it.value} type="button" title={it.title} aria-label={it.title} onClick={() => onChange(it.value)} className={cn('flex h-6 min-w-7 items-center justify-center rounded px-1.5 text-xs', value === it.value ? 'bg-accent text-white' : 'text-muted hover:text-text')}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function DrawingSettingsInner({ target }: { target: NonNullable<ReturnType<typeof useUi.getState>['drawingSettings']> }) {
  const d = useDrawings((s) => s.bySymbol[target.symbolId]?.find((x) => x.id === target.id));
  const tz = useSettings((s) => s.timezone);
  const [tab, setTab] = useState<Tab>(target.tab ?? 'style');
  if (!d) return null;
  const def = toolDef(d.type);
  const sym = resolveSymbol(target.symbolId);
  const st = useDrawings.getState();
  const close = () => useUi.getState().set({ drawingSettings: null });
  const setStyle = (patch: Partial<DrawingStyle>) => {
    st.update(target.symbolId, d.id, { style: { ...d.style, ...patch } });
    st.rememberStyle(d.type, patch);
  };
  const isFib = d.type === 'fib' || d.type === 'fibext';
  const isPos = d.type === 'long' || d.type === 'short';
  const hasText = ['text', 'note', 'trendline', 'ray', 'extended', 'hline', 'hray', 'vline', 'rect', 'channel', 'arrowup', 'arrowdown', 'arrowline', 'infoline'].includes(d.type);
  const lineText = ['trendline', 'ray', 'extended', 'hline', 'hray', 'vline', 'rect', 'channel', 'arrowline', 'infoline'].includes(d.type);
  const tabs: { value: typeof tab; label: string }[] = [{ value: 'style', label: 'Estilo' }];
  if (hasText) tabs.push({ value: 'text', label: 'Texto' });
  if (isFib) tabs.push({ value: 'levels', label: 'Níveis' });
  tabs.push({ value: 'coords', label: isPos ? 'Valores' : 'Coordenadas' });
  tabs.push({ value: 'visibility', label: 'Visibilidade' });
  const visible = d.style.visibleOn ?? TF_GROUPS.map((g) => g.id);
  const levels: FibLevel[] = d.style.levels ?? DEFAULT_FIB_LEVELS;
  const setLevels = (lv: FibLevel[]) => setStyle({ levels: lv });

  return (
    <Dialog
      open
      onClose={close}
      title={def?.label ?? 'Desenho'}
      width={460}
      footer={
        <>
          <div className="mr-auto">
            <TemplateMenu symbolId={target.symbolId} d={d} />
          </div>
          <Button variant="primary" onClick={close}>
            Ok
          </Button>
        </>
      }
    >
      <Tabs className="mb-3" value={tab} onChange={setTab} items={tabs} />
      {tab === 'style' && (
        <div className="divide-y divide-line">
          {!isPos && (
            <Row label="Linha">
              <ColorPicker value={d.style.color} onChange={(c) => setStyle({ color: c })} />
              <Select className="w-20" value={String(d.style.width)} onChange={(e) => setStyle({ width: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((w) => (
                  <option key={w} value={w}>
                    {w}px
                  </option>
                ))}
              </Select>
              <Select className="w-32" value={String(d.style.dash)} onChange={(e) => setStyle({ dash: Number(e.target.value) as 0 | 1 | 2 })}>
                <option value="0">Contínua</option>
                <option value="1">Tracejada</option>
                <option value="2">Pontilhada</option>
              </Select>
            </Row>
          )}
          {d.style.fill !== undefined && !isFib && !isPos && (
            <Row label="Preenchimento">
              <ColorPicker value={d.style.fill || 'rgba(41,98,255,0.15)'} onChange={(c) => setStyle({ fill: c })} withAlpha />
              <Switch checked={!!d.style.fill} onChange={(v) => setStyle({ fill: v ? 'rgba(41,98,255,0.15)' : '' })} />
            </Row>
          )}
          {isFib && (
            <Row label="Fundo entre níveis">
              <Switch checked={!!d.style.fill} onChange={(v) => setStyle({ fill: v ? 'on' : '' })} />
            </Row>
          )}
          {['trendline', 'ray', 'extended', 'infoline', 'arrowline', 'channel', 'rect', 'fib', 'fibext'].includes(d.type) && (
            <Row label="Prolongar">
              {d.type !== 'rect' && d.type !== 'fib' && d.type !== 'fibext' && <Checkbox checked={!!d.style.extendLeft} onChange={(v) => setStyle({ extendLeft: v })} label="Esquerda" />}
              <Checkbox checked={!!d.style.extendRight} onChange={(v) => setStyle({ extendRight: v })} label="Direita" />
            </Row>
          )}
          {['trendline', 'ray', 'extended', 'hline', 'hray', 'fib'].includes(d.type) && (
            <Row label={d.type === 'fib' ? 'Mostrar preços' : d.type === 'hline' || d.type === 'hray' ? 'Etiqueta no eixo' : 'Estatísticas'}>
              <Switch checked={d.style.showLabel !== false && (d.type === 'hline' || d.type === 'hray' || d.type === 'fib' || !!d.style.showLabel)} onChange={(v) => setStyle({ showLabel: v })} />
            </Row>
          )}
          <Row label="Bloqueado">
            <Switch checked={!!d.locked} onChange={(v) => st.update(target.symbolId, d.id, { locked: v })} />
          </Row>
          <Row label="Visível">
            <Switch checked={!d.hidden} onChange={(v) => st.update(target.symbolId, d.id, { hidden: !v })} />
          </Row>
        </div>
      )}
      {tab === 'text' && (
        <div className="flex flex-col gap-3">
          <textarea
            autoFocus
            value={d.style.text ?? ''}
            onChange={(e) => setStyle({ text: e.target.value })}
            rows={4}
            placeholder="Escreva o texto…"
            className="w-full resize-none rounded-md border border-line bg-input p-2.5 text-[13px] outline-none focus:border-accent"
          />
          <div className="flex flex-wrap items-center gap-3">
            <ColorPicker value={d.style.textColor ?? d.style.color} onChange={(c) => setStyle({ textColor: c })} label="Cor do texto" />
            <Select className="w-24" value={String(d.style.fontSize ?? 14)} onChange={(e) => setStyle({ fontSize: Number(e.target.value) })}>
              {[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40].map((s) => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </Select>
            <Checkbox checked={!!d.style.bold} onChange={(v) => setStyle({ bold: v })} label="Negrito" />
            <Checkbox checked={!!d.style.italic} onChange={(v) => setStyle({ italic: v })} label="Itálico" />
            {(d.type === 'text' || d.type === 'note') && (
              <>
                <span className="text-xs text-muted">Fundo</span>
                <ColorPicker value={d.style.fill || 'rgba(0,0,0,0)'} onChange={(c) => setStyle({ fill: c })} withAlpha />
              </>
            )}
          </div>
          {lineText && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted">Posição</span>
              <Seg
                value={d.style.textAlign ?? (d.type === 'hline' ? 'right' : d.type === 'hray' || d.type === 'vline' ? 'left' : 'center')}
                onChange={(v) => setStyle({ textAlign: v })}
                items={[
                  { value: 'left', label: <AlignLeft size={13} />, title: 'Início' },
                  { value: 'center', label: <AlignCenter size={13} />, title: 'Centro' },
                  { value: 'right', label: <AlignRight size={13} />, title: 'Fim' },
                ]}
              />
              <Seg
                value={d.style.textVAlign ?? (d.type === 'rect' ? 'middle' : 'top')}
                onChange={(v) => setStyle({ textVAlign: v })}
                items={[
                  { value: 'top', label: 'Cima', title: d.type === 'rect' ? 'Em cima' : 'Por cima da linha' },
                  { value: 'middle', label: 'Meio', title: d.type === 'rect' ? 'Ao meio' : 'Sobre a linha' },
                  { value: 'bottom', label: 'Baixo', title: d.type === 'rect' ? 'Em baixo' : 'Por baixo da linha' },
                ]}
              />
            </div>
          )}
          <p className="text-[11px] text-muted">Para voltar a usar este texto e estilo noutras linhas: “Modelo” → “Guardar como modelo…”.</p>
        </div>
      )}
      {tab === 'visibility' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">Mostrar este desenho nos intervalos:</p>
          {TF_GROUPS.map((g) => (
            <Checkbox
              key={g.id}
              checked={visible.includes(g.id)}
              label={g.label}
              onChange={(v) => {
                const next = v ? [...visible, g.id] : visible.filter((x) => x !== g.id);
                setStyle({ visibleOn: next.length === TF_GROUPS.length ? undefined : next });
              }}
            />
          ))}
        </div>
      )}
      {tab === 'levels' && (
        <div className="flex flex-col gap-1.5">
          {levels.map((lv, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox checked={lv.visible} onChange={(v) => setLevels(levels.map((x, k) => (k === i ? { ...x, visible: v } : x)))} />
              <NumberInput className="w-24" value={lv.value} step={0.001} onChange={(v) => v !== undefined && setLevels(levels.map((x, k) => (k === i ? { ...x, value: v } : x)))} />
              <ColorPicker value={lv.color} onChange={(c) => setLevels(levels.map((x, k) => (k === i ? { ...x, color: c } : x)))} />
              <button type="button" aria-label="Remover nível" className="rounded p-1 text-muted hover:text-down" onClick={() => setLevels(levels.filter((_, k) => k !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setLevels([...levels, { value: 0.886, color: '#2962ff', visible: true }])}>
            <Plus size={14} /> Adicionar nível
          </Button>
        </div>
      )}
      {tab === 'coords' && (
        <div className="divide-y divide-line">
          {!isPos &&
            d.points.slice(0, 6).map((p, i) => (
              <Row key={i} label={`Ponto ${i + 1}`}>
                <Input
                  type="datetime-local"
                  className="w-48"
                  value={toInputDateTime(p.time, tz)}
                  onChange={(e) => {
                    const t = fromInputDateTime(e.target.value, tz);
                    if (!Number.isFinite(t)) return;
                    st.update(target.symbolId, d.id, { points: d.points.map((q, k) => (k === i ? { ...q, time: t } : q)) });
                  }}
                />
                <NumberInput className="w-28" value={+p.price.toFixed(sym.precision)} step={Math.pow(10, -sym.precision)} onChange={(v) => v !== undefined && st.update(target.symbolId, d.id, { points: d.points.map((q, k) => (k === i ? { ...q, price: v } : q)) })} />
              </Row>
            ))}
          {isPos && d.data && (
            <>
              <Row label="Entrada">
                <NumberInput className="w-32" value={+d.points[0].price.toFixed(sym.precision)} step={Math.pow(10, -sym.precision)} onChange={(v) => v !== undefined && st.update(target.symbolId, d.id, { points: [{ ...d.points[0], price: v }, { ...d.points[1], price: v }] })} />
              </Row>
              <Row label="Stop">
                <NumberInput className="w-32" value={+d.data.stop.toFixed(sym.precision)} step={Math.pow(10, -sym.precision)} onChange={(v) => v !== undefined && st.update(target.symbolId, d.id, { data: { ...d.data!, stop: v } })} />
              </Row>
              <Row label="Alvo">
                <NumberInput className="w-32" value={+d.data.target.toFixed(sym.precision)} step={Math.pow(10, -sym.precision)} onChange={(v) => v !== undefined && st.update(target.symbolId, d.id, { data: { ...d.data!, target: v } })} />
              </Row>
              <Row label="Tamanho da conta">
                <NumberInput className="w-32" value={d.data.account} step={100} min={1} onChange={(v) => v !== undefined && st.update(target.symbolId, d.id, { data: { ...d.data!, account: v } })} />
              </Row>
              <Row label="Risco (%)">
                <NumberInput className="w-32" value={d.data.riskPct} step={0.25} min={0.01} max={100} onChange={(v) => v !== undefined && st.update(target.symbolId, d.id, { data: { ...d.data!, riskPct: v } })} />
              </Row>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
