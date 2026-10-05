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
import { DEFAULT_APPEARANCE, themeDefaults, type Appearance } from '@/chart/appearance';

export function SettingsDialog() {
  const open = useUi((s) => s.settings);
  const s = useSettings();
  const pauseOnFill = useReplay((r) => r.pauseOnFill);
  const [tab, setTab] = useState<'symbol' | 'scales' | 'canvas' | 'chart' | 'trading' | 'replay' | 'data'>('symbol');
  if (!open) return null;
  const close = () => useUi.getState().set({ settings: false });
  const t = s.trading;
  return (
    <Dialog open onClose={close} title="Definições do gráfico" width={560} footer={<Button variant="primary" onClick={close}>Fechar</Button>}>
      <Tabs
        className="mb-3"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'symbol', label: 'Símbolo' },
          { value: 'scales', label: 'Escalas' },
          { value: 'canvas', label: 'Canvas' },
          { value: 'chart', label: 'Geral' },
          { value: 'trading', label: 'Negociação' },
          { value: 'replay', label: 'Replay' },
          { value: 'data', label: 'Dados' },
        ]}
      />
      {tab === 'symbol' && <SymbolTab />}
      {tab === 'scales' && <ScalesTab />}
      {tab === 'canvas' && <CanvasTab />}
      {tab === 'chart' && (
        <div className="divide-y divide-line">
          <Row label="Tema">
            <Segmented
              value={s.theme}
              onChange={(v) => s.set({ theme: v })}
              items={[
                { value: 'dark', label: 'Escuro' },
                { value: 'light', label: 'Claro' },
              ]}
            />
          </Row>
          <Row label="Fuso horário">
            <Select className="w-52" value={s.timezone} onChange={(e) => s.set({ timezone: e.target.value })}>
              {TIMEZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Sons">
            <Switch checked={s.sound} onChange={(v) => s.set({ sound: v })} />
          </Row>
          <Row label="Lupa ao desenhar com o dedo">
            <Switch checked={s.loupe} onChange={(v) => s.set({ loupe: v })} />
          </Row>
          <Row label="Vibração ao rodar símbolo e intervalo">
            <Switch checked={s.haptics} onChange={(v) => s.set({ haptics: v })} />
          </Row>
          <Row label="Posição da lupa">
            <Select className="w-52" value={s.loupePos} onChange={(e) => s.set({ loupePos: e.target.value as LoupePos })} data-testid="loupe-pos">
              <option value="top-right">Canto superior direito</option>
              <option value="top-left">Canto superior esquerdo</option>
              <option value="bottom-right">Canto inferior direito</option>
              <option value="bottom-left">Canto inferior esquerdo</option>
              <option value="follow">Junto ao dedo</option>
            </Select>
          </Row>
          <div className="pt-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                s.set({ appearance: DEFAULT_APPEARANCE, upColor: '#089981', downColor: '#f23645', showWatermark: true });
                toast('Aparência reposta', { kind: 'success' });
              }}
            >
              Repor a aparência do gráfico
            </Button>
          </div>
        </div>
      )}
      {tab === 'trading' && (
        <div className="divide-y divide-line">
          <Row label="Saldo inicial da conta (USD)">
            <NumberInput className="w-32" value={t.initialBalance} min={10} step={1000} onChange={(v) => v !== undefined && s.setTrading({ initialBalance: v })} />
          </Row>
          <Row label="Quantidade padrão (lotes)">
            <NumberInput className="w-32" value={t.defaultQty} min={0.0001} step={0.01} onChange={(v) => v !== undefined && s.setTrading({ defaultQty: v })} />
          </Row>
          <Row label="Risco padrão por operação (%)">
            <NumberInput className="w-32" value={t.defaultRiskPct} min={0.01} max={100} step={0.25} onChange={(v) => v !== undefined && s.setTrading({ defaultRiskPct: v })} />
          </Row>
          <Row label="Spread (pips/pontos)">
            <NumberInput className="w-32" value={t.spreadPoints} min={0} step={0.1} onChange={(v) => v !== undefined && s.setTrading({ spreadPoints: v })} />
          </Row>
          <Row label="Deslizamento (pips/pontos)">
            <NumberInput className="w-32" value={t.slippagePoints} min={0} step={0.1} onChange={(v) => v !== undefined && s.setTrading({ slippagePoints: v })} />
          </Row>
          <Row label="Comissão">
            <Select className="w-32" value={t.commission.type} onChange={(e) => s.setTrading({ commission: { ...t.commission, type: e.target.value as 'none' | 'percent' | 'perLot' } })}>
              <option value="none">Nenhuma</option>
              <option value="percent">% do valor</option>
              <option value="perLot">$ por lote</option>
            </Select>
            {t.commission.type !== 'none' && <NumberInput className="w-24" value={t.commission.value} min={0} step={0.01} onChange={(v) => v !== undefined && s.setTrading({ commission: { ...t.commission, value: v } })} />}
          </Row>
          <div className="flex flex-wrap gap-2 pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!confirm('Repor a conta demo em tempo real? As operações dessa conta serão apagadas.')) return;
                useTrading.getState().resetAccount('live', t.initialBalance);
                toast('Conta demo reposta', { kind: 'success' });
              }}
            >
              Repor conta demo (tempo real)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => s.setTrading(DEFAULT_TRADING)}>
              Valores padrão
            </Button>
          </div>
        </div>
      )}
      {tab === 'replay' && (
        <div className="divide-y divide-line">
          <Row label="Execução de ordens com dados finos (mais preciso)">
            <Switch checked={s.replayIntrabar} onChange={(v) => s.set({ replayIntrabar: v })} />
          </Row>
          <Row label="Pausar quando uma ordem executa">
            <Switch checked={pauseOnFill} onChange={(v) => useReplay.setState({ pauseOnFill: v })} />
          </Row>
          <p className="pt-3 text-xs leading-relaxed text-muted">
            Com dados finos, o SL/TP é verificado com velas mais pequenas dentro de cada passo (ex.: 1m dentro de 1h), como um “bar magnifier”. Desligue para um replay mais rápido em
            ligações lentas.
          </p>
        </div>
      )}
      {tab === 'data' && (
        <div className="flex flex-col gap-3">
          <LegalFooter className="rounded-lg bg-sunken p-3" />
          <p className="text-xs leading-relaxed text-muted">
            Fontes: <b>Deriv</b> (índices sintéticos, forex, metais e índices — WebSocket público), <b>Binance</b> (cripto) e <b>Yahoo Finance</b> (ações, índices e futuros). Os dados ficam em memória
            enquanto a página está aberta.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                dataFeed().clear();
                toast('Cache de dados limpa', { kind: 'success', body: 'Os gráficos vão voltar a descarregar os dados.' });
              }}
            >
              Limpar cache de dados
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (!confirm('Apagar TODOS os dados locais (layout, desenhos, sessões, estratégias)? Os dados na nuvem mantêm-se.')) return;
                Object.keys(localStorage)
                  .filter((k) => k.startsWith('rx-'))
                  .forEach((k) => localStorage.removeItem(k));
                location.reload();
              }}
            >
              Apagar dados locais
            </Button>
          </div>
        </div>
      )}
    </Dialog>
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
      <ColorPicker label={`${label} — alta`} value={up ?? autoUp} isAuto={up === null} onReset={() => onUp(null)} onChange={onUp} />
      <ColorPicker label={`${label} — baixa`} value={down ?? autoDown} isAuto={down === null} onReset={() => onDown(null)} onChange={onDown} />
    </Row>
  );
}

