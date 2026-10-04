/** Barra OHLC. `time` é a abertura da barra em segundos UTC. */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type ProviderId = 'binance' | 'deriv' | 'yahoo' | 'demo';

export type AssetClass =
  | 'synthetic'
  | 'forex'
  | 'crypto'
  | 'commodities'
  | 'indices'
  | 'stocks'
  | 'futures'
  | 'demo';

export interface SymbolInfo {
  /** Chave única, ex.: "DERIV:R_75", "BINANCE:BTCUSDT", "YAHOO:AAPL". */
  id: string;
  provider: ProviderId;
  /** Código nativo do fornecedor. */
  ticker: string;
  /** Nome curto mostrado no gráfico, ex.: "EURUSD". */
  name: string;
  /** Descrição longa, ex.: "Volatility 75 Index". */
  description: string;
  assetClass: AssetClass;
  /** Sub-categoria (ex.: "Índices de Volatilidade"). */
  category?: string;
  /** Casas decimais do preço. */
  precision: number;
  /** Unidades por lote (forex = 100 000). */
  contractSize?: number;
  baseCurrency?: string;
  quoteCurrency?: string;
  /** 24x7 (cripto/sintéticos), 24x5 (forex) ou horário de bolsa. */
  session?: '24x7' | '24x5' | 'exchange';
  hasVolume?: boolean;
  /** Bolsa/fonte mostrada na pesquisa. */
  exchange?: string;
}

export interface PricePoint {
  time: number;
  price: number;
}

export type ChartType =
  | 'candles'
  | 'hollow'
  | 'heikin'
  | 'bars'
  | 'line'
  | 'area'
  | 'baseline'
  | 'columns';
