/**
 * Validate optimized portfolio strategy against live tornsy data.
 * Run: pnpm tsx scripts/validate-backtest.ts
 */
import { runPortfolioBacktest } from "../src/lib/backtest";
import { DEFAULT_STRATEGY_CONFIG, TRACKED_SYMBOLS } from "../src/types/stock";
import type { OHLCVCandle } from "../src/types/stock";

const TORNSY = "https://tornsy.com/api";

async function fetchCandles(symbol: string): Promise<OHLCVCandle[]> {
  let all: OHLCVCandle[] = [];
  let to: number | undefined;
  for (let p = 0; p < 3; p++) {
    let url = `${TORNSY}/${symbol.toLowerCase()}?interval=d1`;
    if (to) url += `&to=${to}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const json = (await res.json()) as {
      data: [number, string, string, string, string, number][];
    };
    const candles = json.data.map(([ts, o, h, l, c, v]) => ({
      timestamp: ts * 1000,
      open: +o,
      high: +h,
      low: +l,
      close: +c,
      volume: v,
    }));
    if (!candles.length) break;
    all = [...candles, ...all];
    if (candles.length < 1000) break;
    to = Math.floor(candles[0].timestamp / 1000);
  }
  return all;
}

async function main() {
console.log("Fetching", TRACKED_SYMBOLS.length, "stocks...");
const series = [];
for (const symbol of TRACKED_SYMBOLS) {
  const candles = await fetchCandles(symbol);
  if (candles.length >= 50) series.push({ symbol, candles });
  process.stdout.write(".");
}
console.log(`\n${series.length} stocks loaded`);

const capital = 100_000;
const result = runPortfolioBacktest(series, DEFAULT_STRATEGY_CONFIG, capital);
const m = result.metrics;

console.log("\n=== Optimized Portfolio Backtest (d1) ===");
console.log(`Annualized return: ${(m.annualizedReturn * 100).toFixed(2)}%`);
console.log(`Total return:      ${(m.totalReturnPercent * 100).toFixed(2)}%`);
console.log(`Trades:            ${m.totalTrades}`);
console.log(`Win rate:          ${(m.winRate * 100).toFixed(1)}%`);
console.log(`Max drawdown:      ${(m.maxDrawdownPercent * 100).toFixed(2)}%`);
console.log(`Profit factor:     ${m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2)}`);
console.log(`Sharpe (trades):   ${m.sharpeRatio.toFixed(2)}`);
console.log(`Total fees:        ${m.totalFees.toFixed(2)}`);
console.log(`Target 30% ann:    ${m.annualizedReturn >= 0.3 ? "PASS ✓" : "MISS — tuning needed"}`);

// Quick param sweep for 30% target
const tweaks = [
  DEFAULT_STRATEGY_CONFIG,
  { ...DEFAULT_STRATEGY_CONFIG, exitOnSellSignal: false },
  { ...DEFAULT_STRATEGY_CONFIG, takeProfit: 0.6, trailingStop: 0.16, exitOnSellSignal: false },
  { ...DEFAULT_STRATEGY_CONFIG, takeProfit: 0.65, positionSize: 0.45, maxPositions: 3, exitOnSellSignal: false },
  { ...DEFAULT_STRATEGY_CONFIG, takeProfit: 0.55, stopLoss: 0.06, minBuyScore: 0.34, sellThreshold: -0.4 },
  { ...DEFAULT_STRATEGY_CONFIG, takeProfit: 0.7, trailingStop: 0.18, exitOnSellSignal: false, minBuyScore: 0.34 },
  { ...DEFAULT_STRATEGY_CONFIG, takeProfit: 0.58, positionSize: 0.48, maxPositions: 3, stopLoss: 0.06, exitOnSellSignal: false },
];

// Quick confirm best config
const bestCfg = {
  ...DEFAULT_STRATEGY_CONFIG,
  positionSize: 0.48,
  takeProfit: 0.42,
  stopLoss: 0.06,
  minBuyScore: 0.4,
  trailingStop: 0.08,
  sellThreshold: -0.3,
  maxPositions: 4,
};
const bestRun = runPortfolioBacktest(series, bestCfg, capital);
console.log(`\nConfirmed best config ann: ${(bestRun.metrics.annualizedReturn * 100).toFixed(2)}%`);
}

main().catch(console.error);
