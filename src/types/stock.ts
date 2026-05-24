// Torn Stocks Quant - Type Definitions

/** Stock info from /api/stocks */
export interface StockInfo {
  stock: string;
  name: string;
  price: string;
  total_shares: number;
  investors: number;
  marketcap?: number;
  index?: number;
}

/** Stocks API response */
export interface StocksResponse {
  data: StockInfo[];
  timestamp: number;
}

/** OHLCV candle data from historical API (interval > m1) */
export interface OHLCVCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Tick data from historical API (m1 interval) */
export interface TickData {
  timestamp: number;
  price: number;
  totalShares: number;
}

/** Supported intervals */
export type Interval =
  | "y1"
  | "n1"
  | "w1"
  | "d1"
  | "h12"
  | "h6"
  | "h4"
  | "h2"
  | "h1"
  | "m30"
  | "m15"
  | "m5"
  | "m1";

/** Technical indicator result */
export interface TechnicalIndicators {
  rsi: number[];
  macd: { macd: number[]; signal: number[]; histogram: number[] };
  bollingerBands: { upper: number[]; middle: number[]; lower: number[] };
  sma20: number[];
  sma50: number[];
  ema12: number[];
  ema26: number[];
}

/** Strategy signal */
export type SignalType = "BUY" | "SELL" | "HOLD";

export interface StrategySignal {
  symbol: string;
  name: string;
  price: number;
  signal: SignalType;
  strength: number; // 0-100
  rsi: number;
  macdSignal: SignalType;
  bollingerSignal: SignalType;
  rsiSignal: SignalType;
  combinedScore: number;
}

/** Backtest result */
export interface BacktestResult {
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  equityCurve: { timestamp: number; equity: number }[];
}

export interface BacktestTrade {
  entryDate: number;
  exitDate: number;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  pnl: number;
  pnlPercent: number;
  fee: number;
  signal: string;
}

export interface BacktestMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  winRate: number;
  totalTrades: number;
  avgTradeReturn: number;
  profitFactor: number;
  sharpeRatio: number;
  totalFees: number;
}

/** Strategy config */
export interface StrategyConfig {
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  bollingerPeriod: number;
  bollingerStdDev: number;
  sellFee: number; // 0.001 = 0.1%
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bollingerPeriod: 20,
  bollingerStdDev: 2,
  sellFee: 0.001,
};

/** Tracked stock symbols */
export const TRACKED_SYMBOLS = [
  "FHG", "MUN", "TCI", "SYM", "MCS", "TSB", "CNC", "TMI", "PTS", "WLT",
  "IOU", "GRN", "BAG", "WSU", "TCP", "TGP", "MSG", "PRN", "HRG", "LSC",
  "SYS", "CBD", "TCC", "ASS", "EWM", "THS", "EVL", "LAG", "ELT", "TCM",
  "TCT", "LOS", "YAZ", "IIL", "IST",
] as const;

export type TrackedSymbol = (typeof TRACKED_SYMBOLS)[number];

/** Interval display labels */
export const INTERVAL_LABELS: Record<Interval, string> = {
  y1: "1Y",
  n1: "1M",
  w1: "1W",
  d1: "1D",
  h12: "12H",
  h6: "6H",
  h4: "4H",
  h2: "2H",
  h1: "1H",
  m30: "30M",
  m15: "15M",
  m5: "5M",
  m1: "1M",
};
