/**
 * Strategy optimization script — reads cached d1 Excel data.
 * Run: pnpm run export-data -- --interval=d1 && node scripts/optimize-strategy.mjs
 */

import { loadIntervalFromExcel } from "./lib/market-data.mjs";

function sma(data, period) {
  const r = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += data[j];
    r[i] = s / period;
  }
  return r;
}

function ema(data, period) {
  const r = new Array(data.length).fill(NaN);
  const m = 2 / (period + 1);
  let s = 0;
  for (let i = 0; i < period; i++) s += data[i];
  r[period - 1] = s / period;
  for (let i = period; i < data.length; i++) r[i] = (data[i] - r[i - 1]) * m + r[i - 1];
  return r;
}

function rsi(closes, period = 14) {
  const r = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return r;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) avgGain += ch; else avgLoss += Math.abs(ch);
  }
  avgGain /= period; avgLoss /= period;
  r[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? Math.abs(ch) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    r[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return r;
}

function macd(closes, fast = 12, slow = 26, sig = 9) {
  const f = ema(closes, fast), s = ema(closes, slow);
  const line = closes.map((_, i) => (!isNaN(f[i]) && !isNaN(s[i])) ? f[i] - s[i] : NaN);
  const signal = ema(line.map(v => isNaN(v) ? 0 : v), sig);
  const hist = line.map((v, i) => (!isNaN(v) && !isNaN(signal[i])) ? v - signal[i] : NaN);
  return { line, signal, hist };
}

function bollinger(closes, period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper = new Array(closes.length).fill(NaN);
  const lower = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (closes[j] - mid[i]) ** 2;
    const std = Math.sqrt(sq / period);
    upper[i] = mid[i] + mult * std;
    lower[i] = mid[i] - mult * std;
  }
  return { upper, mid, lower };
}

function combinedScore(i, candles, ind, cfg) {
  const price = candles[i].close;
  const rv = ind.rsi[i];
  const { line: macdLine, signal: macdSignalLine } = ind.macd;
  const { upper, lower, mid } = ind.bb;
  const sma50 = ind.sma50[i];
  const sma20 = ind.sma20?.[i];

  if (isNaN(rv) || isNaN(macdLine[i])) return { score: 0, signal: "HOLD", trendOk: false };

  let rsiS = rv <= cfg.rsiOversold ? 1 : rv >= cfg.rsiOverbought ? -1 : 0;
  let macdS = 0;
  if (!isNaN(macdLine[i - 1]) && !isNaN(macdSignalLine[i - 1])) {
    if (macdLine[i - 1] <= macdSignalLine[i - 1] && macdLine[i] > macdSignalLine[i]) macdS = 1;
    else if (macdLine[i - 1] >= macdSignalLine[i - 1] && macdLine[i] < macdSignalLine[i]) macdS = -1;
  }
  let bbS = 0;
  if (!isNaN(upper[i]) && !isNaN(lower[i])) {
    if (price <= lower[i]) bbS = 1;
    else if (price >= upper[i]) bbS = -1;
    else {
      const bw = upper[i] - lower[i];
      if (bw > 0) {
        const pos = (price - lower[i]) / bw;
        if (pos < 0.15) bbS = 1;
        else if (pos > 0.85) bbS = -1;
      }
    }
  }

  let trendBonus = 0;
  let trendOk = true;
  if (!isNaN(sma50)) {
    if (price > sma50) trendBonus = 0.15;
    else {
      trendBonus = -0.15;
      if (cfg.requireTrend) trendOk = false;
    }
  }
  if (cfg.requireTrend && sma20 != null && !isNaN(sma20) && !isNaN(sma50)) {
    trendOk = trendOk && sma20 > sma50 && price > sma20;
  }

  // MACD histogram momentum
  const hist = ind.macd.hist?.[i];
  if (!isNaN(hist) && hist > 0) trendBonus += 0.05;

  const score = rsiS * 0.35 + macdS * 0.35 + bbS * 0.2 + trendBonus;
  let signal = "HOLD";
  if (score > cfg.buyThreshold) signal = "BUY";
  else if (score < cfg.sellThreshold) signal = "SELL";
  return { score, signal, trendOk };
}

