import type { AssetClass, ProviderId, SymbolInfo } from './types';

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  synthetic: 'Índices Sintéticos',
  forex: 'Forex',
  crypto: 'Cripto',
  commodities: 'Matérias-primas',
  indices: 'Índices',
  stocks: 'Ações',
  futures: 'Futuros',
  demo: 'Simulado (offline)',
};

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  deriv: 'DERIV',
  binance: 'BINANCE',
  yahoo: 'YAHOO',
  demo: 'DEMO',
};

function deriv(
  ticker: string,
  name: string,
  description: string,
  assetClass: AssetClass,
  category: string,
  precision: number,
  extra: Partial<SymbolInfo> = {},
): SymbolInfo {
  return {
    id: `DERIV:${ticker}`,
    provider: 'deriv',
    ticker,
    name,
    description,
    assetClass,
    category,
    precision,
    contractSize: 1,
    session: assetClass === 'synthetic' || assetClass === 'crypto' ? '24x7' : assetClass === 'forex' || assetClass === 'commodities' ? '24x5' : 'exchange',
    hasVolume: false,
    exchange: 'Deriv',
    ...extra,
  };
}

const VOL = 'Volatilidade';
const VOL1S = 'Volatilidade (1s)';
const BC = 'Boom & Crash';

const SYNTHETICS: SymbolInfo[] = [
  deriv('R_10', 'Volatility 10', 'Volatility 10 Index', 'synthetic', VOL, 3),
  deriv('R_25', 'Volatility 25', 'Volatility 25 Index', 'synthetic', VOL, 3),
  deriv('R_50', 'Volatility 50', 'Volatility 50 Index', 'synthetic', VOL, 4),
  deriv('R_75', 'Volatility 75', 'Volatility 75 Index', 'synthetic', VOL, 4),
  deriv('R_100', 'Volatility 100', 'Volatility 100 Index', 'synthetic', VOL, 2),
  deriv('1HZ10V', 'Volatility 10 (1s)', 'Volatility 10 (1s) Index', 'synthetic', VOL1S, 2),
  deriv('1HZ25V', 'Volatility 25 (1s)', 'Volatility 25 (1s) Index', 'synthetic', VOL1S, 2),
  deriv('1HZ50V', 'Volatility 50 (1s)', 'Volatility 50 (1s) Index', 'synthetic', VOL1S, 2),
  deriv('1HZ75V', 'Volatility 75 (1s)', 'Volatility 75 (1s) Index', 'synthetic', VOL1S, 2),
  deriv('1HZ100V', 'Volatility 100 (1s)', 'Volatility 100 (1s) Index', 'synthetic', VOL1S, 2),
  deriv('1HZ150V', 'Volatility 150 (1s)', 'Volatility 150 (1s) Index', 'synthetic', VOL1S, 2),
  deriv('1HZ250V', 'Volatility 250 (1s)', 'Volatility 250 (1s) Index', 'synthetic', VOL1S, 2),
  deriv('BOOM300N', 'Boom 300', 'Boom 300 Index', 'synthetic', BC, 3),
  deriv('BOOM500', 'Boom 500', 'Boom 500 Index', 'synthetic', BC, 3),
  deriv('BOOM600', 'Boom 600', 'Boom 600 Index', 'synthetic', BC, 3),
  deriv('BOOM900', 'Boom 900', 'Boom 900 Index', 'synthetic', BC, 3),
  deriv('BOOM1000', 'Boom 1000', 'Boom 1000 Index', 'synthetic', BC, 3),
  deriv('CRASH300N', 'Crash 300', 'Crash 300 Index', 'synthetic', BC, 3),
  deriv('CRASH500', 'Crash 500', 'Crash 500 Index', 'synthetic', BC, 3),
  deriv('CRASH600', 'Crash 600', 'Crash 600 Index', 'synthetic', BC, 3),
  deriv('CRASH900', 'Crash 900', 'Crash 900 Index', 'synthetic', BC, 3),
  deriv('CRASH1000', 'Crash 1000', 'Crash 1000 Index', 'synthetic', BC, 3),
  deriv('stpRNG', 'Step Index', 'Step Index 100', 'synthetic', 'Step', 1),
  deriv('stpRNG2', 'Step Index 200', 'Step Index 200', 'synthetic', 'Step', 1),
  deriv('stpRNG3', 'Step Index 300', 'Step Index 300', 'synthetic', 'Step', 1),
  deriv('stpRNG4', 'Step Index 400', 'Step Index 400', 'synthetic', 'Step', 1),
  deriv('stpRNG5', 'Step Index 500', 'Step Index 500', 'synthetic', 'Step', 1),
  deriv('JD10', 'Jump 10', 'Jump 10 Index', 'synthetic', 'Jump', 2),
  deriv('JD25', 'Jump 25', 'Jump 25 Index', 'synthetic', 'Jump', 2),
  deriv('JD50', 'Jump 50', 'Jump 50 Index', 'synthetic', 'Jump', 2),
  deriv('JD75', 'Jump 75', 'Jump 75 Index', 'synthetic', 'Jump', 2),
  deriv('JD100', 'Jump 100', 'Jump 100 Index', 'synthetic', 'Jump', 2),
  deriv('RB100', 'Range Break 100', 'Range Break 100 Index', 'synthetic', 'Range Break', 1),
  deriv('RB200', 'Range Break 200', 'Range Break 200 Index', 'synthetic', 'Range Break', 1),
  deriv('RDBEAR', 'Bear Market', 'Bear Market Index', 'synthetic', 'Mercado Bull/Bear', 4),
  deriv('RDBULL', 'Bull Market', 'Bull Market Index', 'synthetic', 'Mercado Bull/Bear', 4),
  deriv('DEX600UP', 'DEX 600 UP', 'DEX 600 UP Index', 'synthetic', 'DEX', 2),
  deriv('DEX600DN', 'DEX 600 DOWN', 'DEX 600 DOWN Index', 'synthetic', 'DEX', 2),
  deriv('DEX900UP', 'DEX 900 UP', 'DEX 900 UP Index', 'synthetic', 'DEX', 2),
  deriv('DEX900DN', 'DEX 900 DOWN', 'DEX 900 DOWN Index', 'synthetic', 'DEX', 2),
  deriv('DEX1500UP', 'DEX 1500 UP', 'DEX 1500 UP Index', 'synthetic', 'DEX', 2),
  deriv('DEX1500DN', 'DEX 1500 DOWN', 'DEX 1500 DOWN Index', 'synthetic', 'DEX', 2),
  deriv('DSI10', 'Drift Switch 10', 'Drift Switch Index 10', 'synthetic', 'Drift Switch', 3),
  deriv('DSI20', 'Drift Switch 20', 'Drift Switch Index 20', 'synthetic', 'Drift Switch', 3),
  deriv('DSI30', 'Drift Switch 30', 'Drift Switch Index 30', 'synthetic', 'Drift Switch', 3),
  deriv('WLDAUD', 'AUD Basket', 'AUD Basket', 'synthetic', 'Cestas', 3),
  deriv('WLDEUR', 'EUR Basket', 'EUR Basket', 'synthetic', 'Cestas', 3),
  deriv('WLDGBP', 'GBP Basket', 'GBP Basket', 'synthetic', 'Cestas', 3),
  deriv('WLDUSD', 'USD Basket', 'USD Basket', 'synthetic', 'Cestas', 3),
  deriv('WLDXAU', 'Gold Basket', 'Gold Basket', 'synthetic', 'Cestas', 3),
];

