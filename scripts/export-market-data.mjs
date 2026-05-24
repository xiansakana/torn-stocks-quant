/**
 * Download all tracked symbols to Excel for offline backtest / optimization.
 *
 * Usage:
 *   pnpm run export-data                         # all 13 intervals, full history
 *   pnpm run export-data -- --quick              # d1 only
 *   pnpm run export-data -- --interval=d1
 *   pnpm run export-data -- --intervals=d1,w1
 *   pnpm run export-data -- --symbols=TCI,MUN --pages=10
 */

import {
  TRACKED_SYMBOLS,
  ALL_EXPORT_INTERVALS,
  DEFAULT_MAX_PAGES,
  exportIntervalToExcel,
  parseArgs,
  excelFilePath,
} from "./lib/market-data.mjs";

const args = parseArgs(process.argv.slice(2));
const symbols = args.symbols ?? TRACKED_SYMBOLS;

console.log(
  `Exporting ${symbols.length} symbols × ${args.intervals.length} intervals (full history)\n`
);
console.log(`Intervals: ${args.intervals.join(", ")}\n`);

for (const interval of args.intervals) {
  const maxPages = args.pages ?? DEFAULT_MAX_PAGES[interval] ?? 0;
  const pagesLabel = maxPages === 0 ? "all pages" : `max ${maxPages} pages/symbol`;
  console.log(`=== ${interval.toUpperCase()} (${pagesLabel}) ===`);

  const started = Date.now();
  const { filePath, summary } = await exportIntervalToExcel(interval, {
    symbols,
    maxPages,
    onProgress: ({ symbol, index, total, bars, oldest }) => {
      const range =
        oldest != null
          ? ` from ${new Date(oldest).toISOString().slice(0, 10)}`
          : "";
      const barLabel = bars != null ? ` ${bars.toLocaleString()} bars` : "";
      process.stdout.write(
        `\r  [${index}/${total}] ${symbol}${barLabel}${range}   `
      );
    },
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\r  Done → ${filePath} (${elapsed}s)`);
  const ok = summary.filter((s) => s.ok && s.bars >= 100);
  const failed = summary.filter((s) => !s.ok || s.bars < 100);
  const totalBars = ok.reduce((n, s) => n + s.bars, 0);
  const globalOldest = ok.reduce(
    (min, s) => (s.oldest && s.oldest < min ? s.oldest : min),
    Infinity
  );
  const globalNewest = ok.reduce(
    (max, s) => (s.newest && s.newest > max ? s.newest : max),
    0
  );
  console.log(`  ${ok.length} symbols, ${totalBars.toLocaleString()} bars total`);
  if (Number.isFinite(globalOldest) && globalNewest) {
    console.log(
      `  range: ${new Date(globalOldest).toISOString().slice(0, 10)} ~ ${new Date(globalNewest).toISOString().slice(0, 10)}`
    );
  }
  if (failed.length) {
    console.log(`  Skipped/empty: ${failed.map((s) => s.symbol).join(", ")}`);
  }
  console.log();
}

console.log("Files written to data/");
for (const interval of args.intervals) {
  console.log(`  ${excelFilePath(interval)}`);
}
