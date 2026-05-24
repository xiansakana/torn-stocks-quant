/**
 * Shared market data fetch + Excel cache for offline scripts.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

export const TORNSY_API = "https://tornsy.com/api";

export const TRACKED_SYMBOLS = [
  "FHG", "MUN", "TCI", "SYM", "MCS", "TSB", "CNC", "TMI", "PTS", "WLT",
  "IOU", "GRN", "BAG", "WSU", "TCP", "TGP", "MSG", "PRN", "HRG", "LSC",
  "SYS", "CBD", "TCC", "ASS", "EWM", "THS", "EVL", "LAG", "ELT", "TCM",
  "TCT", "LOS", "YAZ", "IIL", "IST",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, "../../data");

export const EXCEL_COLUMNS = [
  "timestamp_ms",
  "datetime",
  "open",
  "high",
  "low",
  "close",
  "volume",
];

const META_SHEET = "_meta";

/** All intervals to export (finest → coarsest, matches app ALL_INTERVALS). */
export const ALL_EXPORT_INTERVALS = [
  "m1", "m5", "m15", "m30", "h1", "h2", "h4", "h6", "h12", "d1", "w1", "n1", "y1",
];

/** Default max API pages per symbol. 0 = fetch all available history. */
export const DEFAULT_MAX_PAGES = Object.fromEntries(
  ALL_EXPORT_INTERVALS.map((iv) => [iv, 0])
);

/** Safety cap when fetching full history (prevents infinite loops). */
const FULL_FETCH_SAFETY_PAGES = {
  m1: 3000,
  m5: 800,
  m15: 400,
  m30: 400,
  h1: 200,
  h2: 200,
  h4: 200,
  h6: 200,
  h12: 200,
  d1: 50,
  w1: 50,
  n1: 50,
  y1: 20,
};

function resolvePageLimit(interval, maxPages) {
  if (maxPages > 0) return maxPages;
  return FULL_FETCH_SAFETY_PAGES[interval] ?? 200;
}

export function excelFilePath(interval) {
  return path.join(DATA_DIR, `market-${interval}.xlsx`);
}

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Fetch OHLCV candles from tornsy API with pagination.
 * @param {number} maxPages — max pages to fetch; 0 = all available history (up to safety cap)
 */
export async function fetchCandles(symbol, interval, maxPages = 0) {
  const pageLimit = resolvePageLimit(interval, maxPages);

  let all = [];
  let to;

  for (let page = 0; page < pageLimit; page++) {
    let url = `${TORNSY_API}/${symbol.toLowerCase()}`;
    const params = [];
    if (interval !== "m1") params.push(`interval=${interval}`);
    if (to) params.push(`to=${to}`);
    if (params.length) url += `?${params.join("&")}`;

    const res = await fetch(url);
    if (!res.ok) break;

    const json = await res.json();
    if (!Array.isArray(json.data) || json.data.length === 0) break;

    const candles =
      interval === "m1"
        ? parseTicks(json.data)
        : json.data.map(([ts, o, h, l, c, v]) => ({
            timestamp: ts * 1000,
            open: +o,
            high: +h,
            low: +l,
            close: +c,
            volume: v,
          }));

    all = [...candles, ...all];
    if (candles.length < 1000) break;
    to = Math.floor(candles[0].timestamp / 1000);
  }

  return dedupeAndSort(all);
}

function parseTicks(rows) {
  const buckets = new Map();
  for (const [timestamp, priceStr] of rows) {
    const price = parseFloat(priceStr);
    const minuteKey = Math.floor(timestamp / 60) * 60;
    const prices = buckets.get(minuteKey) ?? [];
    prices.push(price);
    buckets.set(minuteKey, prices);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minuteKey, prices]) => ({
      timestamp: minuteKey * 1000,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      volume: prices.length,
    }));
}