const FX_PAIRS: [string, number][] = [
  ['EURUSD', 5], ['GBPUSD', 5], ['USDJPY', 3], ['AUDUSD', 5], ['USDCAD', 5], ['USDCHF', 5], ['NZDUSD', 5],
  ['EURGBP', 5], ['EURJPY', 3], ['GBPJPY', 3], ['EURCHF', 5], ['AUDJPY', 3], ['EURAUD', 5], ['GBPAUD', 5],
  ['EURCAD', 5], ['GBPCHF', 5], ['AUDCAD', 5], ['AUDCHF', 5], ['AUDNZD', 5], ['CADJPY', 3], ['CHFJPY', 3],
  ['EURNZD', 5], ['GBPCAD', 5], ['GBPNZD', 5], ['NZDJPY', 3], ['USDMXN', 4], ['USDNOK', 4], ['USDPLN', 4],
  ['USDSEK', 4],
];

const MAJORS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD']);

const FOREX: SymbolInfo[] = FX_PAIRS.map(([p, prec]) =>
  deriv(`frx${p}`, p, `${p.slice(0, 3)}/${p.slice(3)}`, 'forex', MAJORS.has(p) ? 'Principais' : 'Cruzados e exóticos', prec, {
    contractSize: 100000,
    baseCurrency: p.slice(0, 3),
    quoteCurrency: p.slice(3),
  }),
);

