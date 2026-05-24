// Technical Analysis Library for Torn Stocks Quant
import type { OHLCVCandle, TechnicalIndicators, StrategyConfig, StrategySignal, SignalType } from "@/types/stock";

// ─── Moving Averages ────────────────────────────────────────────

export function sma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j];
    }
    result[i] = sum / period;
  }
  return result;
}

export function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const multiplier = 2 / (period + 1);

  // First EMA value is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }
  return result;
}

// ─── RSI (Relative Strength Index) ──────────────────────────────

export function rsi(closes: number[], period: number = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

// ─── MACD (Moving Average Convergence Divergence) ──────────────

export function macd(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = ema(closes, fastPeriod);
  const slowEMA = ema(closes, slowPeriod);

  const macdLine: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(fastEMA[i]) && !isNaN(slowEMA[i])) {
      macdLine[i] = fastEMA[i] - slowEMA[i];
    }
  }

  // Signal line is EMA of MACD line
  const validMacd = macdLine.filter((v) => !isNaN(v));
  const signalLine: number[] = new Array(closes.length).fill(NaN);

  if (validMacd.length >= signalPeriod) {
    let idx = 0;
    for (let i = 0; i < closes.length; i++) {
      if (!isNaN(macdLine[i])) {
        if (idx === 0) {
          // Find first valid index
          let firstValid = -1;
          for (let j = 0; j < closes.length; j++) {
            if (!isNaN(macdLine[j])) {
              firstValid = j;
              break;
            }
          }
          // Wait for enough data
          if (i - firstValid + 1 >= signalPeriod) {
            let sum = 0;
            let count = 0;
            for (let j = firstValid; j <= i; j++) {
              if (!isNaN(macdLine[j])) {
                sum += macdLine[j];
                count++;
              }
            }
            signalLine[i] = sum / count;
          }
        }
        idx++;
      }
    }
    // Use proper EMA for signal
    const multiplier = 2 / (signalPeriod + 1);
    let firstSignalIdx = -1;
    for (let i = 0; i < closes.length; i++) {
      if (!isNaN(macdLine[i])) {
        if (firstSignalIdx === -1) firstSignalIdx = i;
        const offset = i - firstSignalIdx;
        if (offset === signalPeriod - 1) {
          let sum = 0;
          for (let j = firstSignalIdx; j <= i; j++) {
            sum += macdLine[j];
          }
          signalLine[i] = sum / signalPeriod;
        } else if (offset >= signalPeriod) {
          signalLine[i] =
            (macdLine[i] - signalLine[i - 1]) * multiplier + signalLine[i - 1];
        }
      }
    }
  }

  const histogram: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
      histogram[i] = macdLine[i] - signalLine[i];
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

// ─── Bollinger Bands ────────────────────────────────────────────

export function bollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = sma(closes, period);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);

  for (let i = period - 1; i < closes.length; i++) {
    let sumSqDiff = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSqDiff += (closes[j] - middle[i]) ** 2;
    }
    const stdDev = Math.sqrt(sumSqDiff / period);
    upper[i] = middle[i] + stdDevMultiplier * stdDev;
    lower[i] = middle[i] - stdDevMultiplier * stdDev;
  }
  return { upper, middle, lower };
}

// ─── Compute All Indicators ─────────────────────────────────────

export function computeIndicators(
  candles: OHLCVCandle[],
  config: StrategyConfig
): TechnicalIndicators {
  const closes = candles.map((c) => c.close);

  return {
    rsi: rsi(closes, config.rsiPeriod),
    macd: macd(closes, config.macdFast, config.macdSlow, config.macdSignal),
    bollingerBands: bollingerBands(closes, config.bollingerPeriod, config.bollingerStdDev),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    ema12: ema(closes, 12),
    ema26: ema(closes, 26),
  };
}

// ─── Signal Generation ──────────────────────────────────────────

function getRSISignal(rsiValue: number, config: StrategyConfig): SignalType {
  if (isNaN(rsiValue)) return "HOLD";
  if (rsiValue <= config.rsiOversold) return "BUY";
  if (rsiValue >= config.rsiOverbought) return "SELL";
  return "HOLD";
}

function getMACDSignal(
  macdLine: number,
  signalLine: number,
  prevMacd: number,
  prevSignal: number
): SignalType {
  if (isNaN(macdLine) || isNaN(signalLine) || isNaN(prevMacd) || isNaN(prevSignal)) {
    return "HOLD";
  }
  // Bullish crossover
  if (prevMacd <= prevSignal && macdLine > signalLine) return "BUY";
  // Bearish crossover
  if (prevMacd >= prevSignal && macdLine < signalLine) return "SELL";
  return "HOLD";
}

function getBollingerSignal(
  price: number,
  upper: number,
  lower: number,
  middle: number
): SignalType {
  if (isNaN(upper) || isNaN(lower) || isNaN(middle)) return "HOLD";
  if (price <= lower) return "BUY";
  if (price >= upper) return "SELL";
  // Near bands
  const bandWidth = upper - lower;
  if (bandWidth > 0) {
    const position = (price - lower) / bandWidth;
    if (position < 0.15) return "BUY";
    if (position > 0.85) return "SELL";
  }
  return "HOLD";
}

export function generateSignal(
  symbol: string,
  name: string,
  price: number,
  candles: OHLCVCandle[],
  config: StrategyConfig
): StrategySignal {
  const indicators = computeIndicators(candles, config);
  const len = candles.length - 1;

  const rsiValue = indicators.rsi[len];
  const macdData = indicators.macd;
  const bb = indicators.bollingerBands;

  const rsiSignal = getRSISignal(rsiValue, config);
  const macdSignal = getMACDSignal(
    macdData.macd[len],
    macdData.signal[len],
    macdData.macd[len - 1] ?? NaN,
    macdData.signal[len - 1] ?? NaN
  );
  const bollingerSignal = getBollingerSignal(price, bb.upper[len], bb.lower[len], bb.middle[len]);

  // Combined scoring: weighted average
  // BUY = +1, SELL = -1, HOLD = 0
  const rsiScore = rsiSignal === "BUY" ? 1 : rsiSignal === "SELL" ? -1 : 0;
  const macdScore = macdSignal === "BUY" ? 1 : macdSignal === "SELL" ? -1 : 0;
  const bbScore = bollingerSignal === "BUY" ? 1 : bollingerSignal === "SELL" ? -1 : 0;

  // RSI: 40%, MACD: 35%, Bollinger: 25%
  const combinedScore = rsiScore * 0.4 + macdScore * 0.35 + bbScore * 0.25;

  let signal: SignalType = "HOLD";
  let strength = 0;
  if (combinedScore > 0.2) {
    signal = "BUY";
    strength = Math.min(100, Math.round(combinedScore * 100));
  } else if (combinedScore < -0.2) {
    signal = "SELL";
    strength = Math.min(100, Math.round(Math.abs(combinedScore) * 100));
  }

  return {
    symbol,
    name,
    price,
    signal,
    strength,
    rsi: rsiValue,
    macdSignal,
    bollingerSignal,
    rsiSignal,
    combinedScore: Math.round(combinedScore * 100) / 100,
  };
}