function runSingleStockBacktest(candles, cfg) {
  const closes = candles.map(c => c.close);
  const ind = {
    rsi: rsi(closes, cfg.rsiPeriod),
    macd: macd(closes, cfg.macdFast, cfg.macdSlow, cfg.macdSignal),
    bb: bollinger(closes, cfg.bbPeriod, cfg.bbStd),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
  };

  let cash = cfg.capital;
  let pos = null;
  const trades = [];
  const equityCurve = [];

  for (let i = 50; i < candles.length; i++) {
    const c = candles[i];
    const price = c.close;
    const { score, signal } = combinedScore(i, candles, ind, cfg);

    // Stop loss / take profit
    if (pos) {
      const pnlPct = (price - pos.entryPrice) / pos.entryPrice;
      if (pnlPct <= -cfg.stopLoss || pnlPct >= cfg.takeProfit) {
        const gross = pos.shares * price;
        const fee = gross * cfg.sellFee;
        trades.push({ pnl: gross - fee - pos.cost, entry: pos.entryDate, exit: c.timestamp });
        cash += gross - fee;
        pos = null;
      }
    }

    if (signal === "BUY" && !pos && score >= cfg.minBuyScore) {
      const alloc = cash * cfg.positionSize;
      const shares = Math.floor(alloc / price);
      if (shares > 0) {
        pos = { entryPrice: price, entryDate: c.timestamp, shares, cost: shares * price };
        cash -= shares * price;
      }
    } else if (signal === "SELL" && pos) {
      const gross = pos.shares * price;
      const fee = gross * cfg.sellFee;
      trades.push({ pnl: gross - fee - pos.cost, entry: pos.entryDate, exit: c.timestamp });
      cash += gross - fee;
      pos = null;
    }

    equityCurve.push({ ts: c.timestamp, eq: cash + (pos ? pos.shares * price : 0) });
  }

  if (pos) {
    const price = candles[candles.length - 1].close;
    const gross = pos.shares * price;
    const fee = gross * cfg.sellFee;
    trades.push({ pnl: gross - fee - pos.cost, entry: pos.entryDate, exit: candles.at(-1).timestamp });
    cash += gross - fee;
  }

  const initial = cfg.capital;
  const final = cash;
  const totalRet = (final - initial) / initial;
  const years = (candles.at(-1).timestamp - candles[0].timestamp) / (365.25 * 86400000);
  const ann = years > 0 ? Math.pow(final / initial, 1 / years) - 1 : 0;
  const wins = trades.filter(t => t.pnl > 0).length;

  return { totalRet, ann, trades: trades.length, winRate: trades.length ? wins / trades.length : 0, final };
}

