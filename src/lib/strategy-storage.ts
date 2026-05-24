import type { StrategyConfig } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG } from "@/types/stock";
import { resetLivePortfolio } from "@/lib/live-portfolio";

export const STRATEGY_STORAGE_KEY = "tsq-active-strategy";
export const STRATEGY_APPLIED_EVENT = "tsq-strategy-applied";
export const ALERT_CONFIG_STORAGE_KEY = "tsq-alert-config";

export interface AppliedStrategyMeta {
  config: StrategyConfig;
  appliedAt: number;
  source: "backtest" | "strategy";
  capital?: number;
}

export interface AlertConfigStorage {
  checkInterval: string;
  emailHost: string;
  emailPort: string;
  emailSecure: string;
  emailUser: string;
  emailPass: string;
  recipientEmail: string;
  notifyBuy: boolean;
  notifySell: boolean;
}

export const DEFAULT_ALERT_CONFIG: AlertConfigStorage = {
  checkInterval: "300",
  emailHost: "",
  emailPort: "587",
  emailSecure: "false",
  emailUser: "",
  emailPass: "",
  recipientEmail: "",
  notifyBuy: true,
  notifySell: true,
};

export interface AlertConfigExport extends AlertConfigStorage {
  version: 1;
  exportedAt: string;
}

export function normalizeAlertConfig(
  input: Partial<AlertConfigStorage> | null | undefined
): AlertConfigStorage {
  if (!input) return { ...DEFAULT_ALERT_CONFIG };
  return {
    checkInterval: input.checkInterval ?? DEFAULT_ALERT_CONFIG.checkInterval,
    emailHost: input.emailHost ?? DEFAULT_ALERT_CONFIG.emailHost,
    emailPort: input.emailPort ?? DEFAULT_ALERT_CONFIG.emailPort,
    emailSecure: input.emailSecure ?? DEFAULT_ALERT_CONFIG.emailSecure,
    emailUser: input.emailUser ?? DEFAULT_ALERT_CONFIG.emailUser,
    emailPass: input.emailPass ?? DEFAULT_ALERT_CONFIG.emailPass,
    recipientEmail: input.recipientEmail ?? DEFAULT_ALERT_CONFIG.recipientEmail,
    notifyBuy: input.notifyBuy ?? DEFAULT_ALERT_CONFIG.notifyBuy,
    notifySell: input.notifySell ?? DEFAULT_ALERT_CONFIG.notifySell,
  };
}

export function loadAppliedStrategy(): AppliedStrategyMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STRATEGY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppliedStrategyMeta;
    if (!parsed?.config) return null;
    return {
      ...parsed,
      config: { ...DEFAULT_STRATEGY_CONFIG, ...parsed.config },
    };
  } catch {
    return null;
  }
}

export function saveAppliedStrategy(
  config: StrategyConfig,
  source: AppliedStrategyMeta["source"] = "backtest",
  capital: number = 100000
): AppliedStrategyMeta {
  const appliedAt = Date.now();
  const meta: AppliedStrategyMeta = {
    config,
    appliedAt,
    source,
    capital,
  };
  localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(meta));
  resetLivePortfolio(capital, appliedAt);
  window.dispatchEvent(new CustomEvent(STRATEGY_APPLIED_EVENT, { detail: meta }));
  return meta;
}

export function getActiveStrategyConfig(): StrategyConfig {
  return loadAppliedStrategy()?.config ?? DEFAULT_STRATEGY_CONFIG;
}

export function loadAlertConfig(): AlertConfigStorage | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ALERT_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return normalizeAlertConfig(JSON.parse(raw) as Partial<AlertConfigStorage>);
  } catch {
    return null;
  }
}

export function saveAlertConfig(config: AlertConfigStorage): void {
  localStorage.setItem(
    ALERT_CONFIG_STORAGE_KEY,
    JSON.stringify(normalizeAlertConfig(config))
  );
}

export function exportAlertConfigFile(config: AlertConfigStorage): void {
  const payload: AlertConfigExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    ...normalizeAlertConfig(config),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tsq-alert-config.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseImportedAlertConfig(raw: unknown): AlertConfigStorage {
  if (!raw || typeof raw !== "object") {
    throw new Error("配置文件格式错误");
  }
  const obj = raw as Record<string, unknown>;
  const hasEmailField =
    "emailHost" in obj ||
    "recipientEmail" in obj ||
    "emailUser" in obj;
  if (!hasEmailField) {
    throw new Error("不是有效的邮件提醒配置文件");
  }
  return normalizeAlertConfig(obj as Partial<AlertConfigStorage>);
}

export function importAlertConfigFromFile(): Promise<AlertConfigStorage> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("未选择文件"));
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string) as unknown;
          const config = parseImportedAlertConfig(parsed);
          saveAlertConfig(config);
          resolve(config);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("配置文件解析失败"));
        }
      };
      reader.onerror = () => reject(new Error("读取文件失败"));
      reader.readAsText(file);
    };
    input.click();
  });
}
