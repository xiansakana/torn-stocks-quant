import { NextRequest, NextResponse } from "next/server";
import type { OHLCVCandle, StrategyConfig } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG } from "@/types/stock";
import { runBacktest } from "@/lib/backtest";

const TORNSY_API_BASE = "https://tornsy.com/api";

interface RawOHLCV {
  data: [number, string, string, string, string, number][];
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      symbol = "TCI",
      interval = "d1",
      capital = 100000,
      config: configOverride,
    } = body as {
      symbol?: string;
      interval?: string;
      capital?: number;
      config?: Partial<StrategyConfig>;
    };

    const config: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, ...configOverride };

    // Fetch historical data - may need multiple pages
    let allCandles: OHLCVCandle[] = [];
    let to: number | undefined;

    // Fetch up to 3 pages (3000 candles)
    for (let page = 0; page < 3; page++) {
      let url = `${TORNSY_API_BASE}/${symbol.toLowerCase()}?interval=${interval}`;
      if (to) url += `&to=${to}`;

      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) break;

      const data: RawOHLCV = await res.json();
      const candles = parseOHLCV(data);

      if (candles.length === 0) break;
      allCandles = [...candles, ...allCandles]; // Prepend older data

      if (candles.length < 1000) break; // No more data

      // Set 'to' to the oldest timestamp for next page
      to = Math.floor(candles[0].timestamp / 1000);
    }

    if (allCandles.length < 50) {
      return NextResponse.json(
        { error: "Not enough historical data for backtesting" },
        { status: 400 }
      );
    }

    const result = runBacktest(allCandles, config, capital);

    return NextResponse.json({
      symbol,
      interval,
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