function runPortfolioBacktest(stockData, cfg) {
  // Align by timestamp — use daily bars across all stocks
  const allTs = new Set();
  for (const { candles } of stockData) {
    for (const c of candles) allTs.add(c.timestamp);
  }
  const timestamps = [...allTs].sort((a, b) => a - b);

  const bySymbol = {};
  for (const { symbol, candles } of stockData) {
    const map = new Map(candles.map(c => [c.timestamp, c]));
    bySymbol[symbol] = { map, candles, ind: null };
    const closes = candles.map(c => c.close);
    bySymbol[symbol].ind = {
      rsi: rsi(closes, cfg.rsiPeriod),
      macd: macd(closes, cfg.macdFast, cfg.macdSlow, cfg.macdSignal),
      bb: bollinger(closes, cfg.bbPeriod, cfg.bbStd),
      sma20: sma(closes, 20),
      sma50: sma(closes, 50),
      tsIndex: new Map(candles.map((c, i) => [c.timestamp, i])),
    };
  }

  let cash = cfg.capital;
  const positions = {}; // symbol -> { shares, entryPrice, cost, entryDate }
  const trades = [];
  const equityCurve = [];

  for (const ts of timestamps) {
    // Score all stocks at this timestamp
    const candidates = [];
    for (const { symbol } of stockData) {
      const { map, candles, ind } = bySymbol[symbol];
      const candle = map.get(ts);
      if (!candle) continue;
      const idx = ind.tsIndex.get(ts);
      if (idx == null || idx < 50) continue;
      const { score, signal, trendOk } = combinedScore(idx, candles, ind, cfg);
      candidates.push({ symbol, candle, idx, score, signal, trendOk });
    }

    // Exit checks
    for (const sym of Object.keys(positions)) {
      const pos = positions[sym];
      const { map } = bySymbol[sym];
      const candle = map.get(ts);
      if (!candle) continue;
      const price = candle.close;
      if (price > (pos.peakPrice ?? pos.entryPrice)) pos.peakPrice = price;
      const idx = bySymbol[sym].ind.tsIndex.get(ts);
      const { signal } = combinedScore(idx, bySymbol[sym].candles, bySymbol[sym].ind, cfg);
      const pnlPct = (price - pos.entryPrice) / pos.entryPrice;
      const drawdownFromPeak = pos.peakPrice
        ? (pos.peakPrice - price) / pos.peakPrice
        : 0;

      const shouldExit =
        signal === "SELL" ||
        pnlPct <= -cfg.stopLoss ||
        pnlPct >= cfg.takeProfit ||
        (cfg.trailingStop && drawdownFromPeak >= cfg.trailingStop);

      if (shouldExit) {
        const gross = pos.shares * price;
        const fee = gross * cfg.sellFee;
        trades.push({ symbol: sym, pnl: gross - fee - pos.cost });
        cash += gross - fee;
        delete positions[sym];
      }
    }

    // Entry: top N buy signals, partial allocation
    const held = Object.keys(positions).length;
    const slots = cfg.maxPositions - held;
    if (slots > 0) {
      const buys = candidates
        .filter(c => c.signal === "BUY" && c.score >= cfg.minBuyScore && c.trendOk !== false && !positions[c.symbol])
        .sort((a, b) => b.score - a.score)
        .slice(0, slots);

      for (const b of buys) {
        const strength = Math.min(1, (b.score - cfg.minBuyScore) / (1 - cfg.minBuyScore + 0.01));
        const sizeFactor = cfg.scaleByScore ? 0.7 + strength * 0.3 : 1;
        const targetAlloc = cfg.capital * cfg.positionSize * sizeFactor;
        const alloc = Math.min(targetAlloc, cash * 0.95);
        const shares = Math.floor(alloc / b.candle.close);
        if (shares > 0) {
          const cost = shares * b.candle.close;
          positions[b.symbol] = {
            shares,
            entryPrice: b.candle.close,
            cost,
            entryDate: ts,
            peakPrice: b.candle.close,
          };
          cash -= cost;
        }
      }
    }

    let eq = cash;
    for (const sym of Object.keys(positions)) {
      const candle = bySymbol[sym].map.get(ts);
      if (candle) eq += positions[sym].shares * candle.close;
    }
    equityCurve.push({ ts, eq });
  }

  // Close remaining
  for (const sym of Object.keys(positions)) {
    const pos = positions[sym];
    const last = bySymbol[sym].candles.at(-1);
    const gross = pos.shares * last.close;
    const fee = gross * cfg.sellFee;
    trades.push({ symbol: sym, pnl: gross - fee - pos.cost });
    cash += gross - fee;
  }

  const final = cash;
  const totalRet = (final - cfg.capital) / cfg.capital;
  const firstTs = timestamps[0], lastTs = timestamps.at(-1);
  const years = (lastTs - firstTs) / (365.25 * 86400000);
  const ann = years > 0 ? Math.pow(final / cfg.capital, 1 / years) - 1 : 0;
  const wins = trades.filter(t => t.pnl > 0).length;

  return { totalRet, ann, trades: trades.length, winRate: trades.length ? wins / trades.length : 0, final };
}

const BASE = {
  capital: 100000,
  rsiPeriod: 14,
  rsiOversold: 35,
  rsiOverbought: 65,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bbPeriod: 20,
  bbStd: 2,
  sellFee: 0.001,
  buyThreshold: 0.25,
  sellThreshold: -0.15,
  minBuyScore: 0.35,
  positionSize: 0.2,
  maxPositions: 5,
  stopLoss: 0.12,
  takeProfit: 0.25,
};

console.log("Loading d1 data from Excel...");
const { filePath, stockData } = loadIntervalFromExcel("d1");
console.log(`${filePath}\nLoaded ${stockData.length} stocks\n`);

// Baseline: old all-in single stock (TCI)
const tci = stockData.find(s => s.symbol === "TCI");
const oldCfg = { ...BASE, positionSize: 1.0, maxPositions: 1, buyThreshold: 0.2, sellThreshold: -0.2, minBuyScore: 0.2, stopLoss: 1, takeProfit: 10 };
const oldSingle = runSingleStockBacktest(tci.candles, oldCfg);
console.log("OLD all-in TCI:", (oldSingle.ann * 100).toFixed(1) + "% ann", oldSingle.trades, "trades");

