import type {
  BacktestHistoryRecord,
  BacktestHistoryParams,
  BacktestResult,
  Interval,
} from "@/types/stock";
import { INTERVAL_LABELS } from "@/types/stock";

export const BACKTEST_HISTORY_KEY = "tsq-backtest-history";
export const BACKTEST_HISTORY_MAX = 20;
export const BACKTEST_HISTORY_EVENT = "tsq-backtest-history-updated";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildBacktestLabel(params: BacktestHistoryParams): string {
  const modeLabel = params.mode === "portfolio" ? "组合" : params.symbol ?? "单股";
  const range =
    params.startDate || params.endDate
      ? ` ${params.startDate ?? "…"}~${params.endDate ?? "…"}`
      : "";
  return `${modeLabel} · ${INTERVAL_LABELS[params.interval as Interval] ?? params.interval}${range}`;
}

export function loadBacktestHistory(): BacktestHistoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BACKTEST_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BacktestHistoryRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBacktestHistory(records: BacktestHistoryRecord[]): void {
  localStorage.setItem(
    BACKTEST_HISTORY_KEY,
    JSON.stringify(records.slice(0, BACKTEST_HISTORY_MAX))
  );
  window.dispatchEvent(new CustomEvent(BACKTEST_HISTORY_EVENT));
}

export function addBacktestHistoryRecord(
  params: BacktestHistoryParams,
  result: BacktestResult
): BacktestHistoryRecord {
  const record: BacktestHistoryRecord = {
    id: generateId(),
    ranAt: Date.now(),
    label: buildBacktestLabel(params),
    params,
    result: {
      ...result,
      initialCapital: result.initialCapital ?? params.capital,
    },
  };
  const next = [record, ...loadBacktestHistory()].slice(0, BACKTEST_HISTORY_MAX);
  saveBacktestHistory(next);
  return record;
}

export function getBacktestHistoryRecord(id: string): BacktestHistoryRecord | null {
  return loadBacktestHistory().find((r) => r.id === id) ?? null;
}

export function deleteBacktestHistoryRecord(id: string): void {
  saveBacktestHistory(loadBacktestHistory().filter((r) => r.id !== id));
}

export function clearBacktestHistory(): void {
  localStorage.removeItem(BACKTEST_HISTORY_KEY);
  window.dispatchEvent(new CustomEvent(BACKTEST_HISTORY_EVENT));
}

export function getLatestBacktestCapital(defaultCapital = 100000): number {
  const latest = loadBacktestHistory()[0];
  return latest?.params.capital ?? defaultCapital;
}
