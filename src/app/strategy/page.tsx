"use client";

import { useEffect, useState, useCallback } from "react";
import type { StrategySignal, StrategyConfig } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG } from "@/types/stock";
import { AppShell } from "@/components/app-shell";
import {
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function StrategyPage() {
  const [signals, setSignals] = useState<StrategySignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [showConfig, setShowConfig] = useState(false);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/analysis?config=${encodeURIComponent(JSON.stringify(config))}`
      );
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals);
      }
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const buySignals = signals.filter((s) => s.signal === "BUY");
  const sellSignals = signals.filter((s) => s.signal === "SELL");
  const holdSignals = signals.filter((s) => s.signal === "HOLD");

  return (
    <AppShell>
      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e1e4ea]">
              策略信号
            </h1>
            <p className="text-sm text-[#8b8fa3] mt-1">
              多因子量化策略 - RSI + MACD + 布林带
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
                showConfig
                  ? "bg-[#3b82f6]/20 text-[#3b82f6]"
                  : "bg-[#2a2d3a] text-[#8b8fa3] hover:text-[#e1e4ea]"
              )}
            >
              <Settings2 className="h-4 w-4" />
              参数配置
            </button>
            <button
              onClick={() => {
                setLoading(true);
                fetchSignals();
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#2a2d3a] hover:bg-[#3b82f6]/20 text-[#8b8fa3] hover:text-[#3b82f6] transition-all text-sm"
            >
              <RefreshCw
                className={cn("h-4 w-4", loading && "animate-spin")}
              />
              刷新
            </button>
          </div>
        </div>

        {/* Config Panel */}
        {showConfig && (
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4 mb-6">
            <h3 className="text-sm font-semibold text-[#e1e4ea] mb-4">
              策略参数
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <ParamInput
                label="RSI 周期"
                value={config.rsiPeriod}
                onChange={(v) => setConfig({ ...config, rsiPeriod: v })}
              />
              <ParamInput
                label="RSI 超买"
                value={config.rsiOverbought}
                onChange={(v) => setConfig({ ...config, rsiOverbought: v })}
              />
              <ParamInput
                label="RSI 超卖"
                value={config.rsiOversold}
                onChange={(v) => setConfig({ ...config, rsiOversold: v })}
              />
              <ParamInput
                label="MACD 快线"
                value={config.macdFast}
                onChange={(v) => setConfig({ ...config, macdFast: v })}
              />
              <ParamInput
                label="MACD 慢线"
                value={config.macdSlow}
                onChange={(v) => setConfig({ ...config, macdSlow: v })}
              />
              <ParamInput
                label="MACD 信号线"
                value={config.macdSignal}
                onChange={(v) => setConfig({ ...config, macdSignal: v })}
              />
              <ParamInput
                label="布林带周期"
                value={config.bollingerPeriod}
                onChange={(v) =>
                  setConfig({ ...config, bollingerPeriod: v })
                }
              />
              <ParamInput
                label="布林带标准差"
                value={config.bollingerStdDev}
                onChange={(v) =>
                  setConfig({ ...config, bollingerStdDev: v })
                }
                step={0.5}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfig(DEFAULT_STRATEGY_CONFIG)}
                className="px-3 py-1.5 rounded-lg bg-[#2a2d3a] text-[#8b8fa3] hover:text-[#e1e4ea] text-sm transition-colors"
              >
                重置默认
              </button>
              <button
                onClick={() => fetchSignals()}
                className="px-3 py-1.5 rounded-lg bg-[#3b82f6] text-white text-sm hover:bg-[#3b82f6]/80 transition-colors"
              >
                应用参数
              </button>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="h-4 w-4 text-[#22c55e]" />
              <span className="text-xs text-[#8b8fa3]">买入信号</span>
            </div>
            <span className="font-data text-3xl font-bold text-[#22c55e]">
              {buySignals.length}
            </span>
          </div>
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight className="h-4 w-4 text-[#ef4444]" />
              <span className="text-xs text-[#8b8fa3]">卖出信号</span>
            </div>
            <span className="font-data text-3xl font-bold text-[#ef4444]">
              {sellSignals.length}
            </span>
          </div>
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-[#8b8fa3]" />
              <span className="text-xs text-[#8b8fa3]">观望</span>
            </div>
            <span className="font-data text-3xl font-bold text-[#8b8fa3]">
              {holdSignals.length}
            </span>
          </div>
        </div>

        {/* Signal Table */}
        <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a]">
          <div className="px-4 py-3 border-b border-[#2a2d3a]">
            <h3 className="text-sm font-semibold text-[#e1e4ea]">
              全市场信号
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2d3a] text-[#8b8fa3]">
                  <th className="text-left px-4 py-2 font-medium">标的</th>
                  <th className="text-right px-4 py-2 font-medium">价格</th>
                  <th className="text-center px-4 py-2 font-medium">信号</th>
                  <th className="text-center px-4 py-2 font-medium">强度</th>
                  <th className="text-center px-4 py-2 font-medium">RSI</th>
                  <th className="text-center px-4 py-2 font-medium">
                    RSI 信号
                  </th>
                  <th className="text-center px-4 py-2 font-medium">
                    MACD 信号
                  </th>
                  <th className="text-center px-4 py-2 font-medium">
                    布林信号
                  </th>
                  <th className="text-center px-4 py-2 font-medium">评分</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <tr
                        key={i}
                        className="border-b border-[#2a2d3a]/50"
                      >
                        <td colSpan={9} className="py-3 px-4">
                          <div className="h-5 rounded skeleton" />
                        </td>
                      </tr>
                    ))
                  : signals.map((s) => (
                      <tr
                        key={s.symbol}
                        className="border-b border-[#2a2d3a]/50 hover:bg-[#2a2d3a]/30 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <a
                            href={`/stock/${s.symbol.toLowerCase()}`}
                            className="font-data font-semibold text-[#e1e4ea] hover:text-[#3b82f6] transition-colors"
                          >
                            {s.symbol}
                          </a>
                          <span className="text-xs text-[#8b8fa3] ml-2">
                            {s.name}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-data text-[#e1e4ea]">
                          {s.price.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <SignalBadge signal={s.signal} />
                        </td>
                        <td className="px-4 py-2.5 text-center font-data">
                          <StrengthBar strength={s.strength} signal={s.signal} />
                        </td>
                        <td className="px-4 py-2.5 text-center font-data">
                          <span
                            className={cn(
                              isNaN(s.rsi)
                                ? "text-[#8b8fa3]"
                                : s.rsi < 30
                                  ? "text-[#22c55e]"
                                  : s.rsi > 70
                                    ? "text-[#ef4444]"
                                    : "text-[#e1e4ea]"
                            )}
                          >
                            {isNaN(s.rsi) ? "-" : s.rsi.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <MiniSignal signal={s.rsiSignal} />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <MiniSignal signal={s.macdSignal} />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <MiniSignal signal={s.bollingerSignal} />
                        </td>
                        <td className="px-4 py-2.5 text-center font-data">
                          <span
                            className={cn(
                              s.combinedScore > 0
                                ? "text-[#22c55e]"
                                : s.combinedScore < 0
                                  ? "text-[#ef4444]"
                                  : "text-[#8b8fa3]"
                            )}
                          >
                            {s.combinedScore > 0 ? "+" : ""}
                            {s.combinedScore.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Strategy Description */}
        <div className="mt-6 bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
          <h3 className="text-sm font-semibold text-[#e1e4ea] mb-3">
            策略说明
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm text-[#8b8fa3]">
            <div>
              <h4 className="text-[#e1e4ea] font-medium mb-1">
                RSI 相对强弱指标
              </h4>
              <p>
                衡量价格变动的速度和幅度。RSI &lt;{" "}
                {config.rsiOversold} 为超卖（买入信号），RSI &gt;{" "}
                {config.rsiOverbought} 为超买（卖出信号）。权重：40%
              </p>
            </div>
            <div>
              <h4 className="text-[#e1e4ea] font-medium mb-1">
                MACD 移动平均收敛散度
              </h4>
              <p>
                快线（{config.macdFast}）与慢线（{config.macdSlow}）的差值。金叉为买入信号，死叉为卖出信号。权重：35%
              </p>
            </div>
            <div>
              <h4 className="text-[#e1e4ea] font-medium mb-1">
                布林带
              </h4>
              <p>
                {config.bollingerPeriod}日均线 ±{" "}
                {config.bollingerStdDev}倍标准差。价格触及下轨为买入信号，触及上轨为卖出信号。权重：25%
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#2a2d3a] text-xs text-[#8b8fa3]">
            综合评分 = RSI×0.4 + MACD×0.35 + BB×0.25（买入=+1, 卖出=-1, 观望=0）。
            评分 &gt; 0.2 为买入信号，&lt; -0.2 为卖出信号。卖出手续费 0.1%。
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ParamInput({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <label className="text-xs text-[#8b8fa3] mb-1 block">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none transition-colors"
      />
    </div>
  );
}

function SignalBadge({ signal }: { signal: "BUY" | "SELL" | "HOLD" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        signal === "BUY" && "bg-[#22c55e]/15 text-[#22c55e]",
        signal === "SELL" && "bg-[#ef4444]/15 text-[#ef4444]",
        signal === "HOLD" && "bg-[#8b8fa3]/15 text-[#8b8fa3]"
      )}
    >
      {signal === "BUY" && <ArrowUpRight className="h-3 w-3" />}
      {signal === "SELL" && <ArrowDownRight className="h-3 w-3" />}
      {signal === "HOLD" && <Activity className="h-3 w-3" />}
      {signal === "BUY" ? "买入" : signal === "SELL" ? "卖出" : "观望"}
    </span>
  );
}

function MiniSignal({ signal }: { signal: "BUY" | "SELL" | "HOLD" }) {
  return (
    <span
      className={cn(
        "text-xs font-medium",
        signal === "BUY" && "text-[#22c55e]",
        signal === "SELL" && "text-[#ef4444]",
        signal === "HOLD" && "text-[#8b8fa3]"
      )}
    >
      {signal === "BUY" ? "买入" : signal === "SELL" ? "卖出" : "观望"}
    </span>
  );
}

function StrengthBar({
  strength,
  signal,
}: {
  strength: number;
  signal: "BUY" | "SELL" | "HOLD";
}) {
  if (strength === 0) {
    return <span className="text-[#8b8fa3]">-</span>;
  }
  return (
    <div className="flex items-center gap-2 justify-center">
      <div className="w-16 h-1.5 bg-[#2a2d3a] rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            signal === "BUY" ? "bg-[#22c55e]" : "bg-[#ef4444]"
          )}
          style={{ width: `${Math.min(100, strength)}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs",
          signal === "BUY" ? "text-[#22c55e]" : "text-[#ef4444]"
        )}
      >
        {strength}%
      </span>
    </div>
  );
}
