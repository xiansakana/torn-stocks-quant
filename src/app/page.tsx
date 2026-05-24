"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { StockInfo, StrategySignal } from "@/types/stock";
import { TRACKED_SYMBOLS } from "@/types/stock";
import { AppShell } from "@/components/app-shell";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Users,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getActiveStrategyConfig,
  STRATEGY_APPLIED_EVENT,
} from "@/lib/strategy-storage";

export default function DashboardPage() {
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [signals, setSignals] = useState<StrategySignal[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [strategyConfig, setStrategyConfig] = useState(getActiveStrategyConfig);

  useEffect(() => {
    const refreshConfig = () => setStrategyConfig(getActiveStrategyConfig());
    window.addEventListener(STRATEGY_APPLIED_EVENT, refreshConfig);
    return () => window.removeEventListener(STRATEGY_APPLIED_EVENT, refreshConfig);
  }, []);

  const fetchStocks = useCallback(async () => {
    try {
      const res = await fetch("/api/stocks");
      if (res.ok) {
        const data = await res.json();
        const tracked = (data.data as StockInfo[]).filter((s) =>
          TRACKED_SYMBOLS.includes(s.stock as typeof TRACKED_SYMBOLS[number])
        );
        setStocks(tracked);
        setLastUpdated(Date.now());
      }
    } finally {
      setLoadingStocks(false);
    }
  }, []);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/analysis?config=${encodeURIComponent(JSON.stringify(strategyConfig))}`
      );
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals);
      }
    } finally {
      setLoadingSignals(false);
    }
  }, [strategyConfig]);

  useEffect(() => {
    fetchStocks();
    fetchSignals();
    const interval = setInterval(fetchStocks, 60000);
    return () => clearInterval(interval);
  }, [fetchStocks, fetchSignals]);

  const signalMap = new Map(signals.map((s) => [s.symbol, s]));

  // Compute summary stats
  const buySignals = signals.filter((s) => s.signal === "BUY").length;
  const sellSignals = signals.filter((s) => s.signal === "SELL").length;
  const holdSignals = signals.filter((s) => s.signal === "HOLD").length;

  const topBuys = signals.filter((s) => s.signal === "BUY").slice(0, 5);
  const topSells = signals.filter((s) => s.signal === "SELL").slice(0, 5);

  return (
    <AppShell>
      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e1e4ea]">
              Torn Stocks Quant
            </h1>
            <p className="text-sm text-[#8b8fa3] mt-1">
              Torn City 股票量化分析平台
            </p>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdated > 0 && (
              <span className="text-xs text-[#8b8fa3]">
                更新于{" "}
                {new Date(lastUpdated).toLocaleTimeString("zh-CN")}
              </span>
            )}
            <button
              onClick={() => {
                setLoadingStocks(true);
                setLoadingSignals(true);
                fetchStocks();
                fetchSignals();
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#2a2d3a] hover:bg-[#3b82f6]/20 text-[#8b8fa3] hover:text-[#3b82f6] transition-all text-sm"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (loadingStocks || loadingSignals) && "animate-spin"
                )}
              />
              刷新
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            label="跟踪标的"
            value={TRACKED_SYMBOLS.length.toString()}
            icon={<BarChart3 className="h-5 w-5" />}
            color="#3b82f6"
          />
          <StatCard
            label="买入信号"
            value={buySignals.toString()}
            icon={<TrendingUp className="h-5 w-5" />}
            color="#22c55e"
          />
          <StatCard
            label="卖出信号"
            value={sellSignals.toString()}
            icon={<TrendingDown className="h-5 w-5" />}
            color="#ef4444"
          />
          <StatCard
            label="观望"
            value={holdSignals.toString()}
            icon={<Minus className="h-5 w-5" />}
            color="#8b8fa3"
          />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Signal Highlights */}
          <div className="col-span-1 space-y-4">
            {/* Top Buys */}
            <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
              <h3 className="text-sm font-semibold text-[#22c55e] mb-3 flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4" />
                买入信号
              </h3>
              {loadingSignals ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 rounded skeleton" />
                  ))}
                </div>
              ) : topBuys.length === 0 ? (
                <p className="text-sm text-[#8b8fa3]">暂无买入信号</p>
              ) : (
                <div className="space-y-2">
                  {topBuys.map((s) => (
                    <Link
                      key={s.symbol}
                      href={`/stock/${s.symbol.toLowerCase()}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-[#22c55e]/5 transition-colors"
                    >
                      <div>
                        <span className="font-data font-semibold text-[#e1e4ea]">
                          {s.symbol}
                        </span>
                        <span className="text-xs text-[#8b8fa3] ml-2">
                          {s.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-data text-sm text-[#22c55e]">
                          {s.price.toFixed(2)}
                        </span>
                        <span className="text-xs bg-[#22c55e]/15 text-[#22c55e] px-2 py-0.5 rounded-full">
                          {s.strength}%
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Top Sells */}
            <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
              <h3 className="text-sm font-semibold text-[#ef4444] mb-3 flex items-center gap-2">
                <ArrowDownRight className="h-4 w-4" />
                卖出信号
              </h3>
              {loadingSignals ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 rounded skeleton" />
                  ))}
                </div>
              ) : topSells.length === 0 ? (
                <p className="text-sm text-[#8b8fa3]">暂无卖出信号</p>
              ) : (
                <div className="space-y-2">
                  {topSells.map((s) => (
                    <Link
                      key={s.symbol}
                      href={`/stock/${s.symbol.toLowerCase()}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-[#ef4444]/5 transition-colors"
                    >
                      <div>
                        <span className="font-data font-semibold text-[#e1e4ea]">
                          {s.symbol}
                        </span>
                        <span className="text-xs text-[#8b8fa3] ml-2">
                          {s.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-data text-sm text-[#ef4444]">
                          {s.price.toFixed(2)}
                        </span>
                        <span className="text-xs bg-[#ef4444]/15 text-[#ef4444] px-2 py-0.5 rounded-full">
                          {s.strength}%
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stock Table */}
          <div className="col-span-2">
            <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a]">
              <div className="px-4 py-3 border-b border-[#2a2d3a] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#e1e4ea]">
                  全市场行情
                </h3>
                <span className="text-xs text-[#8b8fa3]">
                  共 {stocks.length} 只标的
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2d3a] text-[#8b8fa3]">
                      <th className="text-left px-4 py-2 font-medium">标的</th>
                      <th className="text-right px-4 py-2 font-medium">
                        价格
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        投资者
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        总股数
                      </th>
                      <th className="text-center px-4 py-2 font-medium">
                        信号
                      </th>
                      <th className="text-center px-4 py-2 font-medium">
                        RSI
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingStocks
                      ? Array.from({ length: 10 }).map((_, i) => (
                          <tr key={i} className="border-b border-[#2a2d3a]/50">
                            <td colSpan={6} className="py-3 px-4">
                              <div className="h-5 rounded skeleton" />
                            </td>
                          </tr>
                        ))
                      : stocks.map((stock) => {
                          const signal = signalMap.get(stock.stock);
                          return (
                            <tr
                              key={stock.stock}
                              className="border-b border-[#2a2d3a]/50 hover:bg-[#2a2d3a]/30 transition-colors cursor-pointer"
                            >
                              <td className="px-4 py-2.5">
                                <Link
                                  href={`/stock/${stock.stock.toLowerCase()}`}
                                  className="flex items-center gap-2"
                                >
                                  <span className="font-data font-semibold text-[#e1e4ea]">
                                    {stock.stock}
                                  </span>
                                  <span className="text-xs text-[#8b8fa3] truncate max-w-[120px]">
                                    {stock.name}
                                  </span>
                                </Link>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="font-data text-[#e1e4ea]">
                                  {parseFloat(stock.price).toFixed(2)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="font-data text-[#8b8fa3]">
                                  {formatNumber(stock.investors)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="font-data text-[#8b8fa3]">
                                  {formatBigNumber(stock.total_shares)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <SignalBadge
                                  signal={signal?.signal ?? "HOLD"}
                                />
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span
                                  className={cn(
                                    "font-data text-xs",
                                    !signal || isNaN(signal.rsi)
                                      ? "text-[#8b8fa3]"
                                      : signal.rsi < 30
                                        ? "text-[#22c55e]"
                                        : signal.rsi > 70
                                          ? "text-[#ef4444]"
                                          : "text-[#8b8fa3]"
                                  )}
                                >
                                  {signal && !isNaN(signal.rsi)
                                    ? signal.rsi.toFixed(1)
                                    : "-"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Sub Components ──────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
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

function SignalBadge({ signal }: { signal: "BUY" | "SELL" | "HOLD" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        signal === "BUY" &&
          "bg-[#22c55e]/15 text-[#22c55e]",
        signal === "SELL" &&
          "bg-[#ef4444]/15 text-[#ef4444]",
        signal === "HOLD" &&
          "bg-[#8b8fa3]/15 text-[#8b8fa3]"
      )}
    >
      {signal === "BUY" && <ArrowUpRight className="h-3 w-3" />}
      {signal === "SELL" && <ArrowDownRight className="h-3 w-3" />}
      {signal === "HOLD" && <Activity className="h-3 w-3" />}
      {signal === "BUY" ? "买入" : signal === "SELL" ? "卖出" : "观望"}
    </span>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatBigNumber(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}