// Test portfolio variants
const variants = [
  { name: "portfolio-v1", ...BASE },
  { name: "portfolio-aggressive", ...BASE, minBuyScore: 0.3, positionSize: 0.25, maxPositions: 4, takeProfit: 0.3, stopLoss: 0.1 },
  { name: "portfolio-conservative", ...BASE, minBuyScore: 0.45, positionSize: 0.15, maxPositions: 6, takeProfit: 0.2, stopLoss: 0.08 },
  { name: "portfolio-trend", ...BASE, minBuyScore: 0.4, positionSize: 0.2, maxPositions: 5, rsiOversold: 40, rsiOverbought: 60 },
  { name: "portfolio-tight-sl", ...BASE, stopLoss: 0.08, takeProfit: 0.35, minBuyScore: 0.38 },
  // Extended search
  { name: "momentum-v1", ...BASE, minBuyScore: 0.5, positionSize: 0.3, maxPositions: 3, takeProfit: 0.4, stopLoss: 0.1, buyThreshold: 0.35 },
  { name: "momentum-v2", ...BASE, minBuyScore: 0.45, positionSize: 0.35, maxPositions: 3, takeProfit: 0.5, stopLoss: 0.12, rsiOversold: 45, rsiOverbought: 55 },
  { name: "momentum-v3", ...BASE, minBuyScore: 0.55, positionSize: 0.33, maxPositions: 3, takeProfit: 0.45, stopLoss: 0.15, buyThreshold: 0.4, sellThreshold: -0.1 },
  { name: "scale-4x25", ...BASE, minBuyScore: 0.42, positionSize: 0.25, maxPositions: 4, takeProfit: 0.35, stopLoss: 0.1, rsiOversold: 38, rsiOverbought: 62 },
  { name: "high-conviction", ...BASE, minBuyScore: 0.6, positionSize: 0.4, maxPositions: 2, takeProfit: 0.55, stopLoss: 0.12, buyThreshold: 0.45 },
  { name: "swing-wide", ...BASE, minBuyScore: 0.35, positionSize: 0.25, maxPositions: 4, takeProfit: 0.6, stopLoss: 0.15, rsiOversold: 42, rsiOverbought: 58 },
  { name: "trend-rider", ...BASE, minBuyScore: 0.48, positionSize: 0.3, maxPositions: 3, takeProfit: 0.7, stopLoss: 0.18, buyThreshold: 0.3, sellThreshold: -0.25 },
  // Fine-tuned around best performers
  { name: "opt-v1-trend", ...BASE, requireTrend: true, minBuyScore: 0.42, positionSize: 0.33, maxPositions: 3, takeProfit: 0.5, stopLoss: 0.12, rsiOversold: 45, rsiOverbought: 55, trailingStop: 0.12 },
  { name: "opt-v2-trend", ...BASE, requireTrend: true, minBuyScore: 0.38, positionSize: 0.35, maxPositions: 3, takeProfit: 0.55, stopLoss: 0.1, rsiOversold: 42, rsiOverbought: 58, trailingStop: 0.1, scaleByScore: true },
  { name: "opt-v3-trend", ...BASE, requireTrend: true, minBuyScore: 0.4, positionSize: 0.4, maxPositions: 2, takeProfit: 0.6, stopLoss: 0.12, rsiOversold: 40, rsiOverbought: 60, trailingStop: 0.15 },
  { name: "opt-v4-balanced", ...BASE, requireTrend: true, minBuyScore: 0.35, positionSize: 0.3, maxPositions: 4, takeProfit: 0.45, stopLoss: 0.1, rsiOversold: 43, rsiOverbought: 57, trailingStop: 0.12, scaleByScore: true, buyThreshold: 0.28 },
  { name: "opt-v5-aggressive", ...BASE, requireTrend: true, minBuyScore: 0.36, positionSize: 0.38, maxPositions: 3, takeProfit: 0.65, stopLoss: 0.14, rsiOversold: 44, rsiOverbought: 56, trailingStop: 0.14, scaleByScore: true },
];

for (const v of variants) {
  const r = runPortfolioBacktest(stockData, v);
  console.log(
    `${v.name.padEnd(22)} ann=${(r.ann * 100).toFixed(1).padStart(6)}%  trades=${String(r.trades).padStart(3)}  win=${(r.winRate * 100).toFixed(0)}%  total=${(r.totalRet * 100).toFixed(1)}%`
  );
}

