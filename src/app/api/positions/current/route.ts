import { NextRequest, NextResponse } from "next/server";
import type { StrategyConfig } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG, TRACKED_SYMBOLS } from "@/types/stock";
import {
  runPortfolioCurrentState,
  WARMUP_BARS,
  type StockCandleSeries,
} from "@/lib/backtest";

const TORNSY_API_BASE = "https://tornsy.com/api";

interface RawOHLCV {
  data: [number, string, string, string, string, number][];
}

function parseOHLCV(raw: RawOHLCV) {
  return raw.data.map(([timestamp, open, high, low, close, volume]) => ({
    timestamp: timestamp * 1000,
    open: parseFloat(open),
    high: parseFloat(high),
    low: parseFloat(low),
    close: parseFloat(close),
    volume,
  }));
}

async function fetchCandles(symbol: string): Promise<StockCandleSeries | null> {
  try {
    const res = await fetch(`${TORNSY_API_BASE}/${symbol.toLowerCase()}?interval=d1`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: RawOHLCV = await res.json();
    const candles = parseOHLCV(data);
    if (candles.length < WARMUP_BARS) return null;
    return { symbol, candles };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      capital = 100000,
      config: configOverride,
    } = body as {
      capital?: number;
      config?: Partial<StrategyConfig>;
    };

    const config: StrategyConfig = {
      ...DEFAULT_STRATEGY_CONFIG,
      ...configOverride,
    };

    const series: StockCandleSeries[] = [];
    await Promise.all(
      TRACKED_SYMBOLS.map(async (sym) => {
        const item = await fetchCandles(sym);
        if (item) series.push(item);
      })
    );

    if (series.length === 0) {
      return NextResponse.json(
        { error: "Not enough market data for current positions" },
        { status: 400 }
      );
    }

    const portfolio = runPortfolioCurrentState(series, config, capital);

    return NextResponse.json({
      ...portfolio,
      config,
      timestamp: Date.now(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
