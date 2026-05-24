import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_STRATEGY_CONFIG } from "@/types/stock";
import type { StrategyConfig } from "@/types/stock";
import { fetchAllSignals } from "@/lib/signals";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const configParam = searchParams.get("config");
    const config: StrategyConfig = configParam
      ? { ...DEFAULT_STRATEGY_CONFIG, ...JSON.parse(configParam) }
      : DEFAULT_STRATEGY_CONFIG;

    const signals = await fetchAllSignals(config);

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
