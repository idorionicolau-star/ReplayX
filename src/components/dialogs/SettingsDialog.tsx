'use client';
import { useState } from 'react';
import { useUi } from '@/store/ui';
import { useSettings, TIMEZONES, DEFAULT_TRADING, type LoupePos } from '@/store/settings';
import { useTrading } from '@/store/trading';
import { useReplay } from '@/replay/engine';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { NumberInput, Row, Select, Switch } from '@/components/ui/Field';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Tabs, Segmented } from '@/components/ui/Tabs';
import { dataFeed } from '@/core/feed/datafeed';
import { toast } from '@/components/ui/Toast';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { DEFAULT_LOT_RULES, LOT_CLASS_LABEL } from '@/core/trading/lots';
import type { AssetClass } from '@/core/types';
import { DEFAULT_APPEARANCE, themeDefaults, type Appearance } from '@/chart/appearance';
import { CHART_PRESETS, presetFromLook, presetPatch, type ChartPreset } from '@/chart/presets';
import { uid } from '@/lib/uid';
import { shade } from '@/chart/drawings/auto';
import { clearBarCache } from '@/core/feed/barCache';
import { useSaverReason, type DataSaverSetting } from '@/lib/dataSaver';
import { fmtBytes, meterTotal, resetDataMeter, useDataMeter } from '@/lib/dataMeter';
import { PIVOT_SENSITIVITY, type PivotSensitivity } from '@/core/priceSnap';
import { getLang, LANGS, setLang, tr, type Lang } from '@/i18n';