function SymbolTab() {
  const { a, set } = useLook();
  const s = useSettings();
  const up = a.bodyUp ?? s.upColor;
  const down = a.bodyDown ?? s.downColor;
  return (
    <div className="divide-y divide-line" data-testid="settings-symbol">
      <Section title="Velas" />
      <Row label="Cores base (alta / baixa)">
        <ColorPicker label="Alta" value={s.upColor} onChange={(c) => s.set({ upColor: c })} />
        <ColorPicker label="Baixa" value={s.downColor} onChange={(c) => s.set({ downColor: c })} />
      </Row>
      <UpDown label="Corpo" up={a.bodyUp} down={a.bodyDown} autoUp={s.upColor} autoDown={s.downColor} onUp={(c) => set({ bodyUp: c })} onDown={(c) => set({ bodyDown: c })} show={a.showBody} onShow={(v) => set({ showBody: v })} />
      <UpDown label="Borda" up={a.borderUp} down={a.borderDown} autoUp={up} autoDown={down} onUp={(c) => set({ borderUp: c })} onDown={(c) => set({ borderDown: c })} show={a.showBorder} onShow={(v) => set({ showBorder: v })} />
      <UpDown label="Pavio" up={a.wickUp} down={a.wickDown} autoUp={up} autoDown={down} onUp={(c) => set({ wickUp: c })} onDown={(c) => set({ wickDown: c })} show={a.showWick} onShow={(v) => set({ showWick: v })} />
      <Section title="Linha e área" />
      <Row label="Cor e espessura">
        <ColorPicker label="Cor da linha" value={a.lineColor} onChange={(c) => set({ lineColor: c })} />
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
      <Row label="Escala de preços">
        <Select className="w-44" value={a.scaleMode} onChange={(e) => set({ scaleMode: e.target.value as Appearance['scaleMode'] })}>
          <option value="normal">Normal</option>
          <option value="log">Logarítmica</option>
          <option value="percent">Percentagem</option>
          <option value="indexed">Indexada a 100</option>
        </Select>
      </Row>
      <Row label="Etiqueta do último preço">
        <Switch checked={a.lastValueLabel} onChange={(v) => set({ lastValueLabel: v })} />
      </Row>
      <Row label="Linha do último preço">
        <Switch checked={a.priceLine} onChange={(v) => set({ priceLine: v })} />
      </Row>
      <Row label="Contagem até ao fecho da vela">
        <Switch checked={a.countdown} onChange={(v) => set({ countdown: v })} />
      </Row>
      <Row label="Tamanho do texto das escalas">
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
      <Row label="Fundo">
        <Select className="w-32" value={a.background2 ? 'gradient' : 'solid'} onChange={(e) => set({ background2: e.target.value === 'gradient' ? (a.background2 ?? (dark ? '#1e222d' : '#e3effd')) : null })}>
          <option value="solid">Cor única</option>
          <option value="gradient">Gradiente</option>
        </Select>
        <ColorPicker label="Fundo (cima)" value={a.background ?? d.background} isAuto={a.background === null} onReset={() => set({ background: null })} onChange={(c) => set({ background: c })} />
        {a.background2 && <ColorPicker label="Fundo (baixo)" value={a.background2} onChange={(c) => set({ background2: c })} />}
      </Row>
      <Row label="Linhas verticais da grelha">
        <Switch checked={a.gridVertVisible} onChange={(v) => set({ gridVertVisible: v })} />
        <ColorPicker label="Grelha vertical" value={a.gridVert ?? d.grid} isAuto={a.gridVert === null} onReset={() => set({ gridVert: null })} onChange={(c) => set({ gridVert: c })} />
      </Row>
      <Row label="Linhas horizontais da grelha">
        <Switch checked={a.gridHorzVisible} onChange={(v) => set({ gridHorzVisible: v })} />
        <ColorPicker label="Grelha horizontal" value={a.gridHorz ?? d.grid} isAuto={a.gridHorz === null} onReset={() => set({ gridHorz: null })} onChange={(c) => set({ gridHorz: c })} />
      </Row>
      <Row label="Mira (crosshair)">
        <Select className="w-32" value={a.crosshairStyle} onChange={(e) => set({ crosshairStyle: Number(e.target.value) as Appearance['crosshairStyle'] })}>
          <option value={0}>Contínua</option>
          <option value={1}>Pontilhada</option>
          <option value={2}>Tracejada</option>
          <option value={3}>Tracejado largo</option>
        </Select>
        <ColorPicker label="Cor da mira" value={a.crosshair ?? d.crosshair} isAuto={a.crosshair === null} onReset={() => set({ crosshair: null })} onChange={(c) => set({ crosshair: c })} />
      </Row>
      <Row label="Texto das escalas">
        <ColorPicker label="Cor do texto" value={a.textColor ?? d.text} isAuto={a.textColor === null} onReset={() => set({ textColor: null })} onChange={(c) => set({ textColor: c })} />
      </Row>
      <Row label="Marca de água com o símbolo">
        <Switch checked={s.showWatermark} onChange={(v) => s.set({ showWatermark: v })} />
        <ColorPicker label="Cor da marca de água" value={a.watermarkColor ?? d.watermark} isAuto={a.watermarkColor === null} onReset={() => set({ watermarkColor: null })} onChange={(c) => set({ watermarkColor: c })} />
      </Row>
    </div>
  );
}
