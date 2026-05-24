import type { LivePortfolioState } from "@/types/stock";
import { createEmptyLivePortfolio } from "@/lib/live-trading";

export const LIVE_PORTFOLIO_KEY = "tsq-live-portfolio";
export const LIVE_PORTFOLIO_EVENT = "tsq-live-portfolio-updated";

export function loadLivePortfolio(): LivePortfolioState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LIVE_PORTFOLIO_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LivePortfolioState;
  } catch {
    return null;
  }
}

export function saveLivePortfolio(state: LivePortfolioState): void {
  localStorage.setItem(LIVE_PORTFOLIO_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(LIVE_PORTFOLIO_EVENT, { detail: state }));
}

export function resetLivePortfolio(
  initialCapital: number,
  appliedAt: number = Date.now()
): LivePortfolioState {
  const state = createEmptyLivePortfolio(initialCapital, appliedAt);
  saveLivePortfolio(state);
  return state;
}

export function clearLivePortfolio(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LIVE_PORTFOLIO_KEY);
  window.dispatchEvent(new CustomEvent(LIVE_PORTFOLIO_EVENT, { detail: null }));
}
