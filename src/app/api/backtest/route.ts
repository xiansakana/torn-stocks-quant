import { NextRequest, NextResponse } from "next/server";
import type { OHLCVCandle, StrategyConfig } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG, TRACKED_SYMBOLS } from "@/types/stock";
import {
  runSingleStockBacktest,
  runPortfolioBacktest,
  prepareBacktestCandles,
  WARMUP_BARS,
  type StockCandleSeries,
} from "@/lib/backtest";

const TORNSY_API_BASE = "https://tornsy.com/api";

interface RawOHLCV {
  data: [number, string, string, string, string, number][];
}

interface RawTick {
  data: [number, string, number][];
}

function parseOHLCV(raw: RawOHLCV): OHLCVCandle[] {
  return raw.data.map(([timestamp, open, high, low, close, volume]) => ({
    timestamp: timestamp * 1000,
    open: parseFloat(open),
    high: parseFloat(high),
    low: parseFloat(low),
    close: parseFloat(close),
    volume,
  }));
}

function parseTicksToOHLCV(raw: RawTick): OHLCVCandle[] {
  const buckets = new Map<number, number[]>();

  for (const [timestamp, priceStr] of raw.data) {
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

function buildHistoryUrl(symbol: string, interval: string, to?: number): string {
  let url = `${TORNSY_API_BASE}/${symbol.toLowerCase()}`;
  const queryParams: string[] = [];

  if (interval !== "m1") {
    queryParams.push(`interval=${interval}`);
  }
  if (to) {
    queryParams.push(`to=${to}`);
  }
  if (queryParams.length > 0) {
    url += `?${queryParams.join("&")}`;
  }

  return url;
}

async function fetchCandles(
  symbol: string,
  interval: string,
  pages = 3
): Promise<OHLCVCandle[]> {
  let allCandles: OHLCVCandle[] = [];
  let to: number | undefined;

  for (let page = 0; page < pages; page++) {
    const url = buildHistoryUrl(symbol, interval, to);
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) break;

    const data = await res.json();
    const candles =
      interval === "m1"
        ? parseTicksToOHLCV(data as RawTick)
        : parseOHLCV(data as RawOHLCV);

    if (candles.length === 0) break;
    allCandles = [...candles, ...allCandles];

    if (candles.length < 1000) break;
    to = Math.floor(candles[0].timestamp / 1000);
  }

  return allCandles;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      symbol = "TCI",
      interval = "d1",
      capital = 100000,
      mode = "portfolio",
      startDate,
      endDate,
      config: configOverride,
    } = body as {
      symbol?: string;
      interval?: string;
      capital?: number;
      mode?: "single" | "portfolio";
      startDate?: string;
      endDate?: string;
      config?: Partial<StrategyConfig>;
    };

    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json(
        { error: "开始日期不能晚于结束日期" },
        { status: 400 }
      );
    }

    const config: StrategyConfig = {
      ...DEFAULT_STRATEGY_CONFIG,
      ...configOverride,
    };

    if (mode === "portfolio") {
      const series: StockCandleSeries[] = [];
      const fetchPages = startDate ? 5 : 3;

      await Promise.all(
        TRACKED_SYMBOLS.map(async (sym) => {
          try {
            const { candles } = prepareBacktestCandles(
              await fetchCandles(sym, interval, fetchPages),
              startDate,
              endDate
            );
            if (candles.length >= WARMUP_BARS) {
              series.push({ symbol: sym, candles });
            }
          } catch {
            /* skip failed symbols */
          }
        })
      );

      if (series.length === 0) {
        return NextResponse.json(
          { error: "Not enough historical data for portfolio backtesting" },
          { status: 400 }
        );
      }

      const tradingStartTs = startDate
        ? new Date(`${startDate}T00:00:00`).getTime()
        : undefined;

      const result = runPortfolioBacktest(series, config, capital, {
        tradingStartTs,
      });

      return NextResponse.json({
        mode: "portfolio",
        symbols: series.map((s) => s.symbol),
        interval,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        ...result,
      });
    }

    const fetchPages = startDate ? 5 : 3;
    const { candles: allCandles, tradingStartTs } = prepareBacktestCandles(
      await fetchCandles(symbol, interval, fetchPages),
      startDate,
      endDate
    );

    if (allCandles.length < WARMUP_BARS) {
      return NextResponse.json(
        { error: "Not enough historical data for backtesting" },
        { status: 400 }
      );
    }

    const result = runSingleStockBacktest(
      allCandles,
      config,
      capital,
      symbol.toUpperCase(),
      { tradingStartTs: startDate ? tradingStartTs : undefined }
    );

    return NextResponse.json({
      mode: "single",
      symbol: symbol.toUpperCase(),
      interval,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
