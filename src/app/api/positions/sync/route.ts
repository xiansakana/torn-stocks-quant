import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_STRATEGY_CONFIG } from "@/types/stock";
import type { LivePortfolioState, StrategyConfig } from "@/types/stock";
import { fetchAllSignals } from "@/lib/signals";
import { syncLivePortfolio, toCurrentPortfolioState } from "@/lib/live-trading";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      portfolio,
      config: configOverride,
    } = body as {
      portfolio?: LivePortfolioState;
      config?: Partial<StrategyConfig>;
    };

    if (!portfolio) {
      return NextResponse.json({ error: "缺少持仓状态" }, { status: 400 });
    }

    const config: StrategyConfig = {
      ...DEFAULT_STRATEGY_CONFIG,
      ...configOverride,
    };

    const signals = await fetchAllSignals(config);
    const updated = syncLivePortfolio(portfolio, signals, config);
    const display = toCurrentPortfolioState(updated, signals);

    return NextResponse.json({
      portfolio: updated,
      display,
      signalsSynced: updated.signalsSeeded,
      timestamp: Date.now(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