// Per-stock single with new params
console.log("\nPer-stock (optimized single, 20% position):");
let best = { symbol: "", ann: -999 };
for (const { symbol, candles } of stockData) {
  const r = runSingleStockBacktest(candles, BASE);
  if (r.ann > best.ann) best = { symbol, ann: r.ann };
  if (r.ann > 0.15) console.log(`  ${symbol}: ${(r.ann * 100).toFixed(1)}% ann, ${r.trades} trades`);
}
// ─── Momentum ranking strategy ───────────────────────────────────
function runMomentumRankBacktest(stockData, cfg) {
  const allTs = new Set();
  for (const { candles } of stockData) for (const c of candles) allTs.add(c.timestamp);
  const timestamps = [...allTs].sort((a, b) => a - b);

  const bySymbol = {};
  for (const { symbol, candles } of stockData) {
    const closes = candles.map(c => c.close);
    const m = macd(closes, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    bySymbol[symbol] = {
      map: new Map(candles.map(c => [c.timestamp, c])),
      candles,
      sma20: sma(closes, 20),
      sma50: sma(closes, 50),
      rsi: rsi(closes, cfg.rsiPeriod),
      macd: m,
      tsIndex: new Map(candles.map((c, i) => [c.timestamp, i])),
    };
  }

  let cash = cfg.capital;
  const positions = {};
  const trades = [];

  for (const ts of timestamps) {
    // Exit
    for (const sym of Object.keys(positions)) {
      const pos = positions[sym];
      const candle = bySymbol[sym].map.get(ts);
      if (!candle) continue;
      const price = candle.close;
      if (price > pos.peakPrice) pos.peakPrice = price;
      const idx = bySymbol[sym].tsIndex.get(ts);
      const { line, signal: sig, hist } = bySymbol[sym].macd;
      const rv = bySymbol[sym].rsi[idx];
      const pnlPct = (price - pos.entryPrice) / pos.entryPrice;
      const dd = (pos.peakPrice - price) / pos.peakPrice;
      const deathCross = !isNaN(line[idx - 1]) && line[idx - 1] >= sig[idx - 1] && line[idx] < sig[idx];
      if (deathCross || rv >= cfg.rsiOverbought || pnlPct <= -cfg.stopLoss || pnlPct >= cfg.takeProfit || dd >= cfg.trailingStop) {
        const gross = pos.shares * price;
        const fee = gross * cfg.sellFee;
        trades.push({ symbol: sym, pnl: gross - fee - pos.cost });
        cash += gross - fee;
        delete positions[sym];
      }
    }

    const held = Object.keys(positions).length;
    const slots = cfg.maxPositions - held;
    if (slots <= 0) continue;

    const ranked = [];
    for (const { symbol } of stockData) {
      const b = bySymbol[symbol];
      const candle = b.map.get(ts);
      if (!candle) continue;
      const idx = b.tsIndex.get(ts);
      if (idx == null || idx < 55) continue;
      const price = candle.close;
      const s20 = b.sma20[idx], s50 = b.sma50[idx];
      const { line, signal: sig, hist } = b.macd;
      const rv = b.rsi[idx];
      if (isNaN(s50) || isNaN(s20) || price <= s50 || s20 <= s50) continue;
      if (isNaN(line[idx]) || isNaN(hist[idx]) || hist[idx] <= 0) continue;
      if (rv < 40 || rv > 72) continue;
      let mom = (price / s50 - 1) * 100 + hist[idx] * 10;
      const goldenCross = line[idx - 1] <= sig[idx - 1] && line[idx] > sig[idx];
      if (goldenCross) mom += 5;
      ranked.push({ symbol, candle, mom, goldenCross });
    }

    ranked.sort((a, b) => b.mom - a.mom);
    for (const r of ranked.slice(0, slots)) {
      if (positions[r.symbol]) continue;
      const alloc = Math.min(cfg.capital * cfg.positionSize, cash * 0.95);
      const shares = Math.floor(alloc / r.candle.close);
      if (shares <= 0) continue;
      const cost = shares * r.candle.close;
      positions[r.symbol] = { shares, entryPrice: r.candle.close, cost, peakPrice: r.candle.close };
      cash -= cost;
    }
  }

  for (const sym of Object.keys(positions)) {
    const pos = positions[sym];
    const last = bySymbol[sym].candles.at(-1);
    const gross = pos.shares * last.close;
    const fee = gross * cfg.sellFee;
    trades.push({ symbol: sym, pnl: gross - fee - pos.cost });
    cash += gross - fee;
  }

  const final = cash;
  const totalRet = (final - cfg.capital) / cfg.capital;
  const years = (timestamps.at(-1) - timestamps[0]) / (365.25 * 86400000);
  const ann = years > 0 ? Math.pow(final / cfg.capital, 1 / years) - 1 : 0;
  const wins = trades.filter(t => t.pnl > 0).length;
  return { totalRet, ann, trades: trades.length, winRate: trades.length ? wins / trades.length : 0, final };
}

console.log("\n=== Momentum rank strategy sweep ===");
const momVariants = [
  { name: "mom-rank-v1", ...BASE, maxPositions: 3, positionSize: 0.33, stopLoss: 0.1, takeProfit: 0.5, trailingStop: 0.12, rsiOverbought: 72 },
  { name: "mom-rank-v2", ...BASE, maxPositions: 3, positionSize: 0.35, stopLoss: 0.12, takeProfit: 0.6, trailingStop: 0.15, rsiOverbought: 75 },
  { name: "mom-rank-v3", ...BASE, maxPositions: 4, positionSize: 0.25, stopLoss: 0.08, takeProfit: 0.45, trailingStop: 0.1, rsiOverbought: 70 },
  { name: "mom-rank-v4", ...BASE, maxPositions: 2, positionSize: 0.45, stopLoss: 0.15, takeProfit: 0.8, trailingStop: 0.18, rsiOverbought: 78 },
  { name: "mom-rank-v5", ...BASE, maxPositions: 3, positionSize: 0.4, stopLoss: 0.1, takeProfit: 0.7, trailingStop: 0.12, rsiOverbought: 74 },
];
for (const v of momVariants) {
  const r = runMomentumRankBacktest(stockData, v);
  console.log(`${v.name.padEnd(18)} ann=${(r.ann * 100).toFixed(1).padStart(6)}%  trades=${String(r.trades).padStart(3)}  win=${(r.winRate * 100).toFixed(0)}%  total=${(r.totalRet * 100).toFixed(1)}%`);
}

console.log("\n=== Grid search (portfolio, no trend filter) ===");
let bestGrid = { ann: -999, cfg: null, name: "" };
for (const ps of [0.25, 0.3, 0.35, 0.4]) {
  for (const mp of [2, 3, 4]) {
    for (const tp of [0.45, 0.55, 0.65]) {
      for (const sl of [0.08, 0.1, 0.12]) {
        for (const mbs of [0.32, 0.38, 0.42]) {
          const cfg = { ...BASE, positionSize: ps, maxPositions: mp, takeProfit: tp, stopLoss: sl, minBuyScore: mbs, trailingStop: 0.12, rsiOversold: 42, rsiOverbought: 58 };
          const r = runPortfolioBacktest(stockData, cfg);
          if (r.ann > bestGrid.ann) bestGrid = { ann: r.ann, cfg, name: `ps=${ps} mp=${mp} tp=${tp} sl=${sl} mbs=${mbs}`, ...r };
        }
      }
    }
  }
}
console.log(`BEST GRID: ${bestGrid.name}`);
console.log(`  ann=${(bestGrid.ann * 100).toFixed(1)}% total=${(bestGrid.totalRet * 100).toFixed(1)}% trades=${bestGrid.trades} win=${(bestGrid.winRate * 100).toFixed(0)}%`);

console.log("\n=== Fine grid around best ===");
let fineBest = { ann: bestGrid.ann, cfg: bestGrid.cfg, label: bestGrid.name };
for (const ps of [0.38, 0.4, 0.42, 0.45]) {
  for (const mp of [3, 4, 5]) {
    for (const tp of [0.45, 0.5, 0.55, 0.6]) {
      for (const sl of [0.07, 0.08, 0.09]) {
        for (const mbs of [0.34, 0.36, 0.38, 0.4]) {
          for (const ts of [0.1, 0.12, 0.14]) {
            const cfg = {
              ...bestGrid.cfg,
              positionSize: ps,
              maxPositions: mp,
              takeProfit: tp,
              stopLoss: sl,
              minBuyScore: mbs,
              trailingStop: ts,
              scaleByScore: true,
            };
            const r = runPortfolioBacktest(stockData, cfg);
            if (r.ann > fineBest.ann) {
              fineBest = { ann: r.ann, cfg, label: `ps=${ps} mp=${mp} tp=${tp} sl=${sl} mbs=${mbs} ts=${ts}`, ...r };
            }
          }
        }
      }
    }
  }
}
console.log(`FINE BEST: ${fineBest.label}`);
console.log(`  ann=${(fineBest.ann * 100).toFixed(1)}% total=${(fineBest.totalRet * 100).toFixed(1)}% trades=${fineBest.trades} win=${(fineBest.winRate * 100).toFixed(0)}%`);
console.log(JSON.stringify(fineBest.cfg, null, 2));