const COMMODITIES: SymbolInfo[] = [
  deriv('frxXAUUSD', 'XAUUSD', 'Ouro / Dólar', 'commodities', 'Metais', 2, { contractSize: 100, baseCurrency: 'XAU', quoteCurrency: 'USD' }),
  deriv('frxXAGUSD', 'XAGUSD', 'Prata / Dólar', 'commodities', 'Metais', 4, { contractSize: 5000, baseCurrency: 'XAG', quoteCurrency: 'USD' }),
  deriv('frxXPTUSD', 'XPTUSD', 'Platina / Dólar', 'commodities', 'Metais', 2, { contractSize: 100, baseCurrency: 'XPT', quoteCurrency: 'USD' }),
  deriv('frxXPDUSD', 'XPDUSD', 'Paládio / Dólar', 'commodities', 'Metais', 2, { contractSize: 100, baseCurrency: 'XPD', quoteCurrency: 'USD' }),
];

const DERIV_INDICES: SymbolInfo[] = [
  deriv('OTC_SPC', 'US 500', 'US 500 (S&P 500)', 'indices', 'Américas', 2),
  deriv('OTC_NDX', 'US Tech 100', 'US Tech 100 (Nasdaq 100)', 'indices', 'Américas', 2),
  deriv('OTC_DJI', 'Wall Street 30', 'Wall Street 30 (Dow Jones)', 'indices', 'Américas', 2),
  deriv('OTC_GDAXI', 'Germany 40', 'Germany 40 (DAX)', 'indices', 'Europa', 2),
  deriv('OTC_FTSE', 'UK 100', 'UK 100 (FTSE)', 'indices', 'Europa', 2),
  deriv('OTC_FCHI', 'France 40', 'France 40 (CAC)', 'indices', 'Europa', 2),
  deriv('OTC_SX5E', 'Euro 50', 'Euro 50 (Euro Stoxx)', 'indices', 'Europa', 2),
  deriv('OTC_SSMI', 'Swiss 20', 'Swiss 20 (SMI)', 'indices', 'Europa', 2),
  deriv('OTC_AEX', 'Netherlands 25', 'Netherlands 25 (AEX)', 'indices', 'Europa', 2),
  deriv('OTC_N225', 'Japan 225', 'Japan 225 (Nikkei)', 'indices', 'Ásia/Pacífico', 2),
  deriv('OTC_HSI', 'Hong Kong 50', 'Hong Kong 50 (Hang Seng)', 'indices', 'Ásia/Pacífico', 2),
  deriv('OTC_AS51', 'Australia 200', 'Australia 200 (ASX)', 'indices', 'Ásia/Pacífico', 2),
];

function binance(base: string, precision: number, description: string, quote = 'USDT'): SymbolInfo {
  return {
    id: `BINANCE:${base}${quote}`,
    provider: 'binance',
    ticker: `${base}${quote}`,
    name: `${base}${quote}`,
    description: `${description} / ${quote === 'USDT' ? 'TetherUS' : quote}`,
    assetClass: 'crypto',
    category: quote,
    precision,
    contractSize: 1,
    baseCurrency: base,
    quoteCurrency: quote,
    session: '24x7',
    hasVolume: true,
    exchange: 'Binance',
  };
}

const CRYPTO: SymbolInfo[] = [
  binance('BTC', 2, 'Bitcoin'),
  binance('ETH', 2, 'Ethereum'),
  binance('BNB', 2, 'BNB'),
  binance('SOL', 2, 'Solana'),
  binance('XRP', 4, 'XRP'),
  binance('ADA', 4, 'Cardano'),
  binance('DOGE', 5, 'Dogecoin'),
  binance('AVAX', 2, 'Avalanche'),
  binance('DOT', 3, 'Polkadot'),
  binance('LINK', 2, 'Chainlink'),
  binance('LTC', 2, 'Litecoin'),
  binance('TRX', 4, 'TRON'),
  binance('TON', 3, 'Toncoin'),
  binance('SHIB', 8, 'Shiba Inu'),
  binance('PEPE', 8, 'Pepe'),
  binance('NEAR', 3, 'NEAR'),
  binance('ATOM', 3, 'Cosmos'),
  binance('UNI', 3, 'Uniswap'),
  binance('BCH', 1, 'Bitcoin Cash'),
  binance('XLM', 4, 'Stellar'),
  binance('APT', 3, 'Aptos'),
  binance('ARB', 4, 'Arbitrum'),
  binance('OP', 4, 'Optimism'),
  binance('SUI', 4, 'Sui'),
  binance('INJ', 2, 'Injective'),
  binance('PAXG', 2, 'PAX Gold'),
  binance('ETH', 5, 'Ethereum', 'BTC'),
  deriv('cryBTCUSD', 'BTCUSD', 'Bitcoin / Dólar (Deriv)', 'crypto', 'Deriv', 2, { baseCurrency: 'BTC', quoteCurrency: 'USD' }),
  deriv('cryETHUSD', 'ETHUSD', 'Ethereum / Dólar (Deriv)', 'crypto', 'Deriv', 2, { baseCurrency: 'ETH', quoteCurrency: 'USD' }),
];

