import { NextRequest, NextResponse } from "next/server";
import type { OHLCVCandle, StockInfo, StrategyConfig } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG } from "@/types/stock";
import { generateSignal } from "@/lib/technical-analysis";

const TORNSY_API_BASE = "https://tornsy.com/api";

const TRACKED_SYMBOLS = [
  "FHG", "MUN", "TCI", "SYM", "MCS", "TSB", "CNC", "TMI", "PTS", "WLT",
  "IOU", "GRN", "BAG", "WSU", "TCP", "TGP", "MSG", "PRN", "HRG", "LSC",
  "SYS", "CBD", "TCC", "ASS", "EWM", "THS", "EVL", "LAG", "ELT", "TCM",
  "TCT", "LOS", "YAZ", "IIL", "IST",
];

interface RawOHLCV {
  data: [number, string, string, string, string, number][];
}

interface RawTick {
  data: [number, string, number][];
}

function parseOHLCV(raw: RawOHLCV): OHLCVCandle[] {
  return raw.data.map(([timestamp, open, high, low, close, volume]) => ({
    timestamp: timestamp * 1000, // Convert to ms
    open: parseFloat(open),
    high: parseFloat(high),
    low: parseFloat(low),
    close: parseFloat(close),
    volume,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const configParam = searchParams.get("config");
    const config: StrategyConfig = configParam
      ? { ...DEFAULT_STRATEGY_CONFIG, ...JSON.parse(configParam) }
      : DEFAULT_STRATEGY_CONFIG;

    // Fetch all stocks info
    const stocksRes = await fetch(`${TORNSY_API_BASE}/stocks`, {
      next: { revalidate: 60 },
    });
    if (!stocksRes.ok) {
      return NextResponse.json({ error: "Failed to fetch stocks" }, { status: 500 });
    }
    const stocksData = await stocksRes.json();
    const stockMap = new Map<string, StockInfo>();
    for (const stock of stocksData.data as StockInfo[]) {
      stockMap.set(stock.stock, stock);
    }

    // Fetch historical data for all tracked stocks (d1 interval)
    const signals = await Promise.all(
      TRACKED_SYMBOLS.map(async (symbol) => {
        try {
          const histRes = await fetch(`${TORNSY_API_BASE}/${symbol.toLowerCase()}?interval=d1`, {
            next: { revalidate: 120 },
          });
          if (!histRes.ok) {
            return {
              symbol,
              name: stockMap.get(symbol)?.name ?? symbol,
              price: parseFloat(stockMap.get(symbol)?.price ?? "0"),
              signal: "HOLD" as const,
              strength: 0,
              rsi: NaN,
              macdSignal: "HOLD" as const,
              bollingerSignal: "HOLD" as const,
              rsiSignal: "HOLD" as const,
              combinedScore: 0,
            };
          }
          const histData: RawOHLCV = await histRes.json();
          const candles = parseOHLCV(histData);

          if (candles.length < 50) {
            return {
              symbol,
              name: stockMap.get(symbol)?.name ?? symbol,
              price: candles.length > 0 ? candles[candles.length - 1].close : 0,
              signal: "HOLD" as const,
              strength: 0,
              rsi: NaN,
              macdSignal: "HOLD" as const,
              bollingerSignal: "HOLD" as const,
              rsiSignal: "HOLD" as const,
              combinedScore: 0,
            };
          }

          const stockInfo = stockMap.get(symbol);
          const currentPrice = parseFloat(stockInfo?.price ?? String(candles[candles.length - 1].close));

          return generateSignal(
            symbol,
            stockInfo?.name ?? symbol,
            currentPrice,
            candles,
            config
          );
        } catch {
          return {
            symbol,
            name: stockMap.get(symbol)?.name ?? symbol,
            price: parseFloat(stockMap.get(symbol)?.price ?? "0"),
            signal: "HOLD" as const,
            strength: 0,
            rsi: NaN,
            macdSignal: "HOLD" as const,
            bollingerSignal: "HOLD" as const,
            rsiSignal: "HOLD" as const,
            combinedScore: 0,
          };
        }
      })
    );

    // Sort by strength descending
    signals.sort((a, b) => {
      const scoreA = a.signal === "BUY" ? a.strength : a.signal === "SELL" ? -a.strength : 0;
      const scoreB = b.signal === "BUY" ? b.strength : b.signal === "SELL" ? -b.strength : 0;
      return scoreB - scoreA;
    });

    return NextResponse.json({
      signals,
      config,
      timestamp: Date.now(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
