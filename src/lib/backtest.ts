// Backtesting Engine for Torn Stocks Quant
import type { OHLCVCandle, StrategyConfig, BacktestResult, BacktestTrade, BacktestMetrics, SignalType } from "@/types/stock";
import { computeIndicators } from "./technical-analysis";

interface Position {
  entryPrice: number;
  entryDate: number;
  shares: number;
}

export function runBacktest(
  candles: OHLCVCandle[],
  config: StrategyConfig,
  initialCapital: number = 100000
): BacktestResult {
  const indicators = computeIndicators(candles, config);
  const trades: BacktestTrade[] = [];
  const equityCurve: { timestamp: number; equity: number }[] = [];

  let cash = initialCapital;
  let position: Position | null = null;
  let prevSignal: SignalType = "HOLD";

  for (let i = 50; i < candles.length; i++) {
    // Need warm-up period
    const candle = candles[i];
    const price = candle.close;
    const rsiValue = indicators.rsi[i];
    const macdLine = indicators.macd.macd[i];
    const signalLine = indicators.macd.signal[i];
    const prevMacd = indicators.macd.macd[i - 1];
    const prevSignalLine = indicators.macd.signal[i - 1];
    const bbUpper = indicators.bollingerBands.upper[i];
    const bbLower = indicators.bollingerBands.lower[i];

    if (isNaN(rsiValue) || isNaN(macdLine)) continue;

    // Generate signal
    let signal: SignalType = "HOLD";

    const rsiSignal =
      rsiValue <= config.rsiOversold ? "BUY" : rsiValue >= config.rsiOverbought ? "SELL" : "HOLD";

    let macdSignal: SignalType = "HOLD";
    if (!isNaN(prevMacd) && !isNaN(prevSignalLine)) {
      if (prevMacd <= prevSignalLine && macdLine > signalLine) macdSignal = "BUY";
      else if (prevMacd >= prevSignalLine && macdLine < signalLine) macdSignal = "SELL";
    }

    let bbSignal: SignalType = "HOLD";
    if (!isNaN(bbUpper) && !isNaN(bbLower)) {
      if (price <= bbLower) bbSignal = "BUY";
      else if (price >= bbUpper) bbSignal = "SELL";
    }

    // Combined signal with minimum threshold
    const rsiScore = rsiSignal === "BUY" ? 1 : rsiSignal === "SELL" ? -1 : 0;
    const macdScore = macdSignal === "BUY" ? 1 : macdSignal === "SELL" ? -1 : 0;
    const bbScore = bbSignal === "BUY" ? 1 : bbSignal === "SELL" ? -1 : 0;
    const combined = rsiScore * 0.4 + macdScore * 0.35 + bbScore * 0.25;

    if (combined > 0.2) signal = "BUY";
    else if (combined < -0.2) signal = "SELL";

    // Execute trades
    if (signal === "BUY" && !position && prevSignal !== "BUY") {
      // Buy with all cash
      const shares = Math.floor(cash / price);
      if (shares > 0) {
        position = {
          entryPrice: price,
          entryDate: candle.timestamp,
          shares,
        };
        cash -= shares * price;
      }
    } else if (signal === "SELL" && position && prevSignal !== "SELL") {
      // Sell all shares
      const grossProceeds = position.shares * price;
      const fee = grossProceeds * config.sellFee;
      const netProceeds = grossProceeds - fee;
      const pnl = netProceeds - position.shares * position.entryPrice;
      const pnlPercent = pnl / (position.shares * position.entryPrice);

      trades.push({
        entryDate: position.entryDate,
        exitDate: candle.timestamp,
        entryPrice: position.entryPrice,
        exitPrice: price,
        shares: position.shares,
        pnl,
        pnlPercent,
        fee,
        signal: "combined",
      });

      cash += netProceeds;
      position = null;
    }

    prevSignal = signal;

    // Track equity
    const equity = cash + (position ? position.shares * price : 0);
    equityCurve.push({ timestamp: candle.timestamp, equity });
  }

  // Close any open position at end
  if (position && candles.length > 0) {
    const lastPrice = candles[candles.length - 1].close;
    const grossProceeds = position.shares * lastPrice;
    const fee = grossProceeds * config.sellFee;
    const netProceeds = grossProceeds - fee;
    const pnl = netProceeds - position.shares * position.entryPrice;

    trades.push({
      entryDate: position.entryDate,
      exitDate: candles[candles.length - 1].timestamp,
      entryPrice: position.entryPrice,
      exitPrice: lastPrice,
      shares: position.shares,
      pnl,
      pnlPercent: pnl / (position.shares * position.entryPrice),
      fee,
      signal: "combined",
    });

    cash += netProceeds;
    position = null;
  }

  const metrics = computeMetrics(trades, initialCapital, candles);

  return { trades, metrics, equityCurve };
}

function computeMetrics(
  trades: BacktestTrade[],
  initialCapital: number,
  candles: OHLCVCandle[]
): BacktestMetrics {
  if (trades.length === 0) {
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

  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalReturnPercent = totalPnl / initialCapital;
  const winningTrades = trades.filter((t) => t.pnl > 0);
  const losingTrades = trades.filter((t) => t.pnl < 0);
  const winRate = winningTrades.length / trades.length;

  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? Infinity : grossProfit / grossLoss;

  const avgTradeReturn = trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length;

  const totalFees = trades.reduce((sum, t) => sum + t.fee, 0);

  // Annualized return
  const firstDate = candles[0].timestamp;
  const lastDate = candles[candles.length - 1].timestamp;
  const yearsDiff = (lastDate - firstDate) / (365.25 * 24 * 3600);
  const annualizedReturn = yearsDiff > 0
    ? Math.pow(1 + totalReturnPercent, 1 / yearsDiff) - 1
    : 0;

  // Max drawdown
  let peak = initialCapital;
  let equity = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;

  for (const trade of trades) {
    equity += trade.pnl;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    const drawdownPercent = drawdown / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    if (drawdownPercent > maxDrawdownPercent) maxDrawdownPercent = drawdownPercent;
  }

  // Sharpe ratio (simplified)
  const returns = trades.map((t) => t.pnlPercent);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn =
    Math.sqrt(returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length);
  const sharpeRatio = stdReturn === 0 ? 0 : avgReturn / stdReturn;

  return {
    totalReturn: totalPnl,
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
