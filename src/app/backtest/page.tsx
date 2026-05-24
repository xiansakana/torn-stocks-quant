"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { StrategyConfig, BacktestResult, Interval } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG, TRACKED_SYMBOLS, ALL_INTERVALS, INTERVAL_LABELS } from "@/types/stock";
import { AppShell } from "@/components/app-shell";
import {
  createChart,
  type IChartApi,
  ColorType,
  LineSeries,
  type LineData,
  type Time,
} from "lightweight-charts";
import {
  FlaskConical,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  BarChart3,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function BacktestPage() {
  const [mode, setMode] = useState<"single" | "portfolio">("portfolio");
  const [symbol, setSymbol] = useState("TCI");
  const [interval, setInterval] = useState<Interval>("d1");
  const [capital, setCapital] = useState(100000);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const runBacktest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          interval,
          capital,
          config,
          mode,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "回测失败");
        return;
      }
      setResult(data as BacktestResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "回测请求失败");
    } finally {
      setLoading(false);
    }
  }, [symbol, interval, capital, config, mode, startDate, endDate]);

  // Render equity curve
  useEffect(() => {
    if (!chartContainerRef.current || !result || result.equityCurve.length === 0) return;

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
      rightPriceScale: {
        visible: false,
      },
      leftPriceScale: {
        visible: true,
        borderColor: "#2a2d3a",
      },
      timeScale: {
        borderColor: "#2a2d3a",
      },
      width: container.clientWidth,
      height: 300,
    });

    chartRef.current = chart;

    const equitySeries = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      priceScaleId: "left",
      priceFormat: {
        type: "custom",
        formatter: (price: number) =>
          `${price >= 0 ? "+" : ""}${price.toFixed(1)}%`,
      },
    });

    const equityData: LineData<Time>[] = result.equityCurve.map((point) => ({
      time: (point.timestamp / 1000) as Time,
      value: ((point.equity / capital) - 1) * 100,
    }));

    equitySeries.setData(equityData);

    const baselineSeries = chart.addSeries(LineSeries, {
      color: "#8b8fa340",
      lineWidth: 1,
      lineStyle: 2,
      priceScaleId: "left",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    baselineSeries.setData(
      result.equityCurve.map((point) => ({
        time: (point.timestamp / 1000) as Time,
        value: 0,
      }))
    );

    chart.timeScale().fitContent();

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
  }, [result, capital]);

  return (
    <AppShell>
      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e1e4ea]">历史回测</h1>
            <p className="text-sm text-[#8b8fa3] mt-1">
              组合回测 — 最多 {config.maxPositions} 只持仓，单仓 {Math.round(config.positionSize * 100)}%
            </p>
          </div>
        </div>

        {/* Config */}
        <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4 mb-6">
          <div className="grid grid-cols-6 gap-4 mb-4">
            {/* Mode */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">回测模式</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "single" | "portfolio")}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              >
                <option value="portfolio">组合 (推荐)</option>
                <option value="single">单股</option>
              </select>
            </div>

            {/* Symbol */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">标的</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={mode === "portfolio"}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none disabled:opacity-50"
              >
                {TRACKED_SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Interval */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">K线周期</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as Interval)}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              >
                {ALL_INTERVALS.map((iv) => (
                  <option key={iv} value={iv}>
                    {INTERVAL_LABELS[iv]}
                  </option>
                ))}
              </select>
            </div>

            {/* Capital */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">初始资金</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(parseInt(e.target.value) || 100000)}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>

            {/* Start Date */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">开始日期</label>
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="全部历史"
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">结束日期</label>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
              <p className="text-[10px] text-[#8b8fa3] mt-1">留空表示不限</p>
            </div>
          </div>

          <div className="grid grid-cols-6 gap-4 mb-4">
            {/* RSI Period */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">RSI 周期</label>
              <input
                type="number"
                value={config.rsiPeriod}
                onChange={(e) =>
                  setConfig({ ...config, rsiPeriod: parseInt(e.target.value) || 14 })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>

            {/* RSI Overbought */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">RSI 超买</label>
              <input
                type="number"
                value={config.rsiOverbought}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    rsiOverbought: parseInt(e.target.value) || 70,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>

            {/* RSI Oversold */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">RSI 超卖</label>
              <input
                type="number"
                value={config.rsiOversold}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    rsiOversold: parseInt(e.target.value) || 30,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-6 gap-4">
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">单仓比例 (%)</label>
              <input
                type="number"
                value={Math.round(config.positionSize * 100)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    positionSize: (parseInt(e.target.value) || 40) / 100,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">最大持仓数</label>
              <input
                type="number"
                value={config.maxPositions}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    maxPositions: parseInt(e.target.value) || 4,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">止损 (%)</label>
              <input
                type="number"
                value={Math.round(config.stopLoss * 100)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    stopLoss: (parseInt(e.target.value) || 8) / 100,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">止盈 (%)</label>
              <input
                type="number"
                value={Math.round(config.takeProfit * 100)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    takeProfit: (parseInt(e.target.value) || 45) / 100,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">移动止损 (%)</label>
              <input
                type="number"
                value={Math.round(config.trailingStop * 100)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    trailingStop: (parseInt(e.target.value) || 12) / 100,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">最低买入分</label>
              <input
                type="number"
                step={0.01}
                value={config.minBuyScore}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    minBuyScore: parseFloat(e.target.value) || 0.38,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={runBacktest}
              disabled={loading}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                loading
                  ? "bg-[#3b82f6]/50 text-white/50 cursor-not-allowed"
                  : "bg-[#3b82f6] text-white hover:bg-[#3b82f6]/80"
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {loading ? "运行中..." : "运行回测"}
            </button>
            <button
              onClick={() => {
                setConfig(DEFAULT_STRATEGY_CONFIG);
                setMode("portfolio");
                setSymbol("TCI");
                setInterval("d1");
                setCapital(100000);
                setStartDate("");
                setEndDate("");
              }}
              className="px-4 py-2 rounded-lg bg-[#2a2d3a] text-[#8b8fa3] hover:text-[#e1e4ea] text-sm transition-colors"
            >
              重置参数
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg p-4 mb-6 flex items-center gap-2 text-[#ef4444] text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <MetricCard
                label="年化收益"
                value={`${result.metrics.annualizedReturn >= 0 ? "+" : ""}${(result.metrics.annualizedReturn * 100).toFixed(1)}%`}
                icon={<TrendingUp className="h-5 w-5" />}
                positive={result.metrics.annualizedReturn >= 0.3}
              />
              <MetricCard
                label="总收益"
                value={`${result.metrics.totalReturnPercent >= 0 ? "+" : ""}${(result.metrics.totalReturnPercent * 100).toFixed(2)}%`}
                icon={<DollarSign className="h-5 w-5" />}
                positive={result.metrics.totalReturnPercent >= 0}
              />
              <MetricCard
                label="交易次数"
                value={result.metrics.totalTrades.toString()}
                icon={<BarChart3 className="h-5 w-5" />}
              />
              <MetricCard
                label="胜率"
                value={`${(result.metrics.winRate * 100).toFixed(1)}%`}
                icon={<Target className="h-5 w-5" />}
                positive={result.metrics.winRate >= 0.5}
              />
              <MetricCard
                label="最大回撤"
                value={`${(result.metrics.maxDrawdownPercent * 100).toFixed(2)}%`}
                icon={<TrendingDown className="h-5 w-5" />}
                negative
              />
              <MetricCard
                label="盈亏比"
                value={
                  result.metrics.profitFactor === Infinity
                    ? "∞"
                    : result.metrics.profitFactor.toFixed(2)
                }
                icon={<TrendingUp className="h-5 w-5" />}
                positive={result.metrics.profitFactor >= 1}
              />
            </div>

            {/* Additional Metrics */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
                <span className="text-xs text-[#8b8fa3]">回测模式</span>
                <div className="font-data text-lg font-bold text-[#e1e4ea] mt-1">
                  {result.mode === "portfolio" ? "组合" : "单股"}
                </div>
              </div>
              <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
                <span className="text-xs text-[#8b8fa3]">年化收益</span>
                <div
                  className={cn(
                    "font-data text-lg font-bold mt-1",
                    result.metrics.annualizedReturn >= 0.3
                      ? "text-[#22c55e]"
                      : "text-[#e1e4ea]"
                  )}
                >
                  {(result.metrics.annualizedReturn * 100).toFixed(2)}%
                </div>
              </div>
              <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
                <span className="text-xs text-[#8b8fa3]">平均交易收益</span>
                <div className="font-data text-lg font-bold text-[#e1e4ea] mt-1">
                  {(result.metrics.avgTradeReturn * 100).toFixed(3)}%
                </div>
              </div>
              <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
                <span className="text-xs text-[#8b8fa3]">夏普比率</span>
                <div className="font-data text-lg font-bold text-[#e1e4ea] mt-1">
                  {result.metrics.sharpeRatio.toFixed(2)}
                </div>
              </div>
              <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
                <span className="text-xs text-[#8b8fa3]">总手续费</span>
                <div className="font-data text-lg font-bold text-[#f59e0b] mt-1">
                  {result.metrics.totalFees.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Equity Curve */}
            <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#e1e4ea]">
                  权益曲线（累计收益率）
                </h3>
                {(result.startDate || result.endDate) && (
                  <span className="text-xs text-[#8b8fa3] font-data">
                    {result.startDate ?? "—"} ~ {result.endDate ?? "—"}
                  </span>
                )}
              </div>
              <div ref={chartContainerRef} className="w-full h-[300px]" />
            </div>

            {/* Trade List */}
            <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a]">
              <div className="px-4 py-3 border-b border-[#2a2d3a] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#e1e4ea]">
                  交易记录
                </h3>
                <span className="text-xs text-[#8b8fa3]">
                  共 {result.trades.length} 笔交易
                </span>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#1a1d29]">
                    <tr className="border-b border-[#2a2d3a] text-[#8b8fa3]">
                      <th className="text-left px-4 py-2 font-medium">#</th>
                      {result.mode === "portfolio" && (
                        <th className="text-left px-4 py-2 font-medium">标的</th>
                      )}
                      <th className="text-left px-4 py-2 font-medium">
                        买入日期
                      </th>
                      <th className="text-left px-4 py-2 font-medium">
                        卖出日期
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        买入价
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        卖出价
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        数量
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        手续费
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        盈亏
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        单笔收益率
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        累计收益率
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let runningEquity = capital;
                      const sortedTrades = [...result.trades].sort(
                        (a, b) => a.exitDate - b.exitDate
                      );
                      return sortedTrades.map((trade, i) => {
                        runningEquity += trade.pnl;
                        const cumulativeReturn =
                          (runningEquity - capital) / capital;
                        return (
                      <tr
                        key={i}
                        className="border-b border-[#2a2d3a]/50 hover:bg-[#2a2d3a]/30 transition-colors"
                      >
                        <td className="px-4 py-2 text-[#8b8fa3]">{i + 1}</td>
                        {result.mode === "portfolio" && (
                          <td className="px-4 py-2 font-data text-[#3b82f6]">
                            {trade.symbol ?? "-"}
                          </td>
                        )}
                        <td className="px-4 py-2 font-data text-[#e1e4ea]">
                          {new Date(trade.entryDate).toLocaleDateString("zh-CN")}
                        </td>
                        <td className="px-4 py-2 font-data text-[#e1e4ea]">
                          {new Date(trade.exitDate).toLocaleDateString("zh-CN")}
                        </td>
                        <td className="px-4 py-2 text-right font-data text-[#e1e4ea]">
                          {trade.entryPrice.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right font-data text-[#e1e4ea]">
                          {trade.exitPrice.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right font-data text-[#8b8fa3]">
                          {trade.shares.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right font-data text-[#f59e0b]">
                          {trade.fee.toFixed(2)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2 text-right font-data",
                            trade.pnl >= 0
                              ? "text-[#22c55e]"
                              : "text-[#ef4444]"
                          )}
                        >
                          {trade.pnl >= 0 ? "+" : ""}
                          {trade.pnl.toFixed(2)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2 text-right font-data",
                            trade.pnlPercent >= 0
                              ? "text-[#22c55e]"
                              : "text-[#ef4444]"
                          )}
                        >
                          {trade.pnlPercent >= 0 ? "+" : ""}
                          {(trade.pnlPercent * 100).toFixed(2)}%
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2 text-right font-data font-medium",
                            cumulativeReturn >= 0
                              ? "text-[#22c55e]"
                              : "text-[#ef4444]"
                          )}
                        >
                          {cumulativeReturn >= 0 ? "+" : ""}
                          {(cumulativeReturn * 100).toFixed(2)}%
                        </td>
                      </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Empty State */}
        {!result && !loading && !error && (
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-16 text-center">
            <FlaskConical className="h-12 w-12 text-[#8b8fa3] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#e1e4ea] mb-2">
              选择参数并运行回测
            </h3>
            <p className="text-sm text-[#8b8fa3]">
              默认使用组合模式：分散持仓、止损止盈、按信号强度分配仓位
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  icon,
  positive,
  negative,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  positive?: boolean;
  negative?: boolean;
}) {
  const color = positive
    ? "#22c55e"
    : negative
      ? "#ef4444"
      : "#e1e4ea";

  return (
    <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#8b8fa3]">{label}</span>
        <div style={{ color }}>{icon}</div>
      </div>
      <span className="font-data text-2xl font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
