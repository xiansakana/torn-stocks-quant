// Backtesting Engine for Torn Stocks Quant
import type {
  OHLCVCandle,
  StrategyConfig,
  BacktestResult,
  BacktestTrade,
  BacktestMetrics,
  SignalType,
} from "@/types/stock";
import { computeIndicators, computeCombinedScore } from "./technical-analysis";

/** Bars required before indicators are valid and trading can begin. */
export const WARMUP_BARS = 50;

/** Filter candles to a date range (inclusive). Dates are YYYY-MM-DD strings. */
export function filterCandlesByDateRange(
  candles: OHLCVCandle[],
  startDate?: string,
  endDate?: string
): OHLCVCandle[] {
  if (!startDate && !endDate) return candles;
  const startTs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : 0;
  const endTs = endDate
    ? new Date(`${endDate}T23:59:59.999`).getTime()
    : Number.POSITIVE_INFINITY;
  return candles.filter(
    (c) => c.timestamp >= startTs && c.timestamp <= endTs
  );
}

/**
 * Prepare candles for backtest: keep warmup history before startDate so trading
 * can begin on the selected start date instead of WARMUP_BARS later.
 */
export function prepareBacktestCandles(
  candles: OHLCVCandle[],
  startDate?: string,
  endDate?: string,
  warmupBars: number = WARMUP_BARS
): { candles: OHLCVCandle[]; tradingStartTs: number } {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const endTs = endDate
    ? new Date(`${endDate}T23:59:59.999`).getTime()
    : Number.POSITIVE_INFINITY;
  const capped = sorted.filter((c) => c.timestamp <= endTs);

  if (!startDate) {
    const firstTradingTs =
      capped[warmupBars]?.timestamp ?? capped[0]?.timestamp ?? 0;
    return { candles: capped, tradingStartTs: firstTradingTs };
  }

  const startTs = new Date(`${startDate}T00:00:00`).getTime();
  const startIdx = capped.findIndex((c) => c.timestamp >= startTs);
  if (startIdx === -1) {
    return { candles: [], tradingStartTs: startTs };
  }

  const sliceFrom = Math.max(0, startIdx - warmupBars);
  return {
    candles: capped.slice(sliceFrom),
    tradingStartTs: startTs,
  };
}

export interface BacktestOptions {
  /** Only record trades / equity from this timestamp (ms). Used with warmup prefix. */
  tradingStartTs?: number;
}

function trimBacktestResult(
  result: BacktestResult,
  tradingStartTs: number | undefined,
  initialCapital: number
): BacktestResult {
  if (!tradingStartTs) return result;

  const equityCurve = result.equityCurve.filter(
    (p) => p.timestamp >= tradingStartTs
  );
  const trades = result.trades.filter((t) => t.entryDate >= tradingStartTs);

  if (equityCurve.length === 0) {
    equityCurve.push({ timestamp: tradingStartTs, equity: initialCapital });
  }

  return {
    ...result,
    trades,
    equityCurve,
    metrics: computeMetrics(trades, initialCapital, equityCurve),
  };
}

interface Position {
  symbol?: string;
  entryPrice: number;
  entryDate: number;
  shares: number;
  cost: number;
  peakPrice: number;
}

function positionAlloc(
  config: StrategyConfig,
  initialCapital: number,
  cash: number,
  score: number
): number {
  let size = config.positionSize;
  if (config.scaleByScore && score > config.minBuyScore) {
    const strength = Math.min(
      1,
      (score - config.minBuyScore) / (1 - config.minBuyScore + 0.01)
    );
    size *= 0.7 + strength * 0.3;
  }
  return Math.min(initialCapital * size, cash * 0.95);
}

function shouldExit(
  config: StrategyConfig,
  pos: Position,
  price: number,
  signal: SignalType
): boolean {
  if (price > pos.peakPrice) pos.peakPrice = price;
  const pnlPct = (price - pos.entryPrice) / pos.entryPrice;
  const drawdownFromPeak =
    pos.peakPrice > 0 ? (pos.peakPrice - price) / pos.peakPrice : 0;

  const signalExit = config.exitOnSellSignal && signal === "SELL";

  return (
    signalExit ||
    pnlPct <= -config.stopLoss ||
    pnlPct >= config.takeProfit ||
    (config.trailingStop > 0 && drawdownFromPeak >= config.trailingStop)
  );
}

