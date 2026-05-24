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
  loadAppliedStrategy,
  STRATEGY_APPLIED_EVENT,
} from "@/lib/strategy-storage";
import {
  loadLivePortfolio,
  saveLivePortfolio,
} from "@/lib/live-portfolio";
import { toCurrentPortfolioState } from "@/lib/live-trading";
import { Briefcase, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, formatMoneyCompact } from "@/lib/format-money";

export default function PositionsPage() {
  const [portfolio, setPortfolio] = useState<CurrentPortfolioState | null>(null);
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [capital, setCapital] = useState(100000);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAppliedStrategy, setHasAppliedStrategy] = useState(false);
  const [appliedAt, setAppliedAt] = useState<number | null>(null);

  const displayFromStorage = useCallback(() => {
    const applied = loadAppliedStrategy();
    const live = loadLivePortfolio();
    if (!applied || !live) {
      setHasAppliedStrategy(false);
      setPortfolio(null);
      return;
    }
    setHasAppliedStrategy(true);
    setConfig(applied.config);
    setCapital(applied.capital ?? live.initialCapital);
    setAppliedAt(applied.appliedAt);
    setPortfolio(
      toCurrentPortfolioState(live, [])
    );
  }, []);

  const syncPositions = useCallback(async () => {
    const applied = loadAppliedStrategy();
    const live = loadLivePortfolio();
    if (!applied || !live) {
      displayFromStorage();
      setLoading(false);
      return;
    }

    setSyncing(true);
    setError(null);
    setConfig(applied.config);
    setCapital(applied.capital ?? live.initialCapital);
    setHasAppliedStrategy(true);
    setAppliedAt(applied.appliedAt);

    try {
      const res = await fetch("/api/positions/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolio: live,
          config: applied.config,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "同步失败");
        displayFromStorage();
        return;
      }
      saveLivePortfolio(data.portfolio);
      setPortfolio(data.display as CurrentPortfolioState);
    } catch {
      setError("同步请求失败");
      displayFromStorage();
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, [displayFromStorage]);

  useEffect(() => {
    syncPositions();
  }, [syncPositions]);

  useEffect(() => {
    const onStrategyApplied = () => syncPositions();
    window.addEventListener(STRATEGY_APPLIED_EVENT, onStrategyApplied);
    return () => {
      window.removeEventListener(STRATEGY_APPLIED_EVENT, onStrategyApplied);
    };
  }, [syncPositions]);

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
              应用策略后从空仓起步，打开页面自动同步一次信号
            </p>
          </div>
          <button
            onClick={syncPositions}
            disabled={syncing || !hasAppliedStrategy}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#2a2d3a] hover:bg-[#3b82f6]/20 text-[#8b8fa3] hover:text-[#3b82f6] transition-all text-sm disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            同步信号
          </button>
        </div>

        {!hasAppliedStrategy ? (
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-16 text-center">
            <Briefcase className="h-12 w-12 text-[#8b8fa3] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#e1e4ea] mb-2">
              请先应用策略
            </h3>
            <p className="text-sm text-[#8b8fa3]">
              在回测页或策略页点击「应用策略」后，此处将从空仓开始跟踪持仓
            </p>
          </div>
        ) : (
          <>
            <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4 mb-6 text-xs text-[#8b8fa3]">
              初始资金 {formatMoneyCompact(capital)} · 最大持仓 {config.maxPositions}{" "}
              · 单仓 {Math.round(config.positionSize * 100)}%
              {appliedAt && (
                <span className="ml-2">
                  · 策略应用于{" "}
                  {new Date(appliedAt).toLocaleString("zh-CN")}
                </span>
              )}
            </div>

            {error && (
              <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg p-4 mb-6 text-[#ef4444] text-sm">
                {error}
              </div>
            )}

            {loading && !portfolio ? (
              <div className="flex items-center justify-center py-24 text-[#8b8fa3]">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                同步信号…
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
                    <h3 className="text-sm font-semibold text-[#e1e4ea]">
                      持仓明细
                    </h3>
                    <span className="text-xs text-[#8b8fa3]">
                      现金 {formatMoney(portfolio.cash)} + 持仓{" "}
                      {formatMoney(portfolio.holdingsValue)} = 总权益{" "}
                      {formatMoney(portfolio.totalEquity)}
                    </span>
                  </div>
                  <div className="p-4">
                    {portfolio.holdings.length === 0 ? (
                      <p className="text-sm text-[#8b8fa3] py-4 text-center">
                        当前空仓，等待买入信号触发。页面打开时会自动同步，也可手动点击「同步信号」。
                      </p>
                    ) : (
                      <HoldingsDetailTable holdings={portfolio.holdings} />
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
