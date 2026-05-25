import type { OHLCVCandle, StockInfo, StrategyConfig, StrategySignal } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG, TRACKED_SYMBOLS } from "@/types/stock";
import { generateSignal } from "@/lib/technical-analysis";

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

function holdSignal(symbol: string, name: string, price: number): StrategySignal {
  return {
    symbol,
    name,
    price,
    signal: "HOLD",
    strength: 0,
    rsi: NaN,
    macdSignal: "HOLD",
    bollingerSignal: "HOLD",
    rsiSignal: "HOLD",
    combinedScore: 0,
  };
}

export async function fetchAllSignals(
  config: StrategyConfig = DEFAULT_STRATEGY_CONFIG
): Promise<StrategySignal[]> {
  const stocksRes = await fetch(`${TORNSY_API_BASE}/stocks`, {
    cache: "no-store",
  });
  if (!stocksRes.ok) {
    throw new Error("Failed to fetch stocks");
  }

  const stocksData = await stocksRes.json();
  const stockMap = new Map<string, StockInfo>();
  for (const stock of stocksData.data as StockInfo[]) {
    stockMap.set(stock.stock, stock);
  }

  // Use selectedSymbols if provided, otherwise use all TRACKED_SYMBOLS
  const targetSymbols = config.selectedSymbols?.length
    ? config.selectedSymbols
    : TRACKED_SYMBOLS;

  const signals = await Promise.all(
    targetSymbols.map(async (symbol) => {
      try {
        const histRes = await fetch(
          `${TORNSY_API_BASE}/${symbol.toLowerCase()}?interval=d1`,
          { cache: "no-store" }
        );
        const stockInfo = stockMap.get(symbol);
        const fallbackPrice = parseFloat(stockInfo?.price ?? "0");

        if (!histRes.ok) {
          return holdSignal(symbol, stockInfo?.name ?? symbol, fallbackPrice);
        }

        const histData: RawOHLCV = await histRes.json();
        const candles = parseOHLCV(histData);

        if (candles.length < 50) {
          return holdSignal(
            symbol,
            stockInfo?.name ?? symbol,
            candles.length > 0 ? candles[candles.length - 1].close : fallbackPrice
          );
        }

        const currentPrice = parseFloat(
          stockInfo?.price ?? String(candles[candles.length - 1].close)
        );

        return generateSignal(
          symbol,
          stockInfo?.name ?? symbol,
          currentPrice,
          candles,
          config
        );
      } catch {
        const stockInfo = stockMap.get(symbol);
        return holdSignal(
          symbol,
          stockInfo?.name ?? symbol,
          parseFloat(stockInfo?.price ?? "0")
        );
      }
    })
  );

  signals.sort((a, b) => {
    const scoreA =
      a.signal === "BUY" ? a.strength : a.signal === "SELL" ? -a.strength : 0;
    const scoreB =
      b.signal === "BUY" ? b.strength : b.signal === "SELL" ? -b.strength : 0;
    return scoreB - scoreA;
  });

  return signals;
}
