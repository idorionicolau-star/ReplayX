import type { Bar } from '../types';
import * as ta from './ta';
import { apocalypse, readingLines } from './apocalypse';
import type { MaType, Series, Source } from './ta';

export type InputType = 'int' | 'float' | 'source' | 'bool' | 'select' | 'ma';
export type ParamValue = number | string | boolean;

export interface InputDef {
  key: string;
  label: string;
  type: InputType;
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

export type PlotStyle = 'line' | 'histogram' | 'area' | 'step' | 'dots';

export interface OutputDef {
  key: string;
  label: string;
  style: PlotStyle;
  color: string;
  width?: number;
  /** Desloca o gráfico N barras (positivo = para o futuro). */
  offset?: (p: Record<string, ParamValue>) => number;
  /** Linha só com vértices (ex.: ZigZag) — ligada entre pontos. */
  sparse?: boolean;
  hiddenByDefault?: boolean;
}

export interface IndicatorMarker {
  index: number;
  position: 'above' | 'below';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color: string;
  text?: string;
}

export interface IndicatorResult {
  values: Record<string, Series>;
  /** Cor por barra (histogramas coloridos, supertrend…). */
  colors?: Record<string, (string | undefined)[]>;
  markers?: IndicatorMarker[];
}

export interface IndicatorDef {
  id: string;
  name: string;
  short: string;
  category: 'Médias móveis' | 'Tendência' | 'Osciladores' | 'Volatilidade' | 'Volume' | 'Outros';
  overlay: boolean;
  /** Escala própria no painel principal (ex.: volume em baixo). */
  overlayScale?: 'volume';
  inputs: InputDef[];
  outputs: OutputDef[];
  fills?: { a: string; b: string; color: string }[];
  levels?: { value: number; color?: string; label?: string }[];
  scale?: { min?: number; max?: number };
  description: string;
  compute(bars: readonly Bar[], p: Record<string, ParamValue>): IndicatorResult;
}

const UP = '#089981';
const DOWN = '#f23645';

const srcInput = (def: Source = 'close'): InputDef => ({
  key: 'source',
  label: 'Fonte',
  type: 'source',
  default: def,
  options: ta.SOURCES.map((s) => ({ value: s, label: s })),
});
const lenInput = (def: number, label = 'Período', key = 'length'): InputDef => ({ key, label, type: 'int', default: def, min: 1, max: 2000, step: 1 });
const numInput = (key: string, label: string, def: number, step = 0.1, min = 0, max = 100): InputDef => ({ key, label, type: 'float', default: def, min, max, step });

const n = (p: Record<string, ParamValue>, k: string) => Number(p[k]);
const s = (p: Record<string, ParamValue>, k: string) => String(p[k]);
const src = (bars: readonly Bar[], p: Record<string, ParamValue>) => ta.source(bars, (p.source as Source) ?? 'close');

function maDef(id: MaType | 'vwma', name: string, color: string, def = 20): IndicatorDef {
  return {
    id,
    name,
    short: id.toUpperCase(),
    category: 'Médias móveis',
    overlay: true,
    description: `${name} do preço.`,
    inputs: [lenInput(def), srcInput()],
    outputs: [{ key: 'ma', label: id.toUpperCase(), style: 'line', color, width: 2 }],
    compute(bars, p) {
      const x = src(bars, p);
      if (id === 'vwma') return { values: { ma: ta.vwma(x, ta.source(bars, 'volume'), n(p, 'length')) } };
      return { values: { ma: ta.ma(id, x, n(p, 'length')) } };
    },
  };
}

const MA_OPTIONS = ta.MA_TYPES.map((m) => ({ value: m, label: m.toUpperCase() }));

export const INDICATORS: IndicatorDef[] = [
  maDef('sma', 'Média Móvel Simples', '#2962ff'),
  maDef('ema', 'Média Móvel Exponencial', '#ff9800'),
  maDef('wma', 'Média Móvel Ponderada', '#9c27b0'),
  maDef('hma', 'Hull Moving Average', '#00bcd4'),
  maDef('dema', 'Média Exponencial Dupla', '#e91e63'),
  maDef('tema', 'Média Exponencial Tripla', '#8bc34a'),
  maDef('vwma', 'Média Ponderada por Volume', '#795548'),
  {
    id: 'macross',
    name: 'Cruzamento de Médias',
    short: 'MA Cross',
    category: 'Médias móveis',
    overlay: true,
    description: 'Duas médias com setas nos cruzamentos.',
    inputs: [
      lenInput(9, 'Rápida', 'fast'),
      lenInput(21, 'Lenta', 'slow'),
      { key: 'type', label: 'Tipo', type: 'ma', default: 'ema', options: MA_OPTIONS },
      srcInput(),
    ],
    outputs: [
      { key: 'fast', label: 'Rápida', style: 'line', color: '#2962ff', width: 2 },
      { key: 'slow', label: 'Lenta', style: 'line', color: '#ff6d00', width: 2 },
    ],
    compute(bars, p) {
      const x = src(bars, p);
      const t = s(p, 'type') as MaType;
      const fast = ta.ma(t, x, n(p, 'fast'));
      const slow = ta.ma(t, x, n(p, 'slow'));
      const up = ta.crossover(fast, slow);
      const dn = ta.crossunder(fast, slow);
      const markers: IndicatorMarker[] = [];
      up.forEach((c, i) => c && markers.push({ index: i, position: 'below', shape: 'arrowUp', color: UP }));
      dn.forEach((c, i) => c && markers.push({ index: i, position: 'above', shape: 'arrowDown', color: DOWN }));
      return { values: { fast, slow }, markers };
    },
  },
  {
    id: 'bb',
    name: 'Bandas de Bollinger',
    short: 'BB',
    category: 'Volatilidade',
    overlay: true,
    description: 'Média com bandas de desvio-padrão.',
    inputs: [lenInput(20), numInput('mult', 'Desvios', 2, 0.1, 0.1, 10), srcInput()],
    outputs: [
      { key: 'basis', label: 'Base', style: 'line', color: '#ff6d00', width: 1 },
      { key: 'upper', label: 'Superior', style: 'line', color: '#2962ff', width: 1 },
      { key: 'lower', label: 'Inferior', style: 'line', color: '#2962ff', width: 1 },
    ],
    fills: [{ a: 'upper', b: 'lower', color: 'rgba(33,150,243,0.08)' }],
    compute(bars, p) {
      return { values: ta.bollinger(src(bars, p), n(p, 'length'), n(p, 'mult')) };
    },
  },
  {
    id: 'keltner',
    name: 'Canais de Keltner',
    short: 'KC',
    category: 'Volatilidade',
    overlay: true,
    description: 'EMA com bandas de ATR.',
    inputs: [lenInput(20), numInput('mult', 'Multiplicador', 2, 0.1, 0.1, 10), lenInput(10, 'Período ATR', 'atr')],
    outputs: [
      { key: 'basis', label: 'Base', style: 'line', color: '#2962ff', width: 1 },
      { key: 'upper', label: 'Superior', style: 'line', color: '#2962ff', width: 1 },
      { key: 'lower', label: 'Inferior', style: 'line', color: '#2962ff', width: 1 },
    ],
    fills: [{ a: 'upper', b: 'lower', color: 'rgba(41,98,255,0.07)' }],
    compute(bars, p) {
      return { values: ta.keltner(bars, n(p, 'length'), n(p, 'mult'), n(p, 'atr')) };
    },
  },
  {
    id: 'donchian',
    name: 'Canais de Donchian',
    short: 'DC',
    category: 'Volatilidade',
    overlay: true,
    description: 'Máximos e mínimos de N barras.',
    inputs: [lenInput(20)],
    outputs: [
      { key: 'upper', label: 'Superior', style: 'line', color: '#2962ff', width: 1 },
      { key: 'basis', label: 'Base', style: 'line', color: '#ff6d00', width: 1 },
      { key: 'lower', label: 'Inferior', style: 'line', color: '#2962ff', width: 1 },
    ],
    fills: [{ a: 'upper', b: 'lower', color: 'rgba(41,98,255,0.06)' }],
    compute(bars, p) {
      return { values: ta.donchian(bars, n(p, 'length')) };
    },
  },
  {
    id: 'vwap',
    name: 'VWAP',
    short: 'VWAP',
    category: 'Volume',
    overlay: true,
    description: 'Preço médio ponderado por volume, reiniciado por sessão.',
    inputs: [
      {
        key: 'anchor',
        label: 'Âncora',
        type: 'select',
        default: 'D',
        options: [
          { value: 'D', label: 'Sessão (dia)' },
          { value: 'W', label: 'Semana' },
          { value: 'M', label: 'Mês' },
        ],
      },
      numInput('bands', 'Bandas (desvios, 0 = sem)', 0, 0.5, 0, 5),
    ],
    outputs: [
      { key: 'vwap', label: 'VWAP', style: 'line', color: '#2962ff', width: 2 },
      { key: 'upper', label: 'Banda sup.', style: 'line', color: '#4caf50', width: 1 },
      { key: 'lower', label: 'Banda inf.', style: 'line', color: '#4caf50', width: 1 },
    ],
    compute(bars, p) {
      return { values: ta.vwap(bars, s(p, 'anchor') as 'D' | 'W' | 'M', n(p, 'bands')) };
    },
  },
  {
    id: 'supertrend',
    name: 'Supertrend',
    short: 'ST',
    category: 'Tendência',
    overlay: true,
    description: 'Seguidor de tendência baseado no ATR.',
    inputs: [lenInput(10, 'Período ATR'), numInput('mult', 'Multiplicador', 3, 0.1, 0.1, 20)],
    outputs: [{ key: 'line', label: 'Supertrend', style: 'line', color: UP, width: 2 }],
    compute(bars, p) {
      const r = ta.supertrend(bars, n(p, 'length'), n(p, 'mult'));
      const markers: IndicatorMarker[] = [];
      for (let i = 1; i < r.dir.length; i++) {
        if (r.dir[i] === 1 && r.dir[i - 1] === -1) markers.push({ index: i, position: 'below', shape: 'arrowUp', color: UP, text: 'Compra' });
        if (r.dir[i] === -1 && r.dir[i - 1] === 1) markers.push({ index: i, position: 'above', shape: 'arrowDown', color: DOWN, text: 'Venda' });
      }
      return { values: { line: r.line }, colors: { line: r.dir.map((d) => (d === 1 ? UP : d === -1 ? DOWN : undefined)) }, markers };
    },
  },
  {
    id: 'psar',
    name: 'Parabolic SAR',
    short: 'SAR',
    category: 'Tendência',
    overlay: true,
    description: 'Pontos de stop e reversão.',
    inputs: [numInput('start', 'Início', 0.02, 0.01, 0.001, 1), numInput('inc', 'Incremento', 0.02, 0.01, 0.001, 1), numInput('max', 'Máximo', 0.2, 0.01, 0.01, 1)],
    outputs: [{ key: 'sar', label: 'SAR', style: 'dots', color: '#2962ff', width: 2 }],
    compute(bars, p) {
      return { values: { sar: ta.psar(bars, n(p, 'start'), n(p, 'inc'), n(p, 'max')) } };
    },
  },
  {
    id: 'ichimoku',
    name: 'Ichimoku Kinko Hyo',
    short: 'Ichimoku',
    category: 'Tendência',
    overlay: true,
    description: 'Nuvem de Ichimoku com Tenkan, Kijun e Chikou.',
    inputs: [lenInput(9, 'Tenkan', 'conv'), lenInput(26, 'Kijun', 'base'), lenInput(52, 'Senkou B', 'spanB'), lenInput(26, 'Deslocamento', 'disp')],
    outputs: [
      { key: 'conversion', label: 'Tenkan', style: 'line', color: '#2962ff', width: 1 },
      { key: 'base', label: 'Kijun', style: 'line', color: '#b71c1c', width: 1 },
      { key: 'lagging', label: 'Chikou', style: 'line', color: '#43a047', width: 1, offset: (p) => -(Number(p.disp) - 1) },
      { key: 'spanA', label: 'Senkou A', style: 'line', color: '#a5d6a7', width: 1, offset: (p) => Number(p.disp) - 1 },
      { key: 'spanB', label: 'Senkou B', style: 'line', color: '#ef9a9a', width: 1, offset: (p) => Number(p.disp) - 1 },
    ],
    fills: [{ a: 'spanA', b: 'spanB', color: 'rgba(76,175,80,0.10)' }],
    compute(bars, p) {
      return { values: ta.ichimoku(bars, n(p, 'conv'), n(p, 'base'), n(p, 'spanB')) };
    },
  },
  {
    id: 'zigzag',
    name: 'ZigZag',
    short: 'ZZ',
    category: 'Tendência',
    overlay: true,
    description: 'Liga os topos e fundos com desvio mínimo.',
    inputs: [numInput('dev', 'Desvio (%)', 1, 0.1, 0.01, 50)],
    outputs: [{ key: 'zz', label: 'ZigZag', style: 'line', color: '#ff9800', width: 2, sparse: true }],
    compute(bars, p) {
      return { values: { zz: ta.zigzag(bars, n(p, 'dev')) } };
    },
  },
  {
    id: 'linreg',
    name: 'Regressão Linear',
    short: 'LinReg',
    category: 'Tendência',
    overlay: true,
    description: 'Curva de regressão linear móvel.',
    inputs: [lenInput(50), srcInput()],
    outputs: [{ key: 'lr', label: 'LinReg', style: 'line', color: '#e91e63', width: 2 }],
    compute(bars, p) {
      return { values: { lr: ta.linreg(src(bars, p), n(p, 'length')) } };
    },
  },
  {
    id: 'pivots',
    name: 'Pontos Pivô Clássicos',
    short: 'Pivots',
    category: 'Outros',
    overlay: true,
    description: 'PP, R1–R3 e S1–S3 do período anterior.',
    inputs: [
      {
        key: 'period',
        label: 'Período',
        type: 'select',
        default: 'D',
        options: [
          { value: 'D', label: 'Diário' },
          { value: 'W', label: 'Semanal' },
          { value: 'M', label: 'Mensal' },
        ],
      },
    ],
    outputs: [
      { key: 'pp', label: 'PP', style: 'step', color: '#ff9800', width: 1 },
      { key: 'r1', label: 'R1', style: 'step', color: '#f23645', width: 1 },
      { key: 'r2', label: 'R2', style: 'step', color: '#f23645', width: 1 },
      { key: 'r3', label: 'R3', style: 'step', color: '#f23645', width: 1 },
      { key: 's1', label: 'S1', style: 'step', color: '#089981', width: 1 },
      { key: 's2', label: 'S2', style: 'step', color: '#089981', width: 1 },
      { key: 's3', label: 'S3', style: 'step', color: '#089981', width: 1 },
    ],
    compute(bars, p) {
      return { values: ta.pivots(bars, s(p, 'period') as 'D' | 'W' | 'M') };
    },
  },
  {
    id: 'fractals',
    name: 'Fractais de Williams',
    short: 'Fractals',
    category: 'Outros',
    overlay: true,
    description: 'Setas nos topos e fundos fractais.',
    inputs: [lenInput(2, 'Barras de cada lado', 'n')],
    outputs: [],
    compute(bars, p) {
      const f = ta.fractals(bars, n(p, 'n'));
      const markers: IndicatorMarker[] = [];
      f.forEach((v, i) => {
        if (v === 1) markers.push({ index: i, position: 'above', shape: 'arrowDown', color: DOWN });
        if (v === -1) markers.push({ index: i, position: 'below', shape: 'arrowUp', color: UP });
      });
      return { values: {}, markers };
    },
  },
  {
    id: 'volume',
    name: 'Volume',
    short: 'Vol',
    category: 'Volume',
    overlay: true,
    overlayScale: 'volume',
    description: 'Volume negociado em cada barra.',
    inputs: [lenInput(20, 'Média do volume', 'maLen')],
    outputs: [
      { key: 'vol', label: 'Volume', style: 'histogram', color: '#26a69a' },
      { key: 'ma', label: 'Média', style: 'line', color: '#2962ff', width: 1, hiddenByDefault: true },
    ],
    compute(bars, p) {
      const vol = ta.source(bars, 'volume');
      return {
        values: { vol, ma: ta.sma(vol, n(p, 'maLen')) },
        colors: { vol: bars.map((b) => (b.close >= b.open ? 'rgba(8,153,129,0.5)' : 'rgba(242,54,69,0.5)')) },
      };
    },
  },
  {
    id: 'rsi',
    name: 'Índice de Força Relativa',
    short: 'RSI',
    category: 'Osciladores',
    overlay: false,
    description: 'RSI de Wilder com zonas de 70/30.',
    inputs: [lenInput(14), srcInput(), lenInput(14, 'Média do RSI (0 = sem)', 'maLen')],
    outputs: [
      { key: 'rsi', label: 'RSI', style: 'line', color: '#7e57c2', width: 2 },
      { key: 'ma', label: 'Média', style: 'line', color: '#ffeb3b', width: 1, hiddenByDefault: true },
    ],
    levels: [
      { value: 70, color: '#787b86' },
      { value: 50, color: 'rgba(120,123,134,0.5)' },
      { value: 30, color: '#787b86' },
    ],
    scale: { min: 0, max: 100 },
    compute(bars, p) {
      const r = ta.rsi(src(bars, p), n(p, 'length'));
      return { values: { rsi: r, ma: n(p, 'maLen') > 0 ? ta.sma(r, n(p, 'maLen')) : r.map(() => NaN) } };
    },
  },
  {
    id: 'macd',
    name: 'MACD',
    short: 'MACD',
    category: 'Osciladores',
    overlay: false,
    description: 'Convergência/divergência de médias móveis.',
    inputs: [lenInput(12, 'Rápida', 'fast'), lenInput(26, 'Lenta', 'slow'), lenInput(9, 'Sinal', 'signal'), srcInput()],
    outputs: [
      { key: 'hist', label: 'Histograma', style: 'histogram', color: '#26a69a' },
      { key: 'macd', label: 'MACD', style: 'line', color: '#2962ff', width: 2 },
      { key: 'signal', label: 'Sinal', style: 'line', color: '#ff6d00', width: 2 },
    ],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      const r = ta.macd(src(bars, p), n(p, 'fast'), n(p, 'slow'), n(p, 'signal'));
      const colors = r.hist.map((v, i) => {
        const prev = r.hist[i - 1];
        if (!Number.isFinite(v)) return undefined;
        if (v >= 0) return prev !== undefined && v < prev ? '#b2dfdb' : '#26a69a';
        return prev !== undefined && v > prev ? '#ffcdd2' : '#ff5252';
      });
      return { values: r, colors: { hist: colors } };
    },
  },
  {
    id: 'stoch',
    name: 'Estocástico',
    short: 'Stoch',
    category: 'Osciladores',
    overlay: false,
    description: 'Oscilador estocástico %K/%D.',
    inputs: [lenInput(14, '%K', 'k'), lenInput(1, 'Suavização %K', 'smooth'), lenInput(3, '%D', 'd')],
    outputs: [
      { key: 'k', label: '%K', style: 'line', color: '#2962ff', width: 2 },
      { key: 'd', label: '%D', style: 'line', color: '#ff6d00', width: 1 },
    ],
    levels: [
      { value: 80, color: '#787b86' },
      { value: 20, color: '#787b86' },
    ],
    scale: { min: 0, max: 100 },
    compute(bars, p) {
      return { values: ta.stoch(bars, n(p, 'k'), n(p, 'smooth'), n(p, 'd')) };
    },
  },
  {
    id: 'stochrsi',
    name: 'Stoch RSI',
    short: 'StochRSI',
    category: 'Osciladores',
    overlay: false,
    description: 'Estocástico aplicado ao RSI.',
    inputs: [lenInput(14, 'RSI', 'rsi'), lenInput(14, 'Estocástico', 'stoch'), lenInput(3, '%K', 'k'), lenInput(3, '%D', 'd'), srcInput()],
    outputs: [
      { key: 'k', label: '%K', style: 'line', color: '#2962ff', width: 2 },
      { key: 'd', label: '%D', style: 'line', color: '#ff6d00', width: 1 },
    ],
    levels: [
      { value: 80, color: '#787b86' },
      { value: 20, color: '#787b86' },
    ],
    scale: { min: 0, max: 100 },
    compute(bars, p) {
      return { values: ta.stochRsi(src(bars, p), n(p, 'rsi'), n(p, 'stoch'), n(p, 'k'), n(p, 'd')) };
    },
  },
  {
    id: 'cci',
    name: 'Commodity Channel Index',
    short: 'CCI',
    category: 'Osciladores',
    overlay: false,
    description: 'Desvio do preço típico face à média.',
    inputs: [lenInput(20)],
    outputs: [{ key: 'cci', label: 'CCI', style: 'line', color: '#2962ff', width: 2 }],
    levels: [
      { value: 100, color: '#787b86' },
      { value: 0, color: 'rgba(120,123,134,0.5)' },
      { value: -100, color: '#787b86' },
    ],
    compute(bars, p) {
      return { values: { cci: ta.cci(bars, n(p, 'length')) } };
    },
  },
  {
    id: 'willr',
    name: 'Williams %R',
    short: '%R',
    category: 'Osciladores',
    overlay: false,
    description: 'Posição do fecho no intervalo recente.',
    inputs: [lenInput(14)],
    outputs: [{ key: 'r', label: '%R', style: 'line', color: '#7e57c2', width: 2 }],
    levels: [
      { value: -20, color: '#787b86' },
      { value: -80, color: '#787b86' },
    ],
    scale: { min: -100, max: 0 },
    compute(bars, p) {
      return { values: { r: ta.williamsR(bars, n(p, 'length')) } };
    },
  },
  {
    id: 'adx',
    name: 'ADX / DMI',
    short: 'ADX',
    category: 'Tendência',
    overlay: false,
    description: 'Força da tendência com +DI e -DI.',
    inputs: [lenInput(14, 'DI'), lenInput(14, 'Suavização ADX', 'smooth')],
    outputs: [
      { key: 'adx', label: 'ADX', style: 'line', color: '#ff9800', width: 2 },
      { key: 'plus', label: '+DI', style: 'line', color: UP, width: 1 },
      { key: 'minus', label: '-DI', style: 'line', color: DOWN, width: 1 },
    ],
    levels: [{ value: 25, color: 'rgba(120,123,134,0.6)' }],
    compute(bars, p) {
      return { values: ta.dmi(bars, n(p, 'length'), n(p, 'smooth')) };
    },
  },
  {
    id: 'atr',
    name: 'Average True Range',
    short: 'ATR',
    category: 'Volatilidade',
    overlay: false,
    description: 'Amplitude média verdadeira.',
    inputs: [lenInput(14)],
    outputs: [{ key: 'atr', label: 'ATR', style: 'line', color: '#b71c1c', width: 2 }],
    compute(bars, p) {
      return { values: { atr: ta.atr(bars, n(p, 'length')) } };
    },
  },
  {
    id: 'stdev',
    name: 'Desvio-padrão',
    short: 'StDev',
    category: 'Volatilidade',
    overlay: false,
    description: 'Desvio-padrão do preço.',
    inputs: [lenInput(20), srcInput()],
    outputs: [{ key: 'sd', label: 'StDev', style: 'line', color: '#2962ff', width: 2 }],
    compute(bars, p) {
      return { values: { sd: ta.stdev(src(bars, p), n(p, 'length')) } };
    },
  },
  {
    id: 'bbw',
    name: 'Largura das Bollinger',
    short: 'BBW',
    category: 'Volatilidade',
    overlay: false,
    description: 'Largura relativa das Bandas de Bollinger (compressões).',
    inputs: [lenInput(20), numInput('mult', 'Desvios', 2, 0.1, 0.1, 10), srcInput()],
    outputs: [{ key: 'w', label: 'BBW', style: 'line', color: '#2962ff', width: 2 }],
    compute(bars, p) {
      const b = ta.bollinger(src(bars, p), n(p, 'length'), n(p, 'mult'));
      return { values: { w: b.basis.map((v, i) => (v ? ((b.upper[i] - b.lower[i]) / v) * 100 : NaN)) } };
    },
  },
  {
    id: 'mom',
    name: 'Momentum',
    short: 'MOM',
    category: 'Osciladores',
    overlay: false,
    description: 'Diferença de preço face a N barras atrás.',
    inputs: [lenInput(10), srcInput()],
    outputs: [{ key: 'm', label: 'MOM', style: 'line', color: '#2962ff', width: 2 }],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      return { values: { m: ta.mom(src(bars, p), n(p, 'length')) } };
    },
  },
  {
    id: 'roc',
    name: 'Rate of Change',
    short: 'ROC',
    category: 'Osciladores',
    overlay: false,
    description: 'Variação percentual face a N barras atrás.',
    inputs: [lenInput(9), srcInput()],
    outputs: [{ key: 'r', label: 'ROC', style: 'line', color: '#2962ff', width: 2 }],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      return { values: { r: ta.roc(src(bars, p), n(p, 'length')) } };
    },
  },
  {
    id: 'ao',
    name: 'Awesome Oscillator',
    short: 'AO',
    category: 'Osciladores',
    overlay: false,
    description: 'Diferença entre médias de 5 e 34 do preço médio.',
    inputs: [],
    outputs: [{ key: 'ao', label: 'AO', style: 'histogram', color: UP }],
    compute(bars) {
      const ao = ta.awesome(bars);
      return { values: { ao }, colors: { ao: ao.map((v, i) => (i > 0 && v >= ao[i - 1] ? UP : DOWN)) } };
    },
  },
  {
    id: 'trix',
    name: 'TRIX',
    short: 'TRIX',
    category: 'Osciladores',
    overlay: false,
    description: 'Taxa de variação de uma EMA tripla.',
    inputs: [lenInput(18), srcInput()],
    outputs: [{ key: 't', label: 'TRIX', style: 'line', color: '#e91e63', width: 2 }],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      return { values: { t: ta.trix(src(bars, p), n(p, 'length')) } };
    },
  },
  {
    id: 'aroon',
    name: 'Aroon',
    short: 'Aroon',
    category: 'Tendência',
    overlay: false,
    description: 'Tempo desde o máximo/mínimo recente.',
    inputs: [lenInput(14)],
    outputs: [
      { key: 'up', label: 'Aroon Up', style: 'line', color: '#ff6d00', width: 2 },
      { key: 'down', label: 'Aroon Down', style: 'line', color: '#2962ff', width: 2 },
    ],
    scale: { min: 0, max: 100 },
    compute(bars, p) {
      return { values: ta.aroon(bars, n(p, 'length')) };
    },
  },
  {
    id: 'obv',
    name: 'On Balance Volume',
    short: 'OBV',
    category: 'Volume',
    overlay: false,
    description: 'Volume acumulado pela direção do preço.',
    inputs: [],
    outputs: [{ key: 'obv', label: 'OBV', style: 'line', color: '#2962ff', width: 2 }],
    compute(bars) {
      return { values: { obv: ta.obv(bars) } };
    },
  },
  {
    id: 'mfi',
    name: 'Money Flow Index',
    short: 'MFI',
    category: 'Volume',
    overlay: false,
    description: 'RSI ponderado por volume.',
    inputs: [lenInput(14)],
    outputs: [{ key: 'mfi', label: 'MFI', style: 'line', color: '#7e57c2', width: 2 }],
    levels: [
      { value: 80, color: '#787b86' },
      { value: 20, color: '#787b86' },
    ],
    scale: { min: 0, max: 100 },
    compute(bars, p) {
      return { values: { mfi: ta.mfi(bars, n(p, 'length')) } };
    },
  },
  {
    id: 'cmf',
    name: 'Chaikin Money Flow',
    short: 'CMF',
    category: 'Volume',
    overlay: false,
    description: 'Pressão compradora/vendedora ponderada por volume.',
    inputs: [lenInput(20)],
    outputs: [{ key: 'cmf', label: 'CMF', style: 'histogram', color: UP }],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      const c = ta.cmf(bars, n(p, 'length'));
      return { values: { cmf: c }, colors: { cmf: c.map((v) => (v >= 0 ? UP : DOWN)) } };
    },
  },

  // ---------------------------------------------------------------- mais indicadores
  {
    id: 'ac',
    name: 'Accelerator Oscillator',
    short: 'AC',
    category: 'Osciladores',
    overlay: false,
    description: 'Mostra se o momento do preço está a acelerar (AO menos a sua média de 5). Verde quando sobe, vermelho quando desce.',
    inputs: [],
    outputs: [{ key: 'ac', label: 'AC', style: 'histogram', color: UP }],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars) {
      const ac = ta.accelerator(bars);
      return { values: { ac }, colors: { ac: ac.map((v, i) => (i > 0 && v >= ac[i - 1] ? UP : DOWN)) } };
    },
  },
  {
    id: 'alligator',
    name: 'Alligator',
    short: 'ALLIG',
    category: 'Tendência',
    overlay: true,
    description: 'Três médias suavizadas (maxilar, dentes, lábios) deslocadas para o futuro. Quando se abrem, há tendência; quando se juntam, o mercado dorme.',
    inputs: [],
    outputs: [
      { key: 'jaw', label: 'Maxilar', style: 'line', color: '#2962ff', width: 1, offset: () => 8 },
      { key: 'teeth', label: 'Dentes', style: 'line', color: '#f23645', width: 1, offset: () => 5 },
      { key: 'lips', label: 'Lábios', style: 'line', color: '#089981', width: 1, offset: () => 3 },
    ],
    compute(bars) {
      return { values: ta.alligator(bars) };
    },
  },
  {
    id: 'squeeze',
    name: 'Squeeze Momentum',
    short: 'SQZ',
    category: 'Osciladores',
    overlay: false,
    description: 'Deteta compressões de volatilidade (Bandas de Bollinger dentro dos canais de Keltner, pontos laranja) e o momento que vem a seguir.',
    inputs: [lenInput(20), numInput('bb', 'Desvios das Bollinger', 2, 0.1, 0.1, 10), numInput('kc', 'Múltiplo de Keltner', 1.5, 0.1, 0.1, 10)],
    outputs: [
      { key: 'mom', label: 'Momento', style: 'histogram', color: UP },
      { key: 'sqz', label: 'Compressão', style: 'dots', color: '#ff9800' },
    ],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      const { momentum, on } = ta.squeeze(bars, n(p, 'length'), n(p, 'bb'), n(p, 'kc'));
      const colors = momentum.map((v, i) => {
        const prev = momentum[i - 1];
        if (v >= 0) return i > 0 && v > prev ? '#00e676' : UP;
        return i > 0 && v < prev ? DOWN : '#b71c1c';
      });
      const sqz = momentum.map((v) => (Number.isFinite(v) ? 0 : NaN));
      return { values: { mom: momentum, sqz }, colors: { mom: colors, sqz: on.map((x) => (x ? '#ff9800' : '#787b86')) } };
    },
  },
  {
    id: 'uo',
    name: 'Ultimate Oscillator',
    short: 'UO',
    category: 'Osciladores',
    overlay: false,
    description: 'Junta três horizontes (7, 14 e 28) para dar menos sinais falsos. Abaixo de 30 sobrevendido, acima de 70 sobrecomprado.',
    inputs: [lenInput(7, 'Curto', 'a'), lenInput(14, 'Médio', 'b'), lenInput(28, 'Longo', 'c')],
    outputs: [{ key: 'uo', label: 'UO', style: 'line', color: '#7e57c2', width: 2 }],
    levels: [
      { value: 70, color: 'rgba(242,54,69,0.5)' },
      { value: 50, color: 'rgba(120,123,134,0.4)' },
      { value: 30, color: 'rgba(8,153,129,0.5)' },
    ],
    scale: { min: 0, max: 100 },
    compute(bars, p) {
      return { values: { uo: ta.ultimate(bars, n(p, 'a'), n(p, 'b'), n(p, 'c')) } };
    },
  },
  {
    id: 'cmo',
    name: 'Chande Momentum Oscillator',
    short: 'CMO',
    category: 'Osciladores',
    overlay: false,
    description: 'Momento entre −100 e +100. Acima de +50 sobrecomprado, abaixo de −50 sobrevendido.',
    inputs: [lenInput(9), srcInput()],
    outputs: [{ key: 'cmo', label: 'CMO', style: 'line', color: '#26a69a', width: 2 }],
    levels: [
      { value: 50, color: 'rgba(242,54,69,0.5)' },
      { value: 0, color: 'rgba(120,123,134,0.4)' },
      { value: -50, color: 'rgba(8,153,129,0.5)' },
    ],
    compute(bars, p) {
      return { values: { cmo: ta.cmo(src(bars, p), n(p, 'length')) } };
    },
  },
  {
    id: 'elder',
    name: 'Elder Ray (Bull/Bear Power)',
    short: 'ELDER',
    category: 'Osciladores',
    overlay: false,
    description: 'Mede a força dos compradores (máximo menos EMA) e dos vendedores (mínimo menos EMA).',
    inputs: [lenInput(13)],
    outputs: [
      { key: 'bull', label: 'Bull Power', style: 'histogram', color: UP },
      { key: 'bear', label: 'Bear Power', style: 'histogram', color: DOWN },
    ],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      return { values: ta.elderRay(bars, n(p, 'length')) };
    },
  },
  {
    id: 'kst',
    name: 'Know Sure Thing',
    short: 'KST',
    category: 'Osciladores',
    overlay: false,
    description: 'Quatro taxas de variação suavizadas e ponderadas (Martin Pring). Cruzamentos com o sinal indicam viragens.',
    inputs: [lenInput(9, 'Sinal', 'signal')],
    outputs: [
      { key: 'kst', label: 'KST', style: 'line', color: UP, width: 2 },
      { key: 'signal', label: 'Sinal', style: 'line', color: DOWN, width: 1 },
    ],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      return { values: ta.kst(ta.source(bars, 'close'), [10, 15, 20, 30], [10, 10, 10, 15], n(p, 'signal')) };
    },
  },
  {
    id: 'coppock',
    name: 'Coppock Curve',
    short: 'COPP',
    category: 'Osciladores',
    overlay: false,
    description: 'Indicador de momento de longo prazo, criado para encontrar fundos de mercado.',
    inputs: [lenInput(10, 'Média ponderada', 'wma'), lenInput(14, 'ROC longo', 'long'), lenInput(11, 'ROC curto', 'short')],
    outputs: [{ key: 'coppock', label: 'Coppock', style: 'histogram', color: UP }],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      const c = ta.coppock(ta.source(bars, 'close'), n(p, 'wma'), n(p, 'long'), n(p, 'short'));
      return { values: { coppock: c }, colors: { coppock: c.map((v, i) => (i > 0 && v >= c[i - 1] ? UP : DOWN)) } };
    },
  },
  {
    id: 'dpo',
    name: 'Detrended Price Oscillator',
    short: 'DPO',
    category: 'Osciladores',
    overlay: false,
    description: 'Tira a tendência do preço para destacar os ciclos.',
    inputs: [lenInput(21), srcInput()],
    outputs: [{ key: 'dpo', label: 'DPO', style: 'line', color: '#2962ff', width: 2 }],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      return { values: { dpo: ta.dpo(src(bars, p), n(p, 'length')) } };
    },
  },
  {
    id: 'vortex',
    name: 'Vortex Indicator',
    short: 'VI',
    category: 'Tendência',
    overlay: false,
    description: 'Quando VI+ passa acima de VI−, começa uma tendência de alta; ao contrário, de baixa.',
    inputs: [lenInput(14)],
    outputs: [
      { key: 'plus', label: 'VI+', style: 'line', color: '#2962ff', width: 2 },
      { key: 'minus', label: 'VI−', style: 'line', color: '#e91e63', width: 2 },
    ],
    levels: [{ value: 1, color: 'rgba(120,123,134,0.4)' }],
    compute(bars, p) {
      return { values: ta.vortex(bars, n(p, 'length')) };
    },
  },
  {
    id: 'chaikinosc',
    name: 'Chaikin Oscillator',
    short: 'CHO',
    category: 'Volume',
    overlay: false,
    description: 'Momento da linha de acumulação/distribuição (EMA 3 menos EMA 10).',
    inputs: [lenInput(3, 'Rápida', 'fast'), lenInput(10, 'Lenta', 'slow')],
    outputs: [{ key: 'cho', label: 'CHO', style: 'histogram', color: UP }],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      const c = ta.chaikinOsc(bars, n(p, 'fast'), n(p, 'slow'));
      return { values: { cho: c }, colors: { cho: c.map((v) => (v >= 0 ? UP : DOWN)) } };
    },
  },
  {
    id: 'force',
    name: 'Force Index',
    short: 'FI',
    category: 'Volume',
    overlay: false,
    description: 'Variação do preço vezes o volume, suavizada. Mede a força de cada movimento.',
    inputs: [lenInput(13)],
    outputs: [{ key: 'fi', label: 'FI', style: 'histogram', color: UP }],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      const f = ta.forceIndex(bars, n(p, 'length'));
      return { values: { fi: f }, colors: { fi: f.map((v) => (v >= 0 ? UP : DOWN)) } };
    },
  },
  {
    id: 'ad',
    name: 'Acumulação/Distribuição',
    short: 'A/D',
    category: 'Volume',
    overlay: false,
    description: 'Linha cumulativa que mostra se o volume entra com os compradores ou com os vendedores.',
    inputs: [],
    outputs: [{ key: 'ad', label: 'A/D', style: 'line', color: '#2962ff', width: 2 }],
    compute(bars) {
      return { values: { ad: ta.adl(bars) } };
    },
  },
  {
    id: 'chop',
    name: 'Choppiness Index',
    short: 'CHOP',
    category: 'Tendência',
    overlay: false,
    description: 'Perto de 100 o mercado está lateral; perto de 0 há tendência forte. Referências em 38,2 e 61,8.',
    inputs: [lenInput(14)],
    outputs: [{ key: 'chop', label: 'CHOP', style: 'line', color: '#2962ff', width: 2 }],
    levels: [
      { value: 61.8, color: 'rgba(242,54,69,0.5)' },
      { value: 38.2, color: 'rgba(8,153,129,0.5)' },
    ],
    scale: { min: 0, max: 100 },
    compute(bars, p) {
      return { values: { chop: ta.choppiness(bars, n(p, 'length')) } };
    },
  },
  {
    id: 'ppo',
    name: 'Percentage Price Oscillator',
    short: 'PPO',
    category: 'Osciladores',
    overlay: false,
    description: 'O MACD em percentagem, por isso compara-se entre ativos de preços diferentes.',
    inputs: [lenInput(12, 'Rápida', 'fast'), lenInput(26, 'Lenta', 'slow'), lenInput(9, 'Sinal', 'signal'), srcInput()],
    outputs: [
      { key: 'hist', label: 'Histograma', style: 'histogram', color: UP },
      { key: 'ppo', label: 'PPO', style: 'line', color: '#2962ff', width: 2 },
      { key: 'signal', label: 'Sinal', style: 'line', color: '#ff6d00', width: 1 },
    ],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      const r = ta.ppo(src(bars, p), n(p, 'fast'), n(p, 'slow'), n(p, 'signal'));
      return { values: r, colors: { hist: r.hist.map((v) => (v >= 0 ? UP : DOWN)) } };
    },
  },
  {
    id: 'tsi',
    name: 'True Strength Index',
    short: 'TSI',
    category: 'Osciladores',
    overlay: false,
    description: 'Momento suavizado duas vezes (William Blau). Cruzamentos com o sinal e com o zero indicam viragens.',
    inputs: [lenInput(25, 'Longo', 'long'), lenInput(13, 'Curto', 'short'), lenInput(7, 'Sinal', 'signal'), srcInput()],
    outputs: [
      { key: 'tsi', label: 'TSI', style: 'line', color: '#2962ff', width: 2 },
      { key: 'signal', label: 'Sinal', style: 'line', color: '#ff6d00', width: 1 },
    ],
    levels: [{ value: 0, color: 'rgba(120,123,134,0.5)' }],
    compute(bars, p) {
      return { values: ta.tsi(src(bars, p), n(p, 'long'), n(p, 'short'), n(p, 'signal')) };
    },
  },
  {
    id: 'pctb',
    name: 'Bollinger %B',
    short: '%B',
    category: 'Volatilidade',
    overlay: false,
    description: 'Onde o preço está dentro das Bandas de Bollinger: 0 na de baixo, 1 na de cima.',
    inputs: [lenInput(20), numInput('mult', 'Desvios', 2, 0.1, 0.1, 10), srcInput()],
    outputs: [{ key: 'pctb', label: '%B', style: 'line', color: '#2962ff', width: 2 }],
    levels: [
      { value: 1, color: 'rgba(242,54,69,0.5)' },
      { value: 0.5, color: 'rgba(120,123,134,0.4)' },
      { value: 0, color: 'rgba(8,153,129,0.5)' },
    ],
    compute(bars, p) {
      return { values: { pctb: ta.percentB(src(bars, p), n(p, 'length'), n(p, 'mult')) } };
    },
  },
  {
    id: 'envelope',
    name: 'Envelope de Média',
    short: 'ENV',
    category: 'Volatilidade',
    overlay: true,
    description: 'Média móvel com bandas a uma percentagem fixa acima e abaixo.',
    inputs: [lenInput(20), numInput('pct', 'Percentagem', 2.5, 0.1, 0.1, 50), { key: 'type', label: 'Tipo', type: 'ma', default: 'sma', options: MA_OPTIONS }, srcInput()],
    outputs: [
      { key: 'basis', label: 'Base', style: 'line', color: '#ff6d00', width: 1 },
      { key: 'upper', label: 'Superior', style: 'line', color: '#2962ff', width: 1 },
      { key: 'lower', label: 'Inferior', style: 'line', color: '#2962ff', width: 1 },
    ],
    fills: [{ a: 'upper', b: 'lower', color: 'rgba(33,150,243,0.07)' }],
    compute(bars, p) {
      return { values: ta.envelope(src(bars, p), n(p, 'length'), n(p, 'pct'), s(p, 'type') as MaType) };
    },
  },

  {
    id: 'apocalypse',
    name: 'Apocalypse',
    short: 'APOC',
    category: 'Outros',
    overlay: true,
    description:
      'Encontra as pernadas longas do próprio ativo (as que andaram mais ou duraram mais), marca onde começaram e junta esses pontos em zonas: verde onde as subidas longas nasceram, vermelho onde as descidas nasceram. A etiqueta na última vela diz, pelo histórico, quantas vezes uma situação parecida com a de agora foi seguida de uma pernada longa. É a frequência do passado, não uma garantia.',
    inputs: [
      numInput('sens', 'Sensibilidade (ATR por oscilação)', 2.5, 0.25, 1, 10),
      { key: 'top', label: 'Pernadas longas: melhores %', type: 'int', default: 25, min: 10, max: 50, step: 5 },
      { key: 'h', label: 'Horizonte (velas à frente)', type: 'int', default: 6, min: 2, max: 50, step: 1 },
      { key: 'signals', label: 'Sinais de entrada (com stop e alvo)', type: 'bool', default: true },
      numInput('ratio', 'Exigência: chance vs média (×)', 1.5, 0.1, 1, 5),
    ],
    outputs: [
      { key: 'd1hi', label: 'Procura 1 (cima)', style: 'line', color: 'rgba(8,153,129,0.7)', width: 1, hiddenByDefault: true },
      { key: 'd1lo', label: 'Procura 1 (baixo)', style: 'line', color: 'rgba(8,153,129,0.7)', width: 1, hiddenByDefault: true },
      { key: 'd2hi', label: 'Procura 2 (cima)', style: 'line', color: 'rgba(8,153,129,0.7)', width: 1, hiddenByDefault: true },
      { key: 'd2lo', label: 'Procura 2 (baixo)', style: 'line', color: 'rgba(8,153,129,0.7)', width: 1, hiddenByDefault: true },
      { key: 's1hi', label: 'Oferta 1 (cima)', style: 'line', color: 'rgba(242,54,69,0.7)', width: 1, hiddenByDefault: true },
      { key: 's1lo', label: 'Oferta 1 (baixo)', style: 'line', color: 'rgba(242,54,69,0.7)', width: 1, hiddenByDefault: true },
      { key: 's2hi', label: 'Oferta 2 (cima)', style: 'line', color: 'rgba(242,54,69,0.7)', width: 1, hiddenByDefault: true },
      { key: 's2lo', label: 'Oferta 2 (baixo)', style: 'line', color: 'rgba(242,54,69,0.7)', width: 1, hiddenByDefault: true },
      { key: 'entry', label: 'Entrada', style: 'line', color: '#b0b3bd', width: 1, hiddenByDefault: true },
      { key: 'sl', label: 'Stop', style: 'line', color: '#f23645', width: 1, hiddenByDefault: true },
      { key: 'tp', label: 'Alvo', style: 'line', color: '#089981', width: 1, hiddenByDefault: true },
    ],
    fills: [
      { a: 'd1hi', b: 'd1lo', color: 'rgba(8,153,129,0.2)' },
      { a: 'd2hi', b: 'd2lo', color: 'rgba(8,153,129,0.2)' },
      { a: 's1hi', b: 's1lo', color: 'rgba(242,54,69,0.2)' },
      { a: 's2hi', b: 's2lo', color: 'rgba(242,54,69,0.2)' },
      { a: 'tp', b: 'entry', color: 'rgba(8,153,129,0.3)' },
      { a: 'entry', b: 'sl', color: 'rgba(242,54,69,0.3)' },
    ],
    compute(bars, p) {
      const r = apocalypse(bars, { sensitivity: n(p, 'sens'), topPct: n(p, 'top'), horizon: n(p, 'h'), signals: p.signals !== false, ratio: n(p, 'ratio') });
      const N = bars.length;
      const nan = () => new Array<number>(N).fill(NaN);
      const values: Record<string, number[]> = {};
      for (const k of ['d1hi', 'd1lo', 'd2hi', 'd2lo', 's1hi', 's1lo', 's2hi', 's2lo', 'entry', 'sl', 'tp']) values[k] = nan();
      const price = N ? bars[N - 1].close : 0;
      // as duas zonas de cada tipo mais perto do preço atual
      for (const [kind, prefix] of [['demand', 'd'], ['supply', 's']] as const) {
        const near = r.zones
          .filter((z) => z.kind === kind)
          .sort((a, b) => Math.abs((a.lo + a.hi) / 2 - price) - Math.abs((b.lo + b.hi) / 2 - price))
          .slice(0, 2);
        near.forEach((z, k) => {
          for (let i = z.firstIdx; i < N; i++) {
            values[`${prefix}${k + 1}hi`][i] = z.hi;
            values[`${prefix}${k + 1}lo`][i] = z.lo;
          }
        });
      }
      const markers: IndicatorMarker[] = r.legs
        .filter((l) => l.long)
        .slice(-60)
        .map((l) =>
          l.dir === 1
            ? { index: l.from.idx, position: 'below' as const, shape: 'arrowUp' as const, color: UP }
            : { index: l.from.idx, position: 'above' as const, shape: 'arrowDown' as const, color: DOWN },
        );
      // sinais de entrada: entrada, stop e alvo desenhados enquanto a operação dura
      for (const sg of r.signals) {
        for (let i = sg.idx; i <= sg.exitIdx; i++) {
          values.entry[i] = sg.entry;
          values.sl[i] = sg.stop;
          values.tp[i] = sg.target;
        }
        markers.push({ index: sg.idx, position: sg.dir === 1 ? 'below' : 'above', shape: sg.dir === 1 ? 'arrowUp' : 'arrowDown', color: sg.dir === 1 ? UP : DOWN, text: `${sg.dir === 1 ? 'COMPRA' : 'VENDA'} 1:${sg.rr.toFixed(1)}` });
        if (sg.outcome === 'tp' || sg.outcome === 'sl') markers.push({ index: sg.exitIdx, position: sg.dir === 1 ? 'above' : 'below', shape: 'circle', color: sg.outcome === 'tp' ? UP : DOWN, text: sg.outcome === 'tp' ? 'alvo' : 'stop' });
      }
      // a leitura atual: uma linha curta por marcador, empilhadas por cima da última vela
      if (N) readingLines(r.reading, r.typical, r.signals).forEach((text, k) => markers.push({ index: N - 1, position: 'above', shape: k === 0 ? 'circle' : 'square', color: '#b39ddb', text }));
      return { values, markers };
    },
  },
];

