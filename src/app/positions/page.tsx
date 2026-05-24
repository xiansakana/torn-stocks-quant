"use client";

import { useCallback, useEffect, useState } from "react";
import type { CurrentPortfolioState, StrategyConfig } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG } from "@/types/stock";
import { AppShell } from "@/components/app-shell";
import {
  HoldingsDetailTable,
  PortfolioSummaryCards,
} from "@/components/position-tables";
import {
  getActiveStrategyConfig,
  STRATEGY_APPLIED_EVENT,
} from "@/lib/strategy-storage";
import { getLatestBacktestCapital } from "@/lib/backtest-history";
import { Briefcase, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PositionsPage() {
  const [portfolio, setPortfolio] = useState<CurrentPortfolioState | null>(null);
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [capital, setCapital] = useState(100000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    setError(null);
    const activeConfig = getActiveStrategyConfig();
    const activeCapital = getLatestBacktestCapital(100000);
    setConfig(activeConfig);
    setCapital(activeCapital);

    try {
      const res = await fetch("/api/positions/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capital: activeCapital,
          config: activeConfig,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "加载失败");
        return;
      }
      setPortfolio(data as CurrentPortfolioState);
    } catch {
      setError("请求失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    const onStrategyApplied = () => fetchPositions();
    window.addEventListener(STRATEGY_APPLIED_EVENT, onStrategyApplied);
    return () =>
      window.removeEventListener(STRATEGY_APPLIED_EVENT, onStrategyApplied);
  }, [fetchPositions]);

  return (
    <AppShell>
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e1e4ea] flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-[#3b82f6]" />
              当前持仓
            </h1>
            <p className="text-sm text-[#8b8fa3] mt-1">
              基于已应用策略与最新行情模拟的持仓明细（含现金）
            </p>
          </div>
          <button
            onClick={fetchPositions}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#2a2d3a] hover:bg-[#3b82f6]/20 text-[#8b8fa3] hover:text-[#3b82f6] transition-all text-sm"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新
          </button>
        </div>

        <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4 mb-6 text-xs text-[#8b8fa3]">
          初始资金 {capital.toLocaleString()} · 最大持仓 {config.maxPositions} ·
          单仓 {Math.round(config.positionSize * 100)}%
        </div>

        {error && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg p-4 mb-6 text-[#ef4444] text-sm">
            {error}
          </div>
        )}

        {loading && !portfolio ? (
          <div className="flex items-center justify-center py-24 text-[#8b8fa3]">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            计算当前持仓…
          </div>
        ) : portfolio ? (
          <>
            <PortfolioSummaryCards
              cash={portfolio.cash}
              holdingsValue={portfolio.holdingsValue}
              totalEquity={portfolio.totalEquity}
              initialCapital={portfolio.initialCapital}
              holdingsCount={portfolio.holdings.length}
              asOf={portfolio.timestamp}
            />

            <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a]">
              <div className="px-4 py-3 border-b border-[#2a2d3a] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#e1e4ea]">持仓明细</h3>
                <span className="text-xs text-[#8b8fa3]">
                  现金 {portfolio.cash.toFixed(2)} + 持仓{" "}
                  {portfolio.holdingsValue.toFixed(2)} = 总权益{" "}
                  {portfolio.totalEquity.toFixed(2)}
                </span>
              </div>
              <div className="p-4">
                <HoldingsDetailTable holdings={portfolio.holdings} />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