function yahoo(ticker: string, name: string, description: string, assetClass: AssetClass, category: string, precision = 2, extra: Partial<SymbolInfo> = {}): SymbolInfo {
  return {
    id: `YAHOO:${ticker}`,
    provider: 'yahoo',
    ticker,
    name,
    description,
    assetClass,
    category,
    precision,
    contractSize: 1,
    session: 'exchange',
    hasVolume: assetClass !== 'indices',
    exchange: 'Yahoo Finance',
    ...extra,
  };
}

const YAHOO: SymbolInfo[] = [
  yahoo('^GSPC', 'SPX', 'S&P 500', 'indices', 'Américas'),
  yahoo('^NDX', 'NDX', 'Nasdaq 100', 'indices', 'Américas'),
  yahoo('^DJI', 'DJI', 'Dow Jones Industrial Average', 'indices', 'Américas'),
  yahoo('^RUT', 'RUT', 'Russell 2000', 'indices', 'Américas'),
  yahoo('^VIX', 'VIX', 'CBOE Volatility Index', 'indices', 'Américas'),
  yahoo('^GDAXI', 'DAX', 'DAX 40', 'indices', 'Europa'),
  yahoo('^FTSE', 'UKX', 'FTSE 100', 'indices', 'Europa'),
  yahoo('^N225', 'NI225', 'Nikkei 225', 'indices', 'Ásia/Pacífico'),
  yahoo('DX-Y.NYB', 'DXY', 'Índice do Dólar (DXY)', 'indices', 'Américas', 3),
  yahoo('ES=F', 'ES1!', 'E-mini S&P 500', 'futures', 'Índices'),
  yahoo('NQ=F', 'NQ1!', 'E-mini Nasdaq 100', 'futures', 'Índices'),
  yahoo('YM=F', 'YM1!', 'E-mini Dow', 'futures', 'Índices', 0),
  yahoo('CL=F', 'CL1!', 'Petróleo WTI', 'futures', 'Energia'),
  yahoo('BZ=F', 'BRN1!', 'Petróleo Brent', 'futures', 'Energia'),
  yahoo('NG=F', 'NG1!', 'Gás Natural', 'futures', 'Energia', 3),
  yahoo('GC=F', 'GC1!', 'Ouro (futuros)', 'futures', 'Metais', 1),
  yahoo('SI=F', 'SI1!', 'Prata (futuros)', 'futures', 'Metais', 3),
  yahoo('HG=F', 'HG1!', 'Cobre (futuros)', 'futures', 'Metais', 4),
  yahoo('AAPL', 'AAPL', 'Apple Inc.', 'stocks', 'EUA'),
  yahoo('MSFT', 'MSFT', 'Microsoft Corp.', 'stocks', 'EUA'),
  yahoo('NVDA', 'NVDA', 'NVIDIA Corp.', 'stocks', 'EUA'),
  yahoo('TSLA', 'TSLA', 'Tesla Inc.', 'stocks', 'EUA'),
  yahoo('AMZN', 'AMZN', 'Amazon.com Inc.', 'stocks', 'EUA'),
  yahoo('GOOGL', 'GOOGL', 'Alphabet Inc.', 'stocks', 'EUA'),
  yahoo('META', 'META', 'Meta Platforms', 'stocks', 'EUA'),
  yahoo('NFLX', 'NFLX', 'Netflix Inc.', 'stocks', 'EUA'),
  yahoo('AMD', 'AMD', 'Advanced Micro Devices', 'stocks', 'EUA'),
  yahoo('JPM', 'JPM', 'JPMorgan Chase', 'stocks', 'EUA'),
  yahoo('KO', 'KO', 'Coca-Cola Co.', 'stocks', 'EUA'),
];