const BY_ID = new Map(INDICATORS.map((d) => [d.id, d]));

export function getIndicator(id: string): IndicatorDef | undefined {
  return BY_ID.get(id);
}

export function defaultParams(def: IndicatorDef): Record<string, ParamValue> {
  const p: Record<string, ParamValue> = {};
  for (const i of def.inputs) p[i.key] = i.default;
  return p;
}

export interface IndicatorInstance {
  uid: string;
  /** id do indicador embutido ou "script:<id>" para scripts do utilizador. */
  type: string;
  params: Record<string, ParamValue>;
  styles: Record<string, { color?: string; width?: number; visible?: boolean }>;
  hidden?: boolean;
}

export function newInstance(id: string): IndicatorInstance {
  const def = getIndicator(id);
  const styles: IndicatorInstance['styles'] = {};
  def?.outputs.forEach((o) => {
    if (o.hiddenByDefault) styles[o.key] = { visible: false };
  });
  return {
    uid: `${id}-${Math.random().toString(36).slice(2, 9)}`,
    type: id,
    params: def ? defaultParams(def) : {},
    styles,
  };
}

/** Texto curto para a legenda, ex.: "EMA 20 close". */
export function instanceLabel(def: IndicatorDef, params: Record<string, ParamValue>): string {
  const vals = def.inputs.filter((i) => i.type !== 'bool').map((i) => String(params[i.key] ?? i.default));
  return vals.length ? `${def.short} ${vals.join(' ')}` : def.short;
}