function closePosition(
  pos: Position,
  exitPrice: number,
  exitDate: number,
  sellFee: number,
  signal: string
): { trade: BacktestTrade; proceeds: number } {
  const grossProceeds = pos.shares * exitPrice;
  const fee = grossProceeds * sellFee;
  const netProceeds = grossProceeds - fee;
  const pnl = netProceeds - pos.cost;

  return {
    trade: {
      symbol: pos.symbol,
      entryDate: pos.entryDate,
      exitDate,
      entryPrice: pos.entryPrice,
      exitPrice,
      shares: pos.shares,
      pnl,
      pnlPercent: pos.cost > 0 ? pnl / pos.cost : 0,
      fee,
      signal,
    },
    proceeds: netProceeds,
  };
}

function computeMetrics(
  trades: BacktestTrade[],
  initialCapital: number,
  equityCurve: { timestamp: number; equity: number }[]
): BacktestMetrics {
  if (equityCurve.length === 0) {
    return {
      totalReturn: 0,
      totalReturnPercent: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      winRate: 0,
      totalTrades: 0,
      avgTradeReturn: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      totalFees: 0,
    };
  }

  const finalEquity = equityCurve[equityCurve.length - 1].equity;
  const totalReturn = finalEquity - initialCapital;
  const totalReturnPercent = totalReturn / initialCapital;

  const winningTrades = trades.filter((t) => t.pnl > 0);
  const losingTrades = trades.filter((t) => t.pnl < 0);
  const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;

  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

  const avgTradeReturn =
    trades.length > 0
      ? trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length
      : 0;

  const totalFees = trades.reduce((sum, t) => sum + t.fee, 0);

  const firstDate = equityCurve[0].timestamp;
  const lastDate = equityCurve[equityCurve.length - 1].timestamp;
  const msPerYear = 365.25 * 24 * 3600 * 1000;
  const yearsDiff = (lastDate - firstDate) / msPerYear;
  const annualizedReturn =
    yearsDiff > 0 && finalEquity > 0
      ? Math.pow(finalEquity / initialCapital, 1 / yearsDiff) - 1
      : 0;

  let peak = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const drawdown = peak - point.equity;
    const drawdownPercent = peak > 0 ? drawdown / peak : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    if (drawdownPercent > maxDrawdownPercent) maxDrawdownPercent = drawdownPercent;
  }

  const returns = trades.map((t) => t.pnlPercent);
  const avgReturn =
    returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdReturn =
    returns.length > 0
      ? Math.sqrt(
          returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length
        )
      : 0;
  const sharpeRatio = stdReturn === 0 ? 0 : avgReturn / stdReturn;

  return {
    totalReturn,
    totalReturnPercent,
    annualizedReturn,
    maxDrawdown,
    maxDrawdownPercent,
    winRate,
    totalTrades: trades.length,
    avgTradeReturn,
    profitFactor,
    sharpeRatio,
    totalFees,
  };
}

/** Single-stock backtest with partial position sizing and risk controls */
export function runSingleStockBacktest(
  candles: OHLCVCandle[],
  config: StrategyConfig,
  initialCapital: number = 100000,
  symbol?: string,
  options?: BacktestOptions
): BacktestResult {
  const tradingStartTs = options?.tradingStartTs ?? 0;
  const indicators = computeIndicators(candles, config);
  const trades: BacktestTrade[] = [];
  const equityCurve: { timestamp: number; equity: number }[] = [];

  let cash = initialCapital;
  let position: Position | null = null;

  for (let i = WARMUP_BARS; i < candles.length; i++) {
    const candle = candles[i];
    if (candle.timestamp < tradingStartTs) continue;

    const price = candle.close;
    const { score, signal } = computeCombinedScore(i, candles, indicators, config);

    if (position && shouldExit(config, position, price, signal)) {
      const { trade, proceeds } = closePosition(
        position,
        price,
        candle.timestamp,
        config.sellFee,
        "exit"
      );
      trades.push(trade);
      cash += proceeds;
      position = null;
    }

    if (
      signal === "BUY" &&
      !position &&
      score >= config.minBuyScore
    ) {
      const alloc = positionAlloc(config, initialCapital, cash, score);
      const shares = Math.floor(alloc / price);
      if (shares > 0) {
        const cost = shares * price;
        position = {
          symbol,
          entryPrice: price,
          entryDate: candle.timestamp,
          shares,
          cost,
          peakPrice: price,
        };
        cash -= cost;
      }
    }

    equityCurve.push({
      timestamp: candle.timestamp,
      equity: cash + (position ? position.shares * price : 0),
    });
  }

  if (position && candles.length > 0) {
    const last = candles[candles.length - 1];
    if (last.timestamp >= tradingStartTs) {
      const { trade, proceeds } = closePosition(
        position,
        last.close,
        last.timestamp,
        config.sellFee,
        "eod"
      );
      trades.push(trade);
      cash += proceeds;
    }
  }

  return trimBacktestResult(
    {
      mode: "single",
      trades,
      metrics: computeMetrics(trades, initialCapital, equityCurve),
      equityCurve,
    },
    tradingStartTs || undefined,
    initialCapital
  );
}

