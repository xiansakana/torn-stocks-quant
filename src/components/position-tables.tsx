"use client";

import { Fragment, useState } from "react";
import type { BacktestResult, BacktestTrade, PositionSnapshot } from "@/types/stock";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

export function TradeRecordsTable({
  result,
  capital,
}: {
  result: BacktestResult;
  capital: number;
}) {
  let runningEquity = capital;
  const sortedTrades = [...result.trades].sort(
    (a, b) => a.exitDate - b.exitDate
  );

  return (
    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#1a1d29]">
          <tr className="border-b border-[#2a2d3a] text-[#8b8fa3]">
            <th className="text-left px-4 py-2 font-medium">#</th>
            {result.mode === "portfolio" && (
              <th className="text-left px-4 py-2 font-medium">标的</th>
            )}
            <th className="text-left px-4 py-2 font-medium">买入日期</th>
            <th className="text-left px-4 py-2 font-medium">卖出日期</th>
            <th className="text-right px-4 py-2 font-medium">买入价</th>
            <th className="text-right px-4 py-2 font-medium">卖出价</th>
            <th className="text-right px-4 py-2 font-medium">数量</th>
            <th className="text-right px-4 py-2 font-medium">手续费</th>
            <th className="text-right px-4 py-2 font-medium">盈亏</th>
            <th className="text-right px-4 py-2 font-medium">单笔收益率</th>
            <th className="text-right px-4 py-2 font-medium">累计收益率</th>
          </tr>
        </thead>
        <tbody>
          {sortedTrades.length === 0 ? (
            <tr>
              <td
                colSpan={result.mode === "portfolio" ? 11 : 10}
                className="px-4 py-8 text-center text-[#8b8fa3]"
              >
                暂无交易记录
              </td>
            </tr>
          ) : (
            sortedTrades.map((trade, i) => {
              runningEquity += trade.pnl;
              const cumulativeReturn = (runningEquity - capital) / capital;
              return (
                <TradeRow
                  key={`${trade.symbol}-${trade.exitDate}-${i}`}
                  index={i + 1}
                  trade={trade}
                  showSymbol={result.mode === "portfolio"}
                  cumulativeReturn={cumulativeReturn}
                />
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function TradeRow({
  index,
  trade,
  showSymbol,
  cumulativeReturn,
}: {
  index: number;
  trade: BacktestTrade;
  showSymbol: boolean;
  cumulativeReturn: number;
}) {
  return (
    <tr className="border-b border-[#2a2d3a]/50 hover:bg-[#2a2d3a]/30 transition-colors">
      <td className="px-4 py-2 text-[#8b8fa3]">{index}</td>
      {showSymbol && (
        <td className="px-4 py-2 font-data text-[#3b82f6]">{trade.symbol ?? "-"}</td>
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
          trade.pnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
        )}
      >
        {trade.pnl >= 0 ? "+" : ""}
        {trade.pnl.toFixed(2)}
      </td>
      <td
        className={cn(
          "px-4 py-2 text-right font-data",
          trade.pnlPercent >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
        )}
      >
        {trade.pnlPercent >= 0 ? "+" : ""}
        {(trade.pnlPercent * 100).toFixed(2)}%
      </td>
      <td
        className={cn(
          "px-4 py-2 text-right font-data font-medium",
          cumulativeReturn >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
        )}
      >
        {cumulativeReturn >= 0 ? "+" : ""}
        {(cumulativeReturn * 100).toFixed(2)}%
      </td>
    </tr>
  );
}

export function PositionHistoryTable({
  snapshots,
}: {
  snapshots: PositionSnapshot[];
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const sorted = [...snapshots].sort((a, b) => b.timestamp - a.timestamp);

  if (sorted.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[#8b8fa3]">
        暂无历史持仓记录
      </div>
    );
  }

  return (
    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#1a1d29]">
          <tr className="border-b border-[#2a2d3a] text-[#8b8fa3]">
            <th className="w-8 px-2 py-2" />
            <th className="text-left px-4 py-2 font-medium">日期</th>
            <th className="text-right px-4 py-2 font-medium">现金</th>
            <th className="text-right px-4 py-2 font-medium">持仓数</th>
            <th className="text-right px-4 py-2 font-medium">持仓市值</th>
            <th className="text-right px-4 py-2 font-medium">总权益</th>
            <th className="text-left px-4 py-2 font-medium">持仓摘要</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((snap, i) => {
            const isOpen = expanded === i;
            return (
              <Fragment key={snap.timestamp}>
                <tr
                  className="border-b border-[#2a2d3a]/50 hover:bg-[#2a2d3a]/30 transition-colors cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : i)}
                >
                  <td className="px-2 py-2 text-[#8b8fa3]">
                    {snap.holdings.length > 0 ? (
                      isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )
                    ) : null}
                  </td>
                  <td className="px-4 py-2 font-data text-[#e1e4ea]">
                    {new Date(snap.timestamp).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-4 py-2 text-right font-data text-[#f59e0b]">
                    {snap.cash.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right font-data text-[#e1e4ea]">
                    {snap.holdings.length}
                  </td>
                  <td className="px-4 py-2 text-right font-data text-[#3b82f6]">
                    {snap.holdingsValue.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right font-data font-medium text-[#e1e4ea]">
                    {snap.totalEquity.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-[#8b8fa3] text-xs">
                    {snap.holdings.length === 0
                      ? "空仓"
                      : snap.holdings
                          .map(
                            (h) =>
                              `${h.symbol} ${h.shares.toLocaleString()}@${h.price.toFixed(2)}`
                          )
                          .join(" · ")}
                  </td>
                </tr>
                {isOpen && snap.holdings.length > 0 && (
                  <tr className="bg-[#0f1117]/50">
                    <td colSpan={7} className="px-4 py-3">
                      <HoldingsDetailTable holdings={snap.holdings} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HoldingsDetailTable({
  holdings,
  showSymbol = true,
}: {
  holdings: PositionSnapshot["holdings"];
  showSymbol?: boolean;
}) {
  if (holdings.length === 0) {
    return (
      <div className="text-sm text-[#8b8fa3] py-2">当前无持仓，全部为现金</div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[#8b8fa3] border-b border-[#2a2d3a]">
          {showSymbol && (
            <th className="text-left py-2 font-medium">标的</th>
          )}
          <th className="text-right py-2 font-medium">数量</th>
          <th className="text-right py-2 font-medium">现价</th>
          <th className="text-right py-2 font-medium">成本</th>
          <th className="text-right py-2 font-medium">市值</th>
          <th className="text-right py-2 font-medium">浮动盈亏</th>
          <th className="text-right py-2 font-medium">收益率</th>
        </tr>
      </thead>
      <tbody>
        {holdings.map((h) => (
          <tr
            key={h.symbol ?? "holding"}
            className="border-b border-[#2a2d3a]/30"
          >
            {showSymbol && (
              <td className="py-2 font-data text-[#3b82f6]">{h.symbol}</td>
            )}
            <td className="py-2 text-right font-data text-[#e1e4ea]">
              {h.shares.toLocaleString()}
            </td>
            <td className="py-2 text-right font-data text-[#e1e4ea]">
              {h.price.toFixed(2)}
            </td>
            <td className="py-2 text-right font-data text-[#8b8fa3]">
              {h.cost.toFixed(2)}
            </td>
            <td className="py-2 text-right font-data text-[#e1e4ea]">
              {h.marketValue.toFixed(2)}
            </td>
            <td
              className={cn(
                "py-2 text-right font-data",
                h.unrealizedPnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
              )}
            >
              {h.unrealizedPnl >= 0 ? "+" : ""}
              {h.unrealizedPnl.toFixed(2)}
            </td>
            <td
              className={cn(
                "py-2 text-right font-data",
                h.unrealizedPnlPercent >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"
              )}
            >
              {h.unrealizedPnlPercent >= 0 ? "+" : ""}
              {(h.unrealizedPnlPercent * 100).toFixed(2)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PortfolioSummaryCards({
  cash,
  holdingsValue,
  totalEquity,
  initialCapital,
  holdingsCount,
  asOf,
}: {
  cash: number;
  holdingsValue: number;
  totalEquity: number;
  initialCapital: number;
  holdingsCount: number;
  asOf?: number;
}) {
  const totalReturn = (totalEquity - initialCapital) / initialCapital;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <SummaryCard label="现金" value={cash.toFixed(2)} accent="amber" />
      <SummaryCard
        label="持仓市值"
        value={holdingsValue.toFixed(2)}
        accent="blue"
      />
      <SummaryCard label="总权益" value={totalEquity.toFixed(2)} />
      <SummaryCard label="持仓数" value={String(holdingsCount)} />
      <SummaryCard
        label="总收益率"
        value={`${totalReturn >= 0 ? "+" : ""}${(totalReturn * 100).toFixed(2)}%`}
        positive={totalReturn >= 0}
        negative={totalReturn < 0}
        sub={
          asOf
            ? `截至 ${new Date(asOf).toLocaleDateString("zh-CN")}`
            : undefined
        }
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  positive,
  negative,
  sub,
}: {
  label: string;
  value: string;
  accent?: "amber" | "blue";
  positive?: boolean;
  negative?: boolean;
  sub?: string;
}) {
  return (
    <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
      <span className="text-xs text-[#8b8fa3]">{label}</span>
      <div
        className={cn(
          "font-data text-lg font-bold mt-1",
          accent === "amber" && "text-[#f59e0b]",
          accent === "blue" && "text-[#3b82f6]",
          positive && "text-[#22c55e]",
          negative && "text-[#ef4444]",
          !accent && !positive && !negative && "text-[#e1e4ea]"
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#8b8fa3] mt-1">{sub}</div>}
    </div>
  );
}
