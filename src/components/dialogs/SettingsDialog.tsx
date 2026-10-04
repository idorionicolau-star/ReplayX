'use client';
import { useState } from 'react';
import { useUi } from '@/store/ui';
import { useSettings, TIMEZONES, DEFAULT_TRADING } from '@/store/settings';
import { useTrading } from '@/store/trading';
import { useReplay } from '@/replay/engine';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { NumberInput, Row, Select, Switch } from '@/components/ui/Field';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Tabs, Segmented } from '@/components/ui/Tabs';
import { dataFeed } from '@/core/feed/datafeed';
import { toast } from '@/components/ui/Toast';

export function SettingsDialog() {
  const open = useUi((s) => s.settings);
  const s = useSettings();
  const pauseOnFill = useReplay((r) => r.pauseOnFill);
  const [tab, setTab] = useState<'chart' | 'trading' | 'replay' | 'data'>('chart');
  if (!open) return null;
  const close = () => useUi.getState().set({ settings: false });
  const t = s.trading;
  return (
    <Dialog open onClose={close} title="Definições" width={520} footer={<Button variant="primary" onClick={close}>Fechar</Button>}>
      <Tabs
        className="mb-3"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'chart', label: 'Gráfico' },
          { value: 'trading', label: 'Negociação' },
          { value: 'replay', label: 'Replay' },
          { value: 'data', label: 'Dados' },
        ]}
      />
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
          <Row label="Velas de alta / baixa">
            <ColorPicker value={s.upColor} onChange={(c) => s.set({ upColor: c })} />
            <ColorPicker value={s.downColor} onChange={(c) => s.set({ downColor: c })} />
          </Row>
          <Row label="Grelha">
            <Switch checked={s.showGrid} onChange={(v) => s.set({ showGrid: v })} />
          </Row>
          <Row label="Marca de água com o símbolo">
            <Switch checked={s.showWatermark} onChange={(v) => s.set({ showWatermark: v })} />
          </Row>
          <Row label="Escala logarítmica">
            <Switch checked={s.logScale} onChange={(v) => s.set({ logScale: v })} />
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
            Com dados finos, o SL/TP é verificado com velas mais pequenas dentro de cada passo (ex.: 1m dentro de 1h), como o “bar magnifier” do TradingView. Desligue para um replay mais rápido em
            ligações lentas.
          </p>
        </div>
      )}
      {tab === 'data' && (
        <div className="flex flex-col gap-3">
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
