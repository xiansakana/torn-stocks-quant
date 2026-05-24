"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { OHLCVCandle, Interval, StrategySignal } from "@/types/stock";
import { INTERVAL_LABELS } from "@/types/stock";
import { AppShell } from "@/components/app-shell";
import {
  createChart,
  type IChartApi,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type CandlestickData,
  type Time,
} from "lightweight-charts";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const INTERVALS: Interval[] = [
  "d1", "w1", "n1", "y1", "h12", "h6", "h4", "h2", "h1", "m30", "m15", "m5", "m1",
];

interface RawOHLCV {
  data: [number, string, string, string, string, number][];
}

interface StockInfoRaw {
  data: { stock: string; name: string; price: string; total_shares: number; investors: number }[];
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

export default function StockDetailPage() {
  const params = useParams();
  const symbol = (params.symbol as string).toUpperCase();

  const [stockName, setStockName] = useState("");
  const [currentPrice, setCurrentPrice] = useState(0);
  const [candles, setCandles] = useState<OHLCVCandle[]>([]);
  const [interval, setInterval] = useState<Interval>("d1");
  const [signal, setSignal] = useState<StrategySignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [indicators, setIndicators] = useState<{
    rsi: number[];
    macd: { macd: number[]; signal: number[]; histogram: number[] };
    bb: { upper: number[]; middle: number[]; lower: number[] };
  } | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Fetch stock info
  useEffect(() => {
    fetch("/api/stocks")
      .then((r) => r.json())
      .then((data: StockInfoRaw) => {
        const stock = data.data.find(
          (s) => s.stock.toUpperCase() === symbol
        );
        if (stock) {
          setStockName(stock.name);
          setCurrentPrice(parseFloat(stock.price));
        }
      })
      .catch(() => {});
  }, [symbol]);

  // Fetch historical data
  const fetchHistorical = useCallback(async () => {
    setLoading(true);
    setIndicators(null);
    try {
      const url =
        interval === "m1"
          ? `/api/stocks/${symbol.toLowerCase()}`
          : `/api/stocks/${symbol.toLowerCase()}?interval=${interval}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: RawOHLCV = await res.json();
        const parsed = parseOHLCV(data);
        setCandles(parsed);
      }
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    fetchHistorical();
  }, [fetchHistorical]);

  // Fetch analysis signal
  useEffect(() => {
    fetch("/api/analysis")
      .then((r) => r.json())
      .then((data) => {
        const s = data.signals?.find(
          (sig: StrategySignal) => sig.symbol === symbol
        );
        if (s) setSignal(s);
      })
      .catch(() => {});
  }, [symbol]);

  // Compute indicators on client
  useEffect(() => {
    if (candles.length < 50) return;

    const closes = candles.map((c) => c.close);

    // Simple RSI
    const rsiValues: number[] = new Array(closes.length).fill(NaN);
    const period = 14;
    if (closes.length > period) {
      let avgGain = 0;
      let avgLoss = 0;
      for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
      }
      avgGain /= period;
      avgLoss /= period;
      rsiValues[period] =
        avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rsiValues[i] =
          avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    }

    // Bollinger Bands
    const bbUpper: number[] = new Array(closes.length).fill(NaN);
    const bbMiddle: number[] = new Array(closes.length).fill(NaN);
    const bbLower: number[] = new Array(closes.length).fill(NaN);
    const bbPeriod = 20;
    for (let i = bbPeriod - 1; i < closes.length; i++) {
      let sum = 0;
      for (let j = i - bbPeriod + 1; j <= i; j++) sum += closes[j];
      const mid = sum / bbPeriod;
      let sumSq = 0;
      for (let j = i - bbPeriod + 1; j <= i; j++)
        sumSq += (closes[j] - mid) ** 2;
      const std = Math.sqrt(sumSq / bbPeriod);
      bbUpper[i] = mid + 2 * std;
      bbMiddle[i] = mid;
      bbLower[i] = mid - 2 * std;
    }

    // MACD (simplified)
    const ema = (data: number[], p: number) => {
      const r: number[] = new Array(data.length).fill(NaN);
      const m = 2 / (p + 1);
      let s = 0;
      for (let i = 0; i < p; i++) s += data[i];
      r[p - 1] = s / p;
      for (let i = p; i < data.length; i++) {
        r[i] = (data[i] - r[i - 1]) * m + r[i - 1];
      }
      return r;
    };

    const fastEma = ema(closes, 12);
    const slowEma = ema(closes, 26);
    const macdLine: number[] = new Array(closes.length).fill(NaN);
    for (let i = 0; i < closes.length; i++) {
      if (!isNaN(fastEma[i]) && !isNaN(slowEma[i]))
        macdLine[i] = fastEma[i] - slowEma[i];
    }
    const validMacd = macdLine.filter((v) => !isNaN(v));
    const signalLine: number[] = new Array(closes.length).fill(NaN);
    if (validMacd.length >= 9) {
      const macdEma = ema(macdLine.map((v) => (isNaN(v) ? 0 : v)), 9);
      for (let i = 0; i < closes.length; i++) {
        if (!isNaN(macdLine[i])) signalLine[i] = macdEma[i];
      }
    }
    const histogram: number[] = new Array(closes.length).fill(NaN);
    for (let i = 0; i < closes.length; i++) {
      if (!isNaN(macdLine[i]) && !isNaN(signalLine[i]))
        histogram[i] = macdLine[i] - signalLine[i];
    }

    setIndicators({
      rsi: rsiValues,
      macd: { macd: macdLine, signal: signalLine, histogram },
      bb: { upper: bbUpper, middle: bbMiddle, lower: bbLower },
    });
  }, [candles]);

  // Render chart
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // Clean up
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#1a1d29" },
        textColor: "#8b8fa3",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#2a2d3a40" },
        horzLines: { color: "#2a2d3a40" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#3b82f680", labelBackgroundColor: "#3b82f6" },
        horzLine: { color: "#3b82f680", labelBackgroundColor: "#3b82f6" },
      },
      rightPriceScale: {
        borderColor: "#2a2d3a",
        textColor: "#8b8fa3",
      },
      timeScale: {
        borderColor: "#2a2d3a",
        timeVisible: interval.includes("h") || interval.includes("m"),
      },
      width: container.clientWidth,
      height: 400,
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const candleData: CandlestickData<Time>[] = candles.map((c) => ({
      time: (c.timestamp / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeries.setData(candleData);

    // Volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const volumeData = candles.map((c) => ({
      time: (c.timestamp / 1000) as Time,
      value: c.volume,
      color: c.close >= c.open ? "#22c55e20" : "#ef444420",
    }));

    volumeSeries.setData(volumeData);

    // Bollinger Bands overlay
    if (indicators && indicators.bb.upper.length === candles.length) {
      const bbUpperSeries = chart.addSeries(LineSeries, {
        color: "#3b82f660",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const bbLowerSeries = chart.addSeries(LineSeries, {
        color: "#3b82f660",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const bbMiddleSeries = chart.addSeries(LineSeries, {
        color: "#3b82f640",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      const toBBData = (arr: number[]) =>
        arr
          .map((v, i) => {
            const candle = candles[i];
            if (isNaN(v) || !candle) return null;
            return { time: (candle.timestamp / 1000) as Time, value: v };
          })
          .filter(Boolean) as { time: Time; value: number }[];

      bbUpperSeries.setData(toBBData(indicators.bb.upper));
      bbLowerSeries.setData(toBBData(indicators.bb.lower));
      bbMiddleSeries.setData(toBBData(indicators.bb.middle));
    }

    chart.timeScale().fitContent();

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, indicators, interval]);

  const priceChange =
    candles.length >= 2
      ? candles[candles.length - 1].close - candles[candles.length - 2].close
      : 0;
  const priceChangePercent =
    candles.length >= 2 && candles[candles.length - 2].close > 0
      ? (priceChange / candles[candles.length - 2].close) * 100
      : 0;

  const lastRSI =
    indicators && indicators.rsi.length > 0
      ? indicators.rsi[indicators.rsi.length - 1]
      : NaN;

  return (
    <AppShell>
      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/"
            className="p-2 rounded-lg hover:bg-[#2a2d3a] text-[#8b8fa3] hover:text-[#e1e4ea] transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-data text-[#e1e4ea]">
                {symbol}
              </h1>
              <span className="text-sm text-[#8b8fa3]">{stockName}</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <div className="font-data text-2xl font-bold text-[#e1e4ea]">
                {currentPrice > 0
                  ? currentPrice.toFixed(2)
                  : candles.length > 0
                    ? candles[candles.length - 1].close.toFixed(2)
                    : "-"}
              </div>
              <div
                className={cn(
                  "font-data text-sm flex items-center justify-end gap-1",
                  priceChange >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
                )}
              >
                {priceChange >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {priceChange >= 0 ? "+" : ""}
                {priceChange.toFixed(2)} ({priceChangePercent >= 0 ? "+" : ""}
                {priceChangePercent.toFixed(2)}%)
              </div>
            </div>
            {signal && (
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium",
                  signal.signal === "BUY" &&
                    "bg-[#22c55e]/15 text-[#22c55e]",
                  signal.signal === "SELL" &&
                    "bg-[#ef4444]/15 text-[#ef4444]",
                  signal.signal === "HOLD" &&
                    "bg-[#8b8fa3]/15 text-[#8b8fa3]"
                )}
              >
                {signal.signal === "BUY" && (
                  <ArrowUpRight className="h-4 w-4" />
                )}
                {signal.signal === "SELL" && (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                {signal.signal === "HOLD" && (
                  <Activity className="h-4 w-4" />
                )}
                {signal.signal === "BUY"
                  ? "买入"
                  : signal.signal === "SELL"
                    ? "卖出"
                    : "观望"}
                {signal.strength > 0 && (
                  <span className="font-data">({signal.strength}%)</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Interval Selector */}
        <div className="flex items-center gap-1 mb-4">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                interval === iv
                  ? "bg-[#3b82f6] text-white"
                  : "text-[#8b8fa3] hover:bg-[#2a2d3a] hover:text-[#e1e4ea]"
              )}
            >
              {INTERVAL_LABELS[iv]}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4 mb-6">
          {loading ? (
            <div className="h-[400px] rounded skeleton" />
          ) : (
            <div ref={chartContainerRef} className="w-full h-[400px]" />
          )}
        </div>

        {/* Indicators */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* RSI */}
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
            <h3 className="text-sm font-semibold text-[#e1e4ea] mb-3">
              RSI (14)
            </h3>
            <div className="text-center py-4">
              <span
                className={cn(
                  "font-data text-4xl font-bold",
                  isNaN(lastRSI)
                    ? "text-[#8b8fa3]"
                    : lastRSI < 30
                      ? "text-[#22c55e]"
                      : lastRSI > 70
                        ? "text-[#ef4444]"
                        : "text-[#e1e4ea]"
                )}
              >
                {isNaN(lastRSI) ? "-" : lastRSI.toFixed(1)}
              </span>
              <div className="flex justify-between mt-3 text-xs text-[#8b8fa3]">
                <span className="text-[#22c55e]">超卖 {"<"}30</span>
                <span>中性</span>
                <span className="text-[#ef4444]">超买 {">"}70</span>
              </div>
              {/* RSI bar */}
              {!isNaN(lastRSI) && (
                <div className="mt-2 h-2 bg-[#2a2d3a] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      lastRSI < 30
                        ? "bg-[#22c55e]"
                        : lastRSI > 70
                          ? "bg-[#ef4444]"
                          : "bg-[#3b82f6]"
                    )}
                    style={{ width: `${lastRSI}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* MACD */}
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
            <h3 className="text-sm font-semibold text-[#e1e4ea] mb-3">
              MACD (12/26/9)
            </h3>
            {indicators ? (
              <div className="space-y-3">
                {(() => {
                  const len = indicators.macd.macd.length - 1;
                  const macdVal = indicators.macd.macd[len];
                  const signalVal = indicators.macd.signal[len];
                  const histVal = indicators.macd.histogram[len];
                  const prevHist = indicators.macd.histogram[len - 1];
                  const isBullish =
                    !isNaN(histVal) && !isNaN(prevHist) && histVal > prevHist;
                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-xs text-[#8b8fa3]">MACD</span>
                        <span className="font-data text-sm text-[#3b82f6]">
                          {isNaN(macdVal) ? "-" : macdVal.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-[#8b8fa3]">Signal</span>
                        <span className="font-data text-sm text-[#f59e0b]">
                          {isNaN(signalVal) ? "-" : signalVal.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-[#8b8fa3]">Histogram</span>
                        <span
                          className={cn(
                            "font-data text-sm",
                            isNaN(histVal)
                              ? "text-[#8b8fa3]"
                              : histVal >= 0
                                ? "text-[#22c55e]"
                                : "text-[#ef4444]"
                          )}
                        >
                          {isNaN(histVal) ? "-" : histVal.toFixed(2)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "text-xs px-2 py-1 rounded text-center",
                          isBullish
                            ? "bg-[#22c55e]/10 text-[#22c55e]"
                            : "bg-[#ef4444]/10 text-[#ef4444]"
                        )}
                      >
                        {isBullish ? "多头动能增强" : "空头动能增强"}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="h-20 rounded skeleton" />
            )}
          </div>

          {/* Bollinger Bands */}
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
            <h3 className="text-sm font-semibold text-[#e1e4ea] mb-3">
              Bollinger Bands (20, 2)
            </h3>
            {indicators ? (
              <div className="space-y-3">
                {(() => {
                  const len = indicators.bb.upper.length - 1;
                  const upper = indicators.bb.upper[len];
                  const middle = indicators.bb.middle[len];
                  const lower = indicators.bb.lower[len];
                  const price = candles.length > 0 ? candles[candles.length - 1].close : 0;
                  const bandWidth = !isNaN(upper) && !isNaN(lower) ? upper - lower : 0;
                  const position =
                    bandWidth > 0 && !isNaN(lower)
                      ? ((price - lower) / bandWidth) * 100
                      : NaN;

                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-xs text-[#8b8fa3]">上轨</span>
                        <span className="font-data text-sm text-[#ef4444]">
                          {isNaN(upper) ? "-" : upper.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-[#8b8fa3]">中轨</span>
                        <span className="font-data text-sm text-[#3b82f6]">
                          {isNaN(middle) ? "-" : middle.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-[#8b8fa3]">下轨</span>
                        <span className="font-data text-sm text-[#22c55e]">
                          {isNaN(lower) ? "-" : lower.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-[#8b8fa3]">位置</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-[#2a2d3a] rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                position < 30
                                  ? "bg-[#22c55e]"
                                  : position > 70
                                    ? "bg-[#ef4444]"
                                    : "bg-[#3b82f6]"
                              )}
                              style={{
                                width: `${isNaN(position) ? 50 : position}%`,
                              }}
                            />
                          </div>
                          <span className="font-data text-xs text-[#8b8fa3]">
                            {isNaN(position) ? "-" : position.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="h-20 rounded skeleton" />
            )}
          </div>
        </div>

        {/* Signal Detail */}
        {signal && (
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
            <h3 className="text-sm font-semibold text-[#e1e4ea] mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#3b82f6]" />
              策略信号详情
            </h3>
            <div className="grid grid-cols-5 gap-4">
              <SignalCard
                label="RSI 信号"
                value={signal.rsiSignal}
                rsi={signal.rsi}
              />
              <SignalCard label="MACD 信号" value={signal.macdSignal} />
              <SignalCard label="布林带信号" value={signal.bollingerSignal} />
              <SignalCard
                label="综合评分"
                value={signal.combinedScore > 0 ? "BUY" : signal.combinedScore < 0 ? "SELL" : "HOLD"}
                score={signal.combinedScore}
              />
              <SignalCard
                label="最终信号"
                value={signal.signal}
                strength={signal.strength}
                highlight
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SignalCard({
  label,
  value,
  rsi,
  score,
  strength,
  highlight,
}: {
  label: string;
  value: string;
  rsi?: number;
  score?: number;
  strength?: number;
  highlight?: boolean;
}) {
  const isBuy = value === "BUY";
  const isSell = value === "SELL";
  const color = isBuy ? "#22c55e" : isSell ? "#ef4444" : "#8b8fa3";

  return (
    <div
      className={cn(
        "rounded-lg p-3 text-center",
        highlight && isBuy && "bg-[#22c55e]/5 border border-[#22c55e]/20",
        highlight && isSell && "bg-[#ef4444]/5 border border-[#ef4444]/20",
        (!highlight || value === "HOLD") && "bg-[#0f1117]"
      )}
    >
      <div className="text-xs text-[#8b8fa3] mb-2">{label}</div>
      <div className="font-data text-lg font-bold" style={{ color }}>
        {isBuy ? "买入" : isSell ? "卖出" : "观望"}
      </div>
      {rsi !== undefined && !isNaN(rsi) && (
        <div className="text-xs text-[#8b8fa3] mt-1 font-data">
          RSI: {rsi.toFixed(1)}
        </div>
      )}
      {score !== undefined && (
        <div className="text-xs text-[#8b8fa3] mt-1 font-data">
          {score > 0 ? "+" : ""}
          {score.toFixed(2)}
        </div>
      )}
      {strength !== undefined && strength > 0 && (
        <div className="text-xs text-[#8b8fa3] mt-1 font-data">
          强度: {strength}%
        </div>
      )}
    </div>
  );
}