export function SettingsDialog() {
  const open = useUi((s) => s.settings);
  const s = useSettings();
  const pauseOnFill = useReplay((r) => r.pauseOnFill);
  const [tab, setTab] = useState<'symbol' | 'scales' | 'canvas' | 'chart' | 'trading' | 'replay' | 'data'>('symbol');
  if (!open) return null;
  const close = () => useUi.getState().set({ settings: false });
  const t = s.trading;
  return (
    <Dialog open onClose={close} title={tr('Definições do gráfico')} width={560} footer={<Button variant="primary" onClick={close}>{tr('Fechar')}</Button>}>
      <Tabs
        className="mb-3"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'symbol', label: tr('Símbolo') },
          { value: 'scales', label: tr('Escalas') },
          { value: 'canvas', label: 'Canvas' },
          { value: 'chart', label: tr('Geral') },
          { value: 'trading', label: tr('Negociação') },
          { value: 'replay', label: 'Replay' },
          { value: 'data', label: tr('Dados') },
        ]}
      />
      {(tab === 'symbol' || tab === 'canvas') && <PresetsMenu />}
      {tab === 'symbol' && <SymbolTab />}
      {tab === 'scales' && <ScalesTab />}
      {tab === 'canvas' && <CanvasTab />}
      {tab === 'chart' && (
        <div className="divide-y divide-line">
          <Row label={tr('Idioma')}>
            <Segmented value={getLang()} onChange={(v: Lang) => setLang(v)} items={LANGS.map((l) => ({ value: l.id, label: l.label }))} />
          </Row>
          <Row label={tr('Tema')}>
            <Segmented
              value={s.theme}
              onChange={(v) => s.set({ theme: v })}
              items={[
                { value: 'dark', label: tr('Escuro') },
                { value: 'light', label: tr('Claro') },
              ]}
            />
          </Row>
          <Row label={tr('Fuso horário')}>
            <Select className="w-52" value={s.timezone} onChange={(e) => s.set({ timezone: e.target.value })}>
              {TIMEZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </Select>
          </Row>
          <Row label={tr('Sons')}>
            <Switch checked={s.sound} onChange={(v) => s.set({ sound: v })} />
          </Row>
          <Row label={tr('Lupa ao desenhar com o dedo')}>
            <Switch checked={s.loupe} onChange={(v) => s.set({ loupe: v })} />
          </Row>
          <Row label={tr('Escala de preços automática (ajusta-se aos dados à vista)')}>
            <Switch checked={s.autoFit} onChange={(v) => s.set({ autoFit: v })} />
          </Row>
          <Row label={tr('Selo de resultados das caixas de posição (acerto e R do backtest; toque no selo para ver a curva)')}>
            <Switch checked={s.backtestChip} onChange={(v) => s.set({ backtestChip: v })} />
          </Row>
          <DataSaverRow />
          <Row label={tr('Lista de observação: atualização dos preços (mais lenta gasta bem menos dados)')}>
            <Select className="w-56" value={s.watchRefresh} onChange={(e) => s.set({ watchRefresh: Number(e.target.value) as 0 | 5 | 15 | 60 })} data-testid="watch-refresh">
              <option value={0}>{tr('Tempo real (gasta mais dados)')}</option>
              <option value={5}>{tr('A cada 5 segundos')}</option>
              <option value={15}>{tr('A cada 15 segundos')}</option>
              <option value={60}>{tr('A cada minuto')}</option>
            </Select>
          </Row>
          <Row label={tr('Histórico automático dos indicadores (carregam sozinhos mais velas para achar sinais; gasta dados)')}>
            <Select className="w-64" value={s.autoHistory} onChange={(e) => s.set({ autoHistory: e.target.value as 'ask' | 'always' | 'limit' })} data-testid="auto-history">
              <option value="ask">{tr('Perguntar antes de passar das 5 000 velas')}</option>
              <option value="always">{tr('Carregar sempre (até 20 000 velas)')}</option>
              <option value="limit">{tr('Parar nas 5 000 velas')}</option>
            </Select>
          </Row>
          <Row label={tr('Barra do desenho junto ao rato (abre onde fizeste o último clique, ao terminar um desenho; não vale no modo contínuo)')}>
            <Switch checked={s.floatNearMouse} onChange={(v) => s.set({ floatNearMouse: v })} />
          </Row>
          <Row label={tr('Barra do desenho também ao clicar num desenho antigo (abre junto ao clique)')}>
            <Switch checked={s.floatOnSelect} onChange={(v) => s.set({ floatOnSelect: v })} />
          </Row>
          <Row label={tr('Pivôs do íman de preço (Alt ou botão do telemóvel): sensibilidade')}>
            <Select className="w-64" value={s.pivotSensitivity} onChange={(e) => s.set({ pivotSensitivity: e.target.value as PivotSensitivity })} data-testid="pivot-sensitivity">
              {(Object.keys(PIVOT_SENSITIVITY) as PivotSensitivity[]).map((k) => (
                <option key={k} value={k}>
                  {PIVOT_SENSITIVITY[k].label}
                </option>
              ))}
            </Select>
          </Row>
          <Row label={tr('Fora do replay, usar também os pivôs à frente do cursor (desligado: só o que já tinha acontecido até ao ponto onde desenhas)')}>
            <Switch checked={s.pivotFuture} onChange={(v) => s.set({ pivotFuture: v })} />
          </Row>
          <Row label={tr('Ir para uma data no gráfico')}>
            <Button
              size="sm"
              onClick={() => {
                useUi.getState().set({ settings: false, gotoDate: true });
              }}
            >
              {tr('Abrir')}
            </Button>
          </Row>
          <Row label={tr('Vibração ao rodar símbolo e intervalo')}>
            <Switch checked={s.haptics} onChange={(v) => s.set({ haptics: v })} />
          </Row>
          <Row label={tr('Posição da lupa')}>
            <Select className="w-52" value={s.loupePos} onChange={(e) => s.set({ loupePos: e.target.value as LoupePos })} data-testid="loupe-pos">
              <option value="top-right">{tr('Canto superior direito')}</option>
              <option value="top-left">{tr('Canto superior esquerdo')}</option>
              <option value="bottom-right">{tr('Canto inferior direito')}</option>
              <option value="bottom-left">{tr('Canto inferior esquerdo')}</option>
              <option value="follow">{tr('Junto ao dedo')}</option>
            </Select>
          </Row>
          <div className="pt-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                s.set({ chartStyle: null, appearance: DEFAULT_APPEARANCE, upColor: '#089981', downColor: '#f23645', showWatermark: true });
                toast(tr('Aparência reposta'), { kind: 'success' });
              }}
            >
              {tr('Repor a aparência do gráfico')}
            </Button>
          </div>
        </div>
      )}
      {tab === 'trading' && (
        <div className="divide-y divide-line">
          <Row label={tr('Saldo inicial da conta (USD)')}>
            <NumberInput className="w-32" value={t.initialBalance} min={10} step={1000} onChange={(v) => v !== undefined && s.setTrading({ initialBalance: v })} />
          </Row>
          <Row label={tr('Quantidade padrão (lotes)')}>
            <NumberInput className="w-32" value={t.defaultQty} min={0.0001} step={0.01} onChange={(v) => v !== undefined && s.setTrading({ defaultQty: v })} />
          </Row>
          <Row label={tr('Risco padrão por operação (%)')}>
            <NumberInput className="w-32" value={t.defaultRiskPct} min={0.01} max={100} step={0.25} onChange={(v) => v !== undefined && s.setTrading({ defaultRiskPct: v })} />
          </Row>
          <Row label={tr('Spread (pips/pontos)')}>
            <NumberInput className="w-32" value={t.spreadPoints} min={0} step={0.1} onChange={(v) => v !== undefined && s.setTrading({ spreadPoints: v })} />
          </Row>
          <Row label={tr('Deslizamento (pips/pontos)')}>
            <NumberInput className="w-32" value={t.slippagePoints} min={0} step={0.1} onChange={(v) => v !== undefined && s.setTrading({ slippagePoints: v })} />
          </Row>
          <Row label={tr('Comissão')}>
            <Select className="w-32" value={t.commission.type} onChange={(e) => s.setTrading({ commission: { ...t.commission, type: e.target.value as 'none' | 'percent' | 'perLot' } })}>
              <option value="none">{tr('Nenhuma')}</option>
              <option value="percent">{tr('% do valor')}</option>
              <option value="perLot">{tr('$ por lote')}</option>
            </Select>
            {t.commission.type !== 'none' && <NumberInput className="w-24" value={t.commission.value} min={0} step={0.01} onChange={(v) => v !== undefined && s.setTrading({ commission: { ...t.commission, value: v } })} />}
          </Row>
          <div className="py-3" data-testid="lot-rules">
            <div className="mb-1 text-[13px] font-medium">{tr('Lote por tipo de mercado')}</div>
            <div className="mb-2 text-xs text-muted">{tr('Mínimo, passo (múltiplos permitidos) e máximo. As ordens e o cálculo do lote pelo risco respeitam estes valores.')}</div>
            <div className="grid grid-cols-[1fr_72px_72px_80px] items-center gap-x-2 gap-y-1.5 text-xs">
              <span />
              <span className="text-muted">{tr('Mínimo')}</span>
              <span className="text-muted">{tr('Passo')}</span>
              <span className="text-muted">{tr('Máximo')}</span>
              {(Object.keys(DEFAULT_LOT_RULES) as AssetClass[]).map((cls) => {
                const r = s.lotRules[cls];
                const patch = (p: Partial<typeof r>) => s.set({ lotRules: { ...s.lotRules, [cls]: { ...r, ...p } } });
                return (
                  <div key={cls} className="contents">
                    <span>{LOT_CLASS_LABEL[cls]}</span>
                    <NumberInput className="w-[72px]" value={r.min} min={0.0001} step={r.step} onChange={(v) => v !== undefined && patch({ min: v })} />
                    <NumberInput className="w-[72px]" value={r.step} min={0.0001} step={0.001} onChange={(v) => v !== undefined && patch({ step: v })} />
                    <NumberInput className="w-[80px]" value={r.max} min={r.min} step={1} onChange={(v) => v !== undefined && patch({ max: v })} />
                  </div>
                );
              })}
            </div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => s.set({ lotRules: DEFAULT_LOT_RULES })}>
              {tr('Repor regras de lote')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!confirm(tr('Repor a conta demo em tempo real? As operações dessa conta serão apagadas.'))) return;
                useTrading.getState().resetAccount('live', t.initialBalance);
                toast(tr('Conta demo reposta'), { kind: 'success' });
              }}
            >
              {tr('Repor conta demo (tempo real)')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => s.setTrading(DEFAULT_TRADING)}>
              {tr('Valores padrão')}
            </Button>
          </div>
        </div>
      )}
      {tab === 'replay' && (
        <div className="divide-y divide-line">
          <Row label={tr('Execução de ordens com dados finos (mais preciso)')}>
            <Switch checked={s.replayIntrabar} onChange={(v) => s.set({ replayIntrabar: v })} />
          </Row>
          <Row label={tr('Pausar quando uma ordem executa')}>
            <Switch checked={pauseOnFill} onChange={(v) => useReplay.setState({ pauseOnFill: v })} />
          </Row>
          <p className="pt-3 text-xs leading-relaxed text-muted">
            {tr('Com dados finos, o SL/TP é verificado com velas mais pequenas dentro de cada passo (ex.: 1m dentro de 1h), como um “bar magnifier”. Desligue para um replay mais rápido em ligações lentas.')}
          </p>
        </div>
      )}
      {tab === 'data' && (
        <div className="flex flex-col gap-3">
          <DataUsage />
          <LegalFooter className="rounded-lg bg-sunken p-3" />
          <p className="text-xs leading-relaxed text-muted">
            {tr('Fontes:')} <b>Deriv</b> {tr('(índices sintéticos, forex, metais e índices — WebSocket público),')} <b>Binance</b> {tr('(cripto) e')} <b>Yahoo Finance</b> {tr('(ações, índices e futuros). As velas descarregadas ficam guardadas neste dispositivo (só o que já fechou), para não as descarregar outra vez; “Limpar cache de dados” apaga-as.')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                dataFeed().clear();
                void clearBarCache();
                toast(tr('Cache de dados limpa'), { kind: 'success', body: tr('Os gráficos vão voltar a descarregar os dados.') });
              }}
            >
              {tr('Limpar cache de dados')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (!confirm(tr('Apagar TODOS os dados locais (layout, desenhos, sessões, estratégias)? Os dados na nuvem mantêm-se.'))) return;
                Object.keys(localStorage)
                  .filter((k) => k.startsWith('rx-'))
                  .forEach((k) => localStorage.removeItem(k));
                location.reload();
              }}
            >
              {tr('Apagar dados locais')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Interruptor da poupança de dados, com o estado atual (e porquê, se for automático). */
function DataSaverRow() {
  const s = useSettings();
  const reason = useSaverReason();
  const why = reason === 'manual' ? tr('ligada') : reason === 'browser' ? tr('ligada (o navegador pede poupança de dados)') : reason === 'slow' ? tr('ligada (ligação lenta)') : tr('desligada');
  return (
    <Row label={tr('Poupança de dados — agora {0}. Quando ligada: lista de observação a cada 15 s ou mais, histórico automático dos indicadores até 5 000 velas sem perguntar, e o tempo real pára 10 s depois de a app ir para segundo plano', why)}>
      <Select className="w-44" value={s.dataSaver} onChange={(e) => s.set({ dataSaver: e.target.value as DataSaverSetting })} data-testid="data-saver">
        <option value="auto">{tr('Automática')}</option>
        <option value="on">{tr('Ligada')}</option>
        <option value="off">{tr('Desligada')}</option>
      </Select>
    </Row>
  );
}

/** Quantos dados a app consumiu: nesta sessão, hoje e este mês, por origem. */
function DataUsage() {
  const m = useDataMeter();
  const rows: { label: string; hint: string; get: (c: typeof m.session) => number }[] = [
    { label: tr('Histórico'), hint: tr('velas descarregadas ao abrir, mudar de símbolo/intervalo ou procurar mais passado'), get: (c) => c.history },
    { label: tr('Tempo real'), hint: tr('preços e velas a chegar em direto (gráfico e lista de observação)'), get: (c) => c.live },
    { label: tr('Outros'), hint: tr('notícias e calendário'), get: (c) => c.other },
  ];
  const cols: { id: string; title: string; c: typeof m.session }[] = [
    { id: 'session', title: tr('Esta sessão'), c: m.session },
    { id: 'today', title: tr('Hoje'), c: m.today },
    { id: 'month', title: tr('Este mês'), c: m.monthly },
  ];
  return (
    <section className="rounded-lg border border-line p-3" data-testid="data-usage">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">{tr('Consumo de dados')}</h3>
        <button type="button" className="text-xs text-muted hover:text-text" onClick={() => resetDataMeter('all')} data-testid="data-usage-reset">
          {tr('Repor contadores')}
        </button>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 font-normal" />
            {cols.map((c) => (
              <th key={c.id} className="py-1 text-right font-normal">
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} title={r.hint}>
              <td className="py-0.5">{r.label}</td>
              {cols.map((c) => (
                <td key={c.id} className="py-0.5 text-right tnum" data-testid={`usage-${r.label}-${c.id}`}>
                  {fmtBytes(r.get(c.c))}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-line font-semibold">
            <td className="py-1">Total</td>
            {cols.map((c) => (
              <td key={c.id} className="py-1 text-right tnum" data-testid={`usage-total-${c.id}`}>
                {fmtBytes(meterTotal(c.c))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-snug text-muted">
        {tr('Valores aproximados do que a app recebeu (texto das respostas, sem a compressão da rede). Não inclui o carregamento da própria app (cerca de 400 KB na primeira vez e depois fica guardada) nem a sincronização da conta.')}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- aparência

function useLook() {
  const a = useSettings((s) => s.appearance);
  const dark = useSettings((s) => s.theme === 'dark');
  const set = (patch: Partial<Appearance>) => useSettings.getState().set({ appearance: { ...useSettings.getState().appearance, ...patch } });
  return { a, dark, set };
}

function Section({ title }: { title: string }) {
  return <div className="pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</div>;
}

/** Par de cores alta/baixa; `null` = automático. */
function UpDown({ label, up, down, autoUp, autoDown, onUp, onDown, show, onShow }: { label: string; up: string | null; down: string | null; autoUp: string; autoDown: string; onUp: (c: string | null) => void; onDown: (c: string | null) => void; show?: boolean; onShow?: (v: boolean) => void }) {
  return (
    <Row label={label}>
      {onShow && <Switch checked={!!show} onChange={onShow} />}
      <ColorPicker label={tr('{0} — alta', label)} value={up ?? autoUp} isAuto={up === null} onReset={() => onUp(null)} onChange={onUp} />
      <ColorPicker label={tr('{0} — baixa', label)} value={down ?? autoDown} isAuto={down === null} onReset={() => onDown(null)} onChange={onDown} />
    </Row>
  );
}

/** Aplica um estilo (pré-definido ou do utilizador) no modo atual. */
function applyPreset(p: ChartPreset, quiet = false) {
  const st = useSettings.getState();
  const patch = presetPatch(p, st.theme === 'dark');
  st.set({ chartStyle: p.id, upColor: patch.upColor, downColor: patch.downColor, appearance: { ...st.appearance, ...patch.appearance } });
  if (!quiet) toast(tr('Estilo “{0}” aplicado', p.name), { kind: 'success' });
}

/** Miniatura de um estilo: cinco velas sobre o fundo, com o nome por baixo. */
function PresetCard({ p, dark, active, testId }: { p: ChartPreset; dark: boolean; active: boolean; testId: string }) {
  const c = dark ? p.dark : p.light;
  const bg = c.background ?? (dark ? '#131722' : '#ffffff');
  const ap = presetPatch(p, dark).appearance;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => applyPreset(p)}
      className={`w-full rounded-md border p-1.5 text-left text-[11px] hover:border-accent ${active ? 'border-accent' : 'border-line'}`}
    >
      <svg viewBox="0 0 60 28" className="mb-1 block h-8 w-full rounded-sm" style={{ background: c.background2 ? `linear-gradient(${bg}, ${c.background2})` : bg }} aria-hidden>
        {c.up2 && c.down2 && (
          <defs>
            <linearGradient id={`gu-${p.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={c.up} />
              <stop offset="1" stopColor={c.up2} />
            </linearGradient>
            <linearGradient id={`gd-${p.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={c.down} />
              <stop offset="1" stopColor={c.down2} />
            </linearGradient>
          </defs>
        )}
        {[
          [6, 8, 18, c.up, true],
          [18, 12, 22, c.down, false],
          [30, 6, 16, c.up, true],
          [42, 10, 20, c.down, false],
          [54, 4, 14, c.up, true],
        ].map(([x, y, h, col, isUp], i) => {
          const line = ap.showBorder ? (isUp ? ap.borderUp : ap.borderDown) ?? (col as string) : (col as string);
          const fill = c.up2 ? `url(#${isUp ? 'gu' : 'gd'}-${p.id})` : c.border ? bg : (col as string);
          return (
            <g key={i}>
              <line x1={x as number} x2={x as number} y1={(y as number) - 3} y2={(y as number) + (h as number) + 3} stroke={line} strokeWidth="1" />
              <rect x={(x as number) - 3} y={y as number} width="6" height={h as number} fill={fill} stroke={line} strokeWidth="1" />
            </g>
          );
        })}
      </svg>
      <span className="block truncate">{p.name}</span>
    </button>
  );
}

/** Estilos das cores do gráfico: pré-definidos e os do utilizador, num menu expansível, com ◀ ▶ para passar de um ao outro. */
function PresetsMenu() {
  const [open, setOpen] = useState(false);
  const active = useSettings((st) => st.chartStyle);
  const dark = useSettings((st) => st.theme === 'dark');
  const mine = useSettings((st) => st.userPresets);
  const all = [...CHART_PRESETS, ...mine];
  const idx = all.findIndex((p) => p.id === active);
  const step = (dir: 1 | -1) => {
    if (!all.length) return;
    const i = idx < 0 ? (dir === 1 ? 0 : all.length - 1) : (idx + dir + all.length) % all.length;
    applyPreset(all[i], true);
  };
  const save = () => {
    const name = prompt(tr('Nome do tema'), tr('Meu tema {0}', mine.length + 1))?.trim();
    if (!name) return;
    const st = useSettings.getState();
    const p = presetFromLook(uid('t'), name, st.theme === 'dark', st.upColor, st.downColor, st.appearance);
    st.set({ userPresets: [...st.userPresets, p], chartStyle: p.id });
    toast(tr('Tema “{0}” guardado', name), { kind: 'success', body: tr('Tem versão clara e escura: o botão sol/lua troca entre elas.') });
    setOpen(true);
  };
  const rename = (p: ChartPreset) => {
    const name = prompt(tr('Novo nome'), p.name)?.trim();
    if (!name) return;
    const st = useSettings.getState();
    st.set({ userPresets: st.userPresets.map((x) => (x.id === p.id ? { ...x, name } : x)) });
  };
  const remove = (p: ChartPreset) => {
    if (!confirm(tr('Apagar o tema “{0}”?', p.name))) return;
    const st = useSettings.getState();
    st.set({ userPresets: st.userPresets.filter((x) => x.id !== p.id), ...(st.chartStyle === p.id ? { chartStyle: null } : {}) });
  };
  const arrow = 'flex h-9 w-8 shrink-0 items-center justify-center text-muted hover:bg-hover hover:text-text';
  return (
    <div className="mb-3 rounded-md border border-line" data-testid="chart-presets">
      <div className="flex items-stretch">
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-sm font-medium hover:bg-hover">
          <span className="truncate">
            {tr('Estilos pré-definidos')}
            {idx >= 0 && <span className="ml-2 text-xs font-normal text-muted">· {all[idx].name}</span>}
          </span>
          <span className="text-xs text-muted">{open ? '▲' : '▼'}</span>
        </button>
        <button type="button" className={arrow} title={tr('Estilo anterior')} aria-label={tr('Estilo anterior')} data-testid="preset-prev" onClick={() => step(-1)}>
          ◀
        </button>
        <button type="button" className={arrow} title={tr('Estilo seguinte')} aria-label={tr('Estilo seguinte')} data-testid="preset-next" onClick={() => step(1)}>
          ▶
        </button>
      </div>
      {open && (
        <>
          <p className="px-3 pt-2 text-[11px] text-muted">{tr('Cada estilo tem versão clara e escura: o botão sol/lua do topo troca entre elas.')}</p>
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto p-2 sm:grid-cols-5">
            {CHART_PRESETS.map((p) => (
              <PresetCard key={p.id} p={p} dark={dark} active={active === p.id} testId={`preset-${p.id}`} />
            ))}
          </div>
          <div className="border-t border-line p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{tr('Os meus temas')}</span>
              <Button size="sm" variant="outline" data-testid="preset-save" onClick={save}>
                {tr('Guardar as cores atuais como tema…')}
              </Button>
            </div>
            {mine.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {mine.map((p) => (
                  <div key={p.id} className="relative">
                    <PresetCard p={p} dark={dark} active={active === p.id} testId={`preset-${p.id}`} />
                    <div className="absolute top-1 right-1 flex gap-0.5">
                      <button type="button" className="rounded bg-black/50 px-1 text-[10px] text-white hover:bg-black/70" title={tr('Mudar o nome')} aria-label={tr('Mudar o nome')} onClick={() => rename(p)}>
                        ✎
                      </button>
                      <button type="button" className="rounded bg-black/50 px-1 text-[10px] text-white hover:bg-black/70" title={tr('Apagar')} aria-label={tr('Apagar')} data-testid={`preset-del-${p.id}`} onClick={() => remove(p)}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted">{tr('Ajuste as cores do gráfico (velas, fundo, grelha) e guarde-as aqui como tema seu. Fica na sua conta.')}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SymbolTab() {
  const { a, set } = useLook();
  const s = useSettings();
  const up = a.bodyUp ?? s.upColor;
  const down = a.bodyDown ?? s.downColor;
  return (
    <div className="divide-y divide-line" data-testid="settings-symbol">
      <Section title={tr('Velas')} />
      <Row label={tr('Cores base (alta / baixa)')}>
        <ColorPicker label={tr('Alta')} value={s.upColor} onChange={(c) => s.set({ upColor: c })} />
        <ColorPicker label={tr('Baixa')} value={s.downColor} onChange={(c) => s.set({ downColor: c })} />
      </Row>
      <Row label={tr('Gradiente no corpo (cor de cima → cor de baixo)')}>
        <Switch checked={a.gradient} onChange={(v) => set({ gradient: v })} />
        {a.gradient && (
          <>
            <ColorPicker label={tr('Alta — cor de baixo')} value={a.bodyUp2 ?? shade(up, -0.22)} isAuto={a.bodyUp2 === null} onReset={() => set({ bodyUp2: null })} onChange={(c) => set({ bodyUp2: c })} />
            <ColorPicker label={tr('Baixa — cor de baixo')} value={a.bodyDown2 ?? shade(down, -0.22)} isAuto={a.bodyDown2 === null} onReset={() => set({ bodyDown2: null })} onChange={(c) => set({ bodyDown2: c })} />
          </>
        )}
      </Row>
      <UpDown label={tr('Corpo')} up={a.bodyUp} down={a.bodyDown} autoUp={s.upColor} autoDown={s.downColor} onUp={(c) => set({ bodyUp: c })} onDown={(c) => set({ bodyDown: c })} show={a.showBody} onShow={(v) => set({ showBody: v })} />
      <UpDown label={tr('Borda')} up={a.borderUp} down={a.borderDown} autoUp={up} autoDown={down} onUp={(c) => set({ borderUp: c })} onDown={(c) => set({ borderDown: c })} show={a.showBorder} onShow={(v) => set({ showBorder: v })} />
      <UpDown label={tr('Pavio')} up={a.wickUp} down={a.wickDown} autoUp={up} autoDown={down} onUp={(c) => set({ wickUp: c })} onDown={(c) => set({ wickDown: c })} show={a.showWick} onShow={(v) => set({ showWick: v })} />
      <Section title={tr('Linha e área')} />
      <Row label={tr('Cor e espessura')}>
        <ColorPicker label={tr('Cor da linha')} value={a.lineColor} onChange={(c) => set({ lineColor: c })} />
        <Select className="w-20" value={a.lineWidth} onChange={(e) => set({ lineWidth: Number(e.target.value) as Appearance['lineWidth'] })}>
          {[1, 2, 3, 4].map((w) => (
            <option key={w} value={w}>
              {w}px
            </option>
          ))}
        </Select>
      </Row>
    </div>
  );
}

function ScalesTab() {
  const { a, set } = useLook();
  return (
    <div className="divide-y divide-line" data-testid="settings-scales">
      <Row label={tr('Escala de preços')}>
        <Select className="w-44" value={a.scaleMode} onChange={(e) => set({ scaleMode: e.target.value as Appearance['scaleMode'] })}>
          <option value="normal">{tr('Normal')}</option>
          <option value="log">{tr('Logarítmica')}</option>
          <option value="percent">{tr('Percentagem')}</option>
          <option value="indexed">{tr('Indexada a 100')}</option>
        </Select>
      </Row>
      <Row label={tr('Etiqueta do último preço')}>
        <Switch checked={a.lastValueLabel} onChange={(v) => set({ lastValueLabel: v })} />
      </Row>
      <Row label={tr('Linha do último preço')}>
        <Switch checked={a.priceLine} onChange={(v) => set({ priceLine: v })} />
      </Row>
      <Row label={tr('Contagem até ao fecho da vela')}>
        <Switch checked={a.countdown} onChange={(v) => set({ countdown: v })} />
      </Row>
      <Row label={tr('Tamanho do texto das escalas')}>
        <Select className="w-20" value={a.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })}>
          {[10, 11, 12, 13, 14, 16].map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      </Row>
    </div>
  );
}

function CanvasTab() {
  const { a, dark, set } = useLook();
  const s = useSettings();
  const d = themeDefaults(dark);
  return (
    <div className="divide-y divide-line" data-testid="settings-canvas">
      <Row label={tr('Fundo')}>
        <Select className="w-32" value={a.background2 ? 'gradient' : 'solid'} onChange={(e) => set({ background2: e.target.value === 'gradient' ? (a.background2 ?? (dark ? '#1e222d' : '#e3effd')) : null })}>
          <option value="solid">{tr('Cor única')}</option>
          <option value="gradient">{tr('Gradiente')}</option>
        </Select>
        <ColorPicker label={tr('Fundo (cima)')} value={a.background ?? d.background} isAuto={a.background === null} onReset={() => set({ background: null })} onChange={(c) => set({ background: c })} />
        {a.background2 && <ColorPicker label={tr('Fundo (baixo)')} value={a.background2} onChange={(c) => set({ background2: c })} />}
      </Row>
      <Row label={tr('Linhas verticais da grelha')}>
        <Switch checked={a.gridVertVisible} onChange={(v) => set({ gridVertVisible: v })} />
        <ColorPicker label={tr('Grelha vertical')} value={a.gridVert ?? d.grid} isAuto={a.gridVert === null} onReset={() => set({ gridVert: null })} onChange={(c) => set({ gridVert: c })} />
      </Row>
      <Row label={tr('Linhas horizontais da grelha')}>
        <Switch checked={a.gridHorzVisible} onChange={(v) => set({ gridHorzVisible: v })} />
        <ColorPicker label={tr('Grelha horizontal')} value={a.gridHorz ?? d.grid} isAuto={a.gridHorz === null} onReset={() => set({ gridHorz: null })} onChange={(c) => set({ gridHorz: c })} />
      </Row>
      <Row label={tr('Mira (crosshair)')}>
        <Select className="w-32" value={a.crosshairStyle} onChange={(e) => set({ crosshairStyle: Number(e.target.value) as Appearance['crosshairStyle'] })}>
          <option value={0}>{tr('Contínua')}</option>
          <option value={1}>{tr('Pontilhada')}</option>
          <option value={2}>{tr('Tracejada')}</option>
          <option value={3}>{tr('Tracejado largo')}</option>
        </Select>
        <ColorPicker label={tr('Cor da mira')} value={a.crosshair ?? d.crosshair} isAuto={a.crosshair === null} onReset={() => set({ crosshair: null })} onChange={(c) => set({ crosshair: c })} />
      </Row>
      <Row label={tr('Texto das escalas')}>
        <ColorPicker label={tr('Cor do texto')} value={a.textColor ?? d.text} isAuto={a.textColor === null} onReset={() => set({ textColor: null })} onChange={(c) => set({ textColor: c })} />
      </Row>
      <Row label={tr('Marca de água com o símbolo')}>
        <Switch checked={s.showWatermark} onChange={(v) => s.set({ showWatermark: v })} />
        <ColorPicker label={tr('Cor da marca de água')} value={a.watermarkColor ?? d.watermark} isAuto={a.watermarkColor === null} onReset={() => set({ watermarkColor: null })} onChange={(c) => set({ watermarkColor: c })} />
      </Row>
    </div>
  );
}