function demo(ticker: string, name: string, description: string, precision: number, extra: Partial<SymbolInfo> = {}): SymbolInfo {
  return {
    id: `DEMO:${ticker}`,
    provider: 'demo',
    ticker,
    name,
    description,
    assetClass: 'demo',
    category: 'Funciona sem internet',
    precision,
    contractSize: 1,
    session: '24x7',
    hasVolume: true,
    exchange: 'Simulado',
    ...extra,
  };
}

const DEMO: SymbolInfo[] = [
  demo('SIMFX', 'SIM-FX', 'Par de moedas simulado', 5, { contractSize: 100000 }),
  demo('SIMVOL', 'SIM-VOL', 'Índice de volatilidade simulado', 2),
  demo('SIMBTC', 'SIM-BTC', 'Cripto simulada', 2),
  demo('SIMIDX', 'SIM-IDX', 'Índice de ações simulado', 2),
];

export const CATALOG: SymbolInfo[] = [
  ...SYNTHETICS,
  ...FOREX,
  ...COMMODITIES,
  ...DERIV_INDICES,
  ...CRYPTO,
  ...YAHOO,
  ...DEMO,
];

const registry = new Map<string, SymbolInfo>(CATALOG.map((s) => [s.id, s]));

/** Regista um símbolo. Por omissão mantém os dados do catálogo se já existir. */
export function registerSymbol(info: SymbolInfo, overwrite = false): SymbolInfo {
  const prev = registry.get(info.id);
  const next = prev ? (overwrite ? { ...prev, ...info } : prev) : info;
  registry.set(info.id, next);
  return next;
}

export function allSymbols(): SymbolInfo[] {
  return Array.from(registry.values());
}

/** Resolve qualquer id ("BINANCE:FETUSDT", "YAHOO:PETR4.SA"…), mesmo fora do catálogo. */
export function resolveSymbol(id: string): SymbolInfo {
  const known = registry.get(id);
  if (known) return known;
  const idx = id.indexOf(':');
  const prefix = (idx > 0 ? id.slice(0, idx) : 'BINANCE').toUpperCase();
  const ticker = idx > 0 ? id.slice(idx + 1) : id;
  const provider: ProviderId =
    prefix === 'DERIV' ? 'deriv' : prefix === 'YAHOO' ? 'yahoo' : prefix === 'DEMO' ? 'demo' : 'binance';
  const info: SymbolInfo = {
    id: `${PROVIDER_LABEL[provider]}:${ticker}`,
    provider,
    ticker,
    name: ticker.replace(/^frx|^cry/, ''),
    description: ticker,
    assetClass: provider === 'binance' ? 'crypto' : provider === 'yahoo' ? 'stocks' : provider === 'demo' ? 'demo' : 'synthetic',
    precision: 2,
    contractSize: 1,
    session: provider === 'binance' ? '24x7' : 'exchange',
    hasVolume: provider !== 'deriv',
    exchange: PROVIDER_LABEL[provider],
  };
  registry.set(info.id, info);
  return info;
}

export const DEFAULT_SYMBOL = 'DERIV:R_75';

export const DEFAULT_WATCHLIST = [
  'DERIV:R_75',
  'DERIV:R_100',
  'DERIV:1HZ75V',
  'DERIV:BOOM1000',
  'DERIV:CRASH1000',
  'DERIV:stpRNG',
  'DERIV:frxEURUSD',
  'DERIV:frxGBPUSD',
  'DERIV:frxUSDJPY',
  'DERIV:frxXAUUSD',
  'DERIV:OTC_NDX',
  'BINANCE:BTCUSDT',
  'BINANCE:ETHUSDT',
  'BINANCE:SOLUSDT',
  'YAHOO:^GSPC',
  'DEMO:SIMFX',
];

/** Conversão aproximada de lucro na moeda de cotação para USD. */
export function quoteToUsd(info: SymbolInfo, price: number): number {
  const q = info.quoteCurrency;
  if (!q || q === 'USD' || q === 'USDT' || q === 'USDC' || q === 'FDUSD') return 1;
  if (info.baseCurrency === 'USD' && price > 0) return 1 / price;
  return 1;
}

/** Valor de um "pip" (forex) ou do mínimo movimento. */
export function pipSize(info: SymbolInfo): number {
  if (info.assetClass === 'forex') return info.precision === 3 || info.precision === 2 ? 0.01 : 0.0001;
  return Math.pow(10, -info.precision);
}
