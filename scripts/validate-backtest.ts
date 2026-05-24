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

// Quick confirm current default config
const run = runPortfolioBacktest(series, DEFAULT_STRATEGY_CONFIG, capital);
console.log(`\nDefault config ann: ${(run.metrics.annualizedReturn * 100).toFixed(2)}%`);
}

main().catch(console.error);
