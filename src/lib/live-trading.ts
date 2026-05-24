import type {
  StrategyConfig,
  StrategySignal,
  SignalType,
  PositionHolding,
  CurrentPortfolioState,
  LivePortfolioState,
  LivePosition,
} from "@/types/stock";

interface MutablePosition {
  symbol: string;
  entryPrice: number;
  entryDate: number;
  shares: number;
  cost: number;
  peakPrice: number;
}

function positionAlloc(
  config: StrategyConfig,
  initialCapital: number,
  cash: number,
  score: number
): number {
  let size = config.positionSize;
  if (config.scaleByScore && score > config.minBuyScore) {
    const strength = Math.min(
      1,
      (score - config.minBuyScore) / (1 - config.minBuyScore + 0.01)
    );
    size *= 0.7 + strength * 0.3;
  }
  return Math.min(initialCapital * size, cash * 0.95);
}

function shouldExit(
  config: StrategyConfig,
  pos: MutablePosition,
  price: number,
  signal: SignalType
): boolean {
  if (price > pos.peakPrice) pos.peakPrice = price;
  const pnlPct = (price - pos.entryPrice) / pos.entryPrice;
  const drawdownFromPeak =
    pos.peakPrice > 0 ? (pos.peakPrice - price) / pos.peakPrice : 0;
  const signalExit = config.exitOnSellSignal && signal === "SELL";
  return (
    signalExit ||
    pnlPct <= -config.stopLoss ||
    pnlPct >= config.takeProfit ||
    (config.trailingStop > 0 && drawdownFromPeak >= config.trailingStop)
  );
}

function closePosition(
  pos: MutablePosition,
  exitPrice: number,
  sellFee: number
): number {
  const grossProceeds = pos.shares * exitPrice;
  const fee = grossProceeds * sellFee;
  return grossProceeds - fee;
}

export function toPositionHoldings(
  positions: LivePosition[],
  signalMap: Map<string, StrategySignal>
): PositionHolding[] {
  return positions
    .map((pos) => {
      const price = signalMap.get(pos.symbol)?.price ?? pos.entryPrice;
      const marketValue = pos.shares * price;
      const unrealizedPnl = marketValue - pos.cost;
      return {
        symbol: pos.symbol,
        shares: pos.shares,
        price,
        marketValue,
        cost: pos.cost,
        unrealizedPnl,
        unrealizedPnlPercent: pos.cost > 0 ? unrealizedPnl / pos.cost : 0,
      };
    })
    .sort((a, b) => b.marketValue - a.marketValue);
}

export function toCurrentPortfolioState(
  state: LivePortfolioState,
  signals: StrategySignal[]
): CurrentPortfolioState {
  const signalMap = new Map(signals.map((s) => [s.symbol, s]));
  const holdings = toPositionHoldings(state.positions, signalMap);
  const holdingsValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const timestamp = state.lastSyncedAt ?? state.appliedAt;

  return {
    timestamp,
    cash: state.cash,
    holdings,
    holdingsValue,
    totalEquity: state.cash + holdingsValue,
    initialCapital: state.initialCapital,
    mode: "portfolio",
  };
}

/** Process one sync tick: seed signals on first run, then trade on triggers. */
export function syncLivePortfolio(
  state: LivePortfolioState,
  signals: StrategySignal[],
  config: StrategyConfig
): LivePortfolioState {
  const now = Date.now();
  const signalMap = new Map(signals.map((s) => [s.symbol, s]));
  const lastSignals = { ...state.lastSignals };

  if (!state.signalsSeeded) {
    for (const s of signals) {
      lastSignals[s.symbol] = s.signal;
    }
    return {
      ...state,
      lastSignals,
      signalsSeeded: true,
      lastSyncedAt: now,
    };
  }

  let cash = state.cash;
  const positions = state.positions.map((p) => ({ ...p }));

  for (let i = positions.length - 1; i >= 0; i--) {
    const pos = positions[i];
    const sig = signalMap.get(pos.symbol);
    const price = sig?.price ?? pos.entryPrice;
    const signal = sig?.signal ?? "HOLD";
    if (shouldExit(config, pos, price, signal)) {
      cash += closePosition(pos, price, config.sellFee);
      positions.splice(i, 1);
    }
  }

  const heldSymbols = new Set(positions.map((p) => p.symbol));
  const slots = config.maxPositions - positions.length;

  if (slots > 0) {
    const buyCandidates = signals
      .filter((s) => {
        const prev = state.lastSignals[s.symbol] ?? "HOLD";
        return (
          prev !== "BUY" &&
          s.signal === "BUY" &&
          s.combinedScore >= config.minBuyScore &&
          !heldSymbols.has(s.symbol)
        );
      })
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, slots);

    for (const s of buyCandidates) {
      const alloc = positionAlloc(
        config,
        state.initialCapital,
        cash,
        s.combinedScore
      );
      const shares = Math.floor(alloc / s.price);
      if (shares <= 0) continue;
      const cost = shares * s.price;
      positions.push({
        symbol: s.symbol,
        entryPrice: s.price,
        entryDate: now,
        shares,
        cost,
        peakPrice: s.price,
      });
      cash -= cost;
      heldSymbols.add(s.symbol);
    }
  }

  for (const s of signals) {
    lastSignals[s.symbol] = s.signal;
  }

  return {
    ...state,
    cash,
    positions,
    lastSignals,
    lastSyncedAt: now,
  };
}

export function createEmptyLivePortfolio(
  initialCapital: number,
  appliedAt: number = Date.now()
): LivePortfolioState {
  return {
    cash: initialCapital,
    initialCapital,
    positions: [],
    lastSignals: {},
    signalsSeeded: false,
    appliedAt,
    lastSyncedAt: null,
  };
}