function dedupeAndSort(candles) {
  const byTs = new Map();
  for (const c of candles) byTs.set(c.timestamp, c);
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function candleToRow(c) {
  return {
    timestamp_ms: c.timestamp,
    datetime: new Date(c.timestamp).toISOString(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

export function rowToCandle(row) {
  const ts = Number(row.timestamp_ms);
  if (!Number.isFinite(ts)) return null;
  return {
    timestamp: ts,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume ?? 0),
  };
}

/**
 * Export one interval to Excel — one sheet per symbol + _meta sheet.
 */
export async function exportIntervalToExcel(interval, options = {}) {
  const {
    symbols = TRACKED_SYMBOLS,
    maxPages = DEFAULT_MAX_PAGES[interval] ?? 0,
    onProgress,
  } = options;

  ensureDataDir();
  const workbook = XLSX.utils.book_new();
  const summary = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];

    try {
      const candles = await fetchCandles(symbol, interval, maxPages);
      onProgress?.({
        phase: "fetch",
        symbol,
        index: i + 1,
        total: symbols.length,
        bars: candles.length,
        oldest: candles[0]?.timestamp,
        newest: candles.at(-1)?.timestamp,
      });
      const rows = candles.map(candleToRow);
      const sheet = XLSX.utils.json_to_sheet(rows, { header: EXCEL_COLUMNS });
      XLSX.utils.book_append_sheet(workbook, sheet, symbol.slice(0, 31));
      const oldest = candles[0]?.timestamp;
      const newest = candles.at(-1)?.timestamp;
      summary.push({
        symbol,
        bars: candles.length,
        ok: candles.length > 0,
        oldest,
        newest,
      });
    } catch (err) {
      summary.push({
        symbol,
        bars: 0,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const metaRows = [
    { key: "interval", value: interval },
    { key: "exported_at", value: new Date().toISOString() },
    { key: "symbols", value: symbols.join(",") },
    {
      key: "max_pages",
      value: maxPages === 0 ? "all" : String(maxPages),
    },
    ...summary.map((s) => ({
      key: `bars_${s.symbol}`,
      value: s.ok
        ? `${s.bars} (${s.oldest ? new Date(s.oldest).toISOString().slice(0, 10) : "?"} ~ ${s.newest ? new Date(s.newest).toISOString().slice(0, 10) : "?"})`
        : `ERROR: ${s.error ?? "empty"}`,
    })),
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(metaRows),
    META_SHEET
  );

  const filePath = excelFilePath(interval);
  XLSX.writeFile(workbook, filePath);

  return { filePath, summary };
}

/**
 * Load all symbol candles from cached Excel for an interval.
 */
export function loadIntervalFromExcel(interval, options = {}) {
  const { symbols = TRACKED_SYMBOLS, dataDir = DATA_DIR } = options;
  const filePath = path.join(dataDir, `market-${interval}.xlsx`);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing ${filePath}. Run: pnpm run export-data -- --interval=${interval}`
    );
  }

  const workbook = XLSX.readFile(filePath);
  const stockData = [];

  for (const symbol of symbols) {
    if (!workbook.SheetNames.includes(symbol)) continue;
    const sheet = workbook.Sheets[symbol];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const candles = rows.map(rowToCandle).filter(Boolean);
    if (candles.length > 0) {
      stockData.push({ symbol, candles: dedupeAndSort(candles) });
    }
  }

  return { filePath, stockData, sheetNames: workbook.SheetNames };
}

export function parseArgs(argv) {
  const args = { intervals: [], symbols: null, pages: null, full: false };
  for (const arg of argv) {
    if (arg.startsWith("--interval=")) {
      args.intervals.push(arg.slice("--interval=".length));
    } else if (arg.startsWith("--intervals=")) {
      args.intervals.push(
        ...arg
          .slice("--intervals=".length)
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else if (arg.startsWith("--symbols=")) {
      args.symbols = arg.slice("--symbols=".length).split(",").map((s) => s.trim().toUpperCase());
    } else if (arg.startsWith("--pages=")) {
      args.pages = parseInt(arg.slice("--pages=".length), 10);
    } else if (arg === "--full") {
      args.full = true;
    } else if (arg === "--all-intervals") {
      args.intervals = [...ALL_EXPORT_INTERVALS];
    } else if (arg === "--quick") {
      args.intervals = ["d1"];
    } else if (!arg.startsWith("--") && !args.intervals.length) {
      args.intervals.push(arg);
    }
  }
  if (args.intervals.length === 0) args.intervals = [...ALL_EXPORT_INTERVALS];
  return args;
}