export interface StockCandleSeries {
  symbol: string;
  candles: OHLCVCandle[];
}

/** Multi-stock portfolio backtest — diversifies across top signals */
export function runPortfolioBacktest(
  stockSeries: StockCandleSeries[],
  config: StrategyConfig,
  initialCapital: number = 100000,
  options?: BacktestOptions
): BacktestResult {
  const tradingStartTs = options?.tradingStartTs ?? 0;
  const allTs = new Set<number>();
  for (const { candles } of stockSeries) {
    for (const c of candles) allTs.add(c.timestamp);
  }
  const timestamps = [...allTs].sort((a, b) => a - b);

  const bySymbol: Record<
    string,
    {
      map: Map<number, OHLCVCandle>;
      candles: OHLCVCandle[];
      indicators: ReturnType<typeof computeIndicators>;
      tsIndex: Map<number, number>;
    }
  > = {};

  for (const { symbol, candles } of stockSeries) {
    bySymbol[symbol] = {
      map: new Map(candles.map((c) => [c.timestamp, c])),
      candles,
      indicators: computeIndicators(candles, config),
      tsIndex: new Map(candles.map((c, i) => [c.timestamp, i])),
    };
  }

  let cash = initialCapital;
  const positions: Record<string, Position> = {};
  const trades: BacktestTrade[] = [];
  const equityCurve: { timestamp: number; equity: number }[] = [];

  for (const ts of timestamps) {
    if (ts < tradingStartTs) continue;

    const candidates: {
      symbol: string;
      candle: OHLCVCandle;
      score: number;
      signal: SignalType;
    }[] = [];

    for (const { symbol } of stockSeries) {
      const entry = bySymbol[symbol];
      const candle = entry.map.get(ts);
      if (!candle) continue;
      const idx = entry.tsIndex.get(ts);
      if (idx == null || idx < WARMUP_BARS) continue;
      const { score, signal } = computeCombinedScore(
        idx,
        entry.candles,
        entry.indicators,
        config
      );
      candidates.push({ symbol, candle, score, signal });
    }

    for (const sym of Object.keys(positions)) {
      const pos = positions[sym];
      const candle = bySymbol[sym].map.get(ts);
      if (!candle) continue;
      const idx = bySymbol[sym].tsIndex.get(ts)!;
      const { signal } = computeCombinedScore(
        idx,
        bySymbol[sym].candles,
        bySymbol[sym].indicators,
        config
      );

      if (shouldExit(config, pos, candle.close, signal)) {
        const { trade, proceeds } = closePosition(
          pos,
          candle.close,
          ts,
          config.sellFee,
          "exit"
        );
        trades.push(trade);
        cash += proceeds;
        delete positions[sym];
      }
    }

    const held = Object.keys(positions).length;
    const slots = config.maxPositions - held;
    if (slots > 0) {
      const buys = candidates
        .filter(
          (c) =>
            c.signal === "BUY" &&
            c.score >= config.minBuyScore &&
            !positions[c.symbol]
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, slots);

      for (const b of buys) {
        const alloc = positionAlloc(config, initialCapital, cash, b.score);
        const shares = Math.floor(alloc / b.candle.close);
        if (shares <= 0) continue;
        const cost = shares * b.candle.close;
        positions[b.symbol] = {
          symbol: b.symbol,
          entryPrice: b.candle.close,
          entryDate: ts,
          shares,
          cost,
          peakPrice: b.candle.close,
        };
        cash -= cost;
      }
    }

    let equity = cash;
    for (const sym of Object.keys(positions)) {
      const candle = bySymbol[sym].map.get(ts);
      if (candle) equity += positions[sym].shares * candle.close;
    }
    equityCurve.push({ timestamp: ts, equity });
  }

  for (const sym of Object.keys(positions)) {
    const pos = positions[sym];
    const last = bySymbol[sym].candles.at(-1)!;
    const { trade, proceeds } = closePosition(
      pos,
      last.close,
      last.timestamp,
      config.sellFee,
      "eod"
    );
    trades.push(trade);
    cash += proceeds;
  }

  return trimBacktestResult(
    {
      mode: "portfolio",
      trades,
      metrics: computeMetrics(trades, initialCapital, equityCurve),
      equityCurve,
    },
    tradingStartTs || undefined,
    initialCapital
  );
}

/** @deprecated Use runSingleStockBacktest — kept for compatibility */
export function runBacktest(
  candles: OHLCVCandle[],
  config: StrategyConfig,
  initialCapital: number = 100000
): BacktestResult {
  return runSingleStockBacktest(candles, config, initialCapital);
}
