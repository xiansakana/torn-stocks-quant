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

/** Live portfolio position (paper trading) */
export interface LivePosition {
  symbol: string;
  entryPrice: number;
  entryDate: number;
  shares: number;
  cost: number;
  peakPrice: number;
}

/** Paper-trading portfolio persisted in localStorage */
export interface LivePortfolioState {
  cash: number;
  initialCapital: number;
  positions: LivePosition[];
  /** Last known signal per symbol — used to detect triggers */
  lastSignals: Record<string, SignalType>;
  /** First sync seeds signals without trading */
  signalsSeeded: boolean;
  appliedAt: number;
  lastSyncedAt: number | null;
}

/** Open holding at a point in time */
export interface PositionHolding {
  symbol?: string;
  shares: number;
  price: number;
  marketValue: number;
  cost: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

/** Portfolio snapshot including cash */
export interface PositionSnapshot {
  timestamp: number;
  cash: number;
  holdings: PositionHolding[];
  holdingsValue: number;
  totalEquity: number;
}

/** Live / current portfolio state from strategy simulation */
export interface CurrentPortfolioState {
  timestamp: number;
  cash: number;
  holdings: PositionHolding[];
  holdingsValue: number;
  totalEquity: number;
  initialCapital: number;
  mode: "single" | "portfolio";
  symbol?: string;
}

/** Backtest result */
export interface BacktestResult {
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  equityCurve: { timestamp: number; equity: number }[];
  positionHistory?: PositionSnapshot[];
  initialCapital?: number;
  mode?: "single" | "portfolio";
  symbol?: string;
  /** Symbols included in portfolio backtest */
  symbols?: string[];
  startDate?: string | null;
  endDate?: string | null;
}

/** Saved backtest run in localStorage */
export interface BacktestHistoryParams {
  mode: "single" | "portfolio";
  symbol?: string;
  /** Portfolio mode: selected symbols (omit = all tracked) */
  symbols?: string[];
  interval: Interval;
  capital: number;
  config: StrategyConfig;
  startDate?: string;
  endDate?: string;
}

export interface BacktestHistoryRecord {
  id: string;
  ranAt: number;
  label: string;
  params: BacktestHistoryParams;
  result: BacktestResult;
}

export interface BacktestTrade {
  symbol?: string;
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
  sellFee: number;
  /** Combined score above this → BUY candidate */
  buyThreshold: number;
  /** Combined score below this → SELL */
  sellThreshold: number;
  /** Minimum score to actually open a position */
  minBuyScore: number;
  /** Exit on SELL signal (if false, only stop/take-profit/trailing) */
  exitOnSellSignal: boolean;
  /** Fraction of capital per position (0.4 = 40%) */
  positionSize: number;
  /** Max simultaneous holdings in portfolio mode */
  maxPositions: number;
  /** Stop loss as fraction (0.08 = -8%) */
  stopLoss: number;
  /** Take profit as fraction */
  takeProfit: number;
  /** Trailing stop from peak (0.12 = -12% from high) */
  trailingStop: number;
  /** Scale position size by signal strength */
  scaleByScore: boolean;
}

/** D1 defaults — TP/SL/trailing tuned on market-d1.xlsx (see walk-forward-d1.json) */
export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  rsiPeriod: 14,
  rsiOverbought: 58,
  rsiOversold: 42,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bollingerPeriod: 20,
  bollingerStdDev: 2,
  sellFee: 0.001,
  buyThreshold: 0.25,
  sellThreshold: -0.3,
  minBuyScore: 0.4,
  exitOnSellSignal: true,
  positionSize: 1,
  maxPositions: 4,
  stopLoss: 0.04,
  takeProfit: 0.03,
  trailingStop: 0.05,
  scaleByScore: true,
};

/** Tracked stock symbols */
export const TRACKED_SYMBOLS = [
  "FHG", "MUN", "TCI", "SYM", "MCS", "TSB", "CNC", "TMI", "PTS", "WLT",
  "IOU", "GRN", "BAG", "WSU", "TCP", "TGP", "MSG", "PRN", "HRG", "LSC",
  "SYS", "CBD", "TCC", "ASS", "EWM", "THS", "EVL", "LAG", "ELT", "TCM",
  "TCT", "LOS", "YAZ", "IIL", "IST",
] as const;

export type TrackedSymbol = (typeof TRACKED_SYMBOLS)[number];

/** All supported chart / backtest intervals (finest → coarsest) */
export const ALL_INTERVALS: Interval[] = [
  "m1", "m5", "m15", "m30", "h1", "h2", "h4", "h6", "h12", "d1", "w1", "n1", "y1",
];

/** Interval display labels (1m = minute, 1M = month) */
export const INTERVAL_LABELS: Record<Interval, string> = {
  m1: "1m",
  m5: "5m",
  m15: "15m",
  m30: "30m",
  h1: "1h",
  h2: "2h",
  h4: "4h",
  h6: "6h",
  h12: "12h",
  d1: "1D",
  w1: "1W",
  n1: "1M",
  y1: "1Y",
};
