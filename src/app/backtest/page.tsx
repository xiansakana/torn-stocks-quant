"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { StrategyConfig, BacktestResult, Interval, BacktestHistoryParams, BacktestHistoryRecord } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG, TRACKED_SYMBOLS, ALL_INTERVALS, INTERVAL_LABELS } from "@/types/stock";
import { AppShell } from "@/components/app-shell";
import { MoneyInput } from "@/components/money-input";
import {
  createChart,
  type IChartApi,
  ColorType,
  LineSeries,
  type LineData,
  type Time,
} from "lightweight-charts";
import {
  FlaskConical,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  BarChart3,
  Target,
  Check,
  Mail,
  Bell,
  BellOff,
  Download,
  Upload,
  History,
  Trash2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format-money";
import {
  TradeRecordsTable,
  PositionHistoryTable,
} from "@/components/position-tables";
import {
  addBacktestHistoryRecord,
  loadBacktestHistory,
  deleteBacktestHistoryRecord,
  clearBacktestHistory,
  BACKTEST_HISTORY_EVENT,
} from "@/lib/backtest-history";
import {
  buildBenchmarkReturnSeries,
  fetchTcseCandles,
} from "@/lib/benchmark";
import {
  loadAppliedStrategy,
  saveAppliedStrategy,
  loadAlertConfig,
  saveAlertConfig,
  exportAlertConfigFile,
  importAlertConfigFromFile,
  normalizeAlertConfig,
  DEFAULT_ALERT_CONFIG,
  type AppliedStrategyMeta,
  type AlertConfigStorage,
} from "@/lib/strategy-storage";

/** HTML date input allows very large years in some browsers; clamp to 4-digit range. */
const BACKTEST_DATE_MIN = "1970-01-01";
const BACKTEST_DATE_MAX = new Date().toISOString().slice(0, 10);

function sanitizeDateInput(
  value: string,
  min = BACKTEST_DATE_MIN,
  max = BACKTEST_DATE_MAX
): string {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const year = Number(value.slice(0, 4));
  if (year < 1000 || year > 9999) return "";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function handleDateChange(
  raw: string,
  min: string,
  max: string,
  setter: (v: string) => void
) {
  if (!raw) {
    setter("");
    return;
  }
  setter(sanitizeDateInput(raw, min, max));
}

export default function BacktestPage() {
  const [mode, setMode] = useState<"single" | "portfolio">("portfolio");
  const [symbol, setSymbol] = useState("TCI");
  const [klineInterval, setKlineInterval] = useState<Interval>("d1");
  const [capital, setCapital] = useState(100000);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedMeta, setAppliedMeta] = useState<AppliedStrategyMeta | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [historyRecords, setHistoryRecords] = useState<BacktestHistoryRecord[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<"trades" | "positions">("trades");
  const [viewingHistory, setViewingHistory] = useState(false);

  const [alertCheckInterval, setAlertCheckInterval] = useState("300");
  const [emailHost, setEmailHost] = useState("");
  const [emailPort, setEmailPort] = useState("587");
  const [emailSecure, setEmailSecure] = useState("false");
  const [emailUser, setEmailUser] = useState("");
  const [emailPass, setEmailPass] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [notifyBuy, setNotifyBuy] = useState(true);
  const [notifySell, setNotifySell] = useState(true);
  const [alertStatus, setAlertStatus] = useState<{
    isRunning: boolean;
    lastCheck: string | null;
    checkCount: number;
    nextCheck: string | null;
    lastBuyCount: number;
    lastSellCount: number;
  } | null>(null);
  const [alertLoading, setAlertLoading] = useState(false);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [alertHydrated, setAlertHydrated] = useState(false);
  const [alertConfigSaved, setAlertConfigSaved] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const applyAlertFields = useCallback((cfg: AlertConfigStorage) => {
    const normalized = normalizeAlertConfig(cfg);
    setAlertCheckInterval(normalized.checkInterval);
    setEmailHost(normalized.emailHost);
    setEmailPort(normalized.emailPort);
    setEmailSecure(normalized.emailSecure);
    setEmailUser(normalized.emailUser);
    setEmailPass(normalized.emailPass);
    setRecipientEmail(normalized.recipientEmail);
    setNotifyBuy(normalized.notifyBuy);
    setNotifySell(normalized.notifySell);
  }, []);

  const getCurrentAlertConfig = useCallback((): AlertConfigStorage => {
    return normalizeAlertConfig({
      checkInterval: alertCheckInterval,
      emailHost,
      emailPort,
      emailSecure,
      emailUser,
      emailPass,
      recipientEmail,
      notifyBuy,
      notifySell,
    });
  }, [alertCheckInterval, emailHost, emailPort, emailSecure, emailUser, emailPass, recipientEmail, notifyBuy, notifySell]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const records = await loadBacktestHistory();
      if (!cancelled) setHistoryRecords(records);
    };
    refresh();
    window.addEventListener(BACKTEST_HISTORY_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(BACKTEST_HISTORY_EVENT, refresh);
    };
  }, []);

  const loadHistoryRecord = useCallback((record: BacktestHistoryRecord) => {
    setResult(record.result);
    setCapital(record.params.capital);
    setMode(record.params.mode);
    if (record.params.symbol) setSymbol(record.params.symbol);
    setKlineInterval(record.params.interval);
    setConfig(record.params.config);
    setStartDate(record.params.startDate ?? "");
    setEndDate(record.params.endDate ?? "");
    setActiveHistoryId(record.id);
    setViewingHistory(true);
    setResultTab("trades");
    setError(null);
  }, []);

  useEffect(() => {
    setAppliedMeta(loadAppliedStrategy());
    applyAlertFields(loadAlertConfig() ?? DEFAULT_ALERT_CONFIG);
    const applied = loadAppliedStrategy();
    if (applied) setConfig(applied.config);
    setAlertHydrated(true);
  }, [applyAlertFields]);

  useEffect(() => {
    if (!alertHydrated) return;
    saveAlertConfig(getCurrentAlertConfig());
    setAlertConfigSaved(true);
    const timer = setTimeout(() => setAlertConfigSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [alertHydrated, getCurrentAlertConfig]);

  useEffect(() => {
    const fetchAlertStatus = async () => {
      try {
        const res = await fetch("/api/alerts/status");
        const data = await res.json();
        if (data.success) setAlertStatus(data.status);
      } catch {
        /* ignore */
      }
    };
    fetchAlertStatus();
    const timer = setInterval(fetchAlertStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  const persistAlertConfig = useCallback(() => {
    saveAlertConfig(getCurrentAlertConfig());
  }, [getCurrentAlertConfig]);

  const exportAlertConfig = useCallback(() => {
    exportAlertConfigFile(getCurrentAlertConfig());
    setAlertMessage({ type: "success", text: "配置已导出为 tsq-alert-config.json" });
    setTimeout(() => setAlertMessage(null), 3000);
  }, [getCurrentAlertConfig]);

  const importAlertConfig = useCallback(async () => {
    try {
      const config = await importAlertConfigFromFile();
      applyAlertFields(config);
      setAlertMessage({ type: "success", text: "配置已导入并保存到本地" });
      setTimeout(() => setAlertMessage(null), 3000);
    } catch (err) {
      setAlertMessage({
        type: "error",
        text: err instanceof Error ? err.message : "导入失败",
      });
    }
  }, [applyAlertFields]);

  const applyStrategy = useCallback(() => {
    const meta = saveAppliedStrategy(config, "backtest", capital);
    setAppliedMeta(meta);
    setApplySuccess("策略已应用，Dashboard 与策略信号页将使用当前参数");
    setTimeout(() => setApplySuccess(null), 4000);
  }, [config]);

  const testEmail = useCallback(async () => {
    if (!emailHost || !emailPort || !emailUser || !emailPass || !recipientEmail) {
      setAlertMessage({ type: "error", text: "请填写完整的邮件配置" });
      return;
    }
    setTestEmailLoading(true);
    setAlertMessage(null);
    persistAlertConfig();
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailConfig: {
            host: emailHost,
            port: parseInt(emailPort),
            secure: emailSecure === "true",
            user: emailUser,
            pass: emailPass,
          },
          recipientEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAlertMessage({ type: "error", text: data.error || "发送失败" });
        return;
      }
      setAlertMessage({ type: "success", text: "测试邮件已发送" });
    } catch {
      setAlertMessage({ type: "error", text: "发送测试邮件失败" });
    } finally {
      setTestEmailLoading(false);
    }
  }, [emailHost, emailPort, emailSecure, emailUser, emailPass, recipientEmail, persistAlertConfig]);

  const startAlerts = useCallback(async () => {
    if (!emailHost || !emailPort || !emailUser || !emailPass || !recipientEmail) {
      setAlertMessage({ type: "error", text: "请填写完整的邮件配置" });
      return;
    }
    setAlertLoading(true);
    setAlertMessage(null);
    persistAlertConfig();
    try {
      const res = await fetch("/api/alerts/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyConfig: config,
          checkInterval: parseInt(alertCheckInterval),
          emailConfig: {
            host: emailHost,
            port: parseInt(emailPort),
            secure: emailSecure === "true",
            user: emailUser,
            pass: emailPass,
          },
          recipientEmail,
          notifyBuy,
          notifySell,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAlertMessage({ type: "error", text: data.error || "启动失败" });
        return;
      }
      setAlertMessage({ type: "success", text: "信号提醒已启动，将使用当前策略参数" });
      saveAppliedStrategy(config, "backtest", capital);
      setAppliedMeta(loadAppliedStrategy());
    } catch {
      setAlertMessage({ type: "error", text: "启动信号提醒失败" });
    } finally {
      setAlertLoading(false);
    }
  }, [config, alertCheckInterval, emailHost, emailPort, emailSecure, emailUser, emailPass, recipientEmail, notifyBuy, notifySell, persistAlertConfig]);

  const stopAlerts = useCallback(async () => {
    setAlertLoading(true);
    try {
      await fetch("/api/alerts/stop", { method: "POST" });
      setAlertMessage({ type: "success", text: "信号提醒已停止" });
    } catch {
      setAlertMessage({ type: "error", text: "停止失败" });
    } finally {
      setAlertLoading(false);
    }
  }, []);

  const runBacktest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          interval: klineInterval,
          capital,
          config,
          mode,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "回测失败");
        return;
      }
      setResult(data as BacktestResult);
      setViewingHistory(false);
      setActiveHistoryId(null);
      const params: BacktestHistoryParams = {
        mode,
        symbol: mode === "single" ? symbol : undefined,
        interval: klineInterval,
        capital,
        config,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };
      try {
        await addBacktestHistoryRecord(params, {
          ...(data as BacktestResult),
          initialCapital: capital,
        });
      } catch (saveErr: unknown) {
        setError(
          saveErr instanceof Error
            ? `回测完成，但保存历史失败：${saveErr.message}`
            : "回测完成，但保存历史失败"
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "回测请求失败");
    } finally {
      setLoading(false);
    }
  }, [symbol, klineInterval, capital, config, mode, startDate, endDate]);

  // Render equity curve with TCSE benchmark
  useEffect(() => {
    if (!chartContainerRef.current || !result || result.equityCurve.length === 0) return;

    let cancelled = false;

    const renderChart = async () => {
      const equityCurve = result.equityCurve;
      const startTs = equityCurve[0].timestamp;
      const endTs = equityCurve[equityCurve.length - 1].timestamp;

      const tcseCandles = await fetchTcseCandles(klineInterval, startTs, endTs);
      if (cancelled || !chartContainerRef.current) return;

      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      const container = chartContainerRef.current;
      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: "#1a1d29" },
          textColor: "#8b8fa3",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#2a2d3a40" },
          horzLines: { color: "#2a2d3a40" },
        },
        rightPriceScale: {
          visible: false,
        },
        leftPriceScale: {
          visible: true,
          borderColor: "#2a2d3a",
        },
        timeScale: {
          borderColor: "#2a2d3a",
        },
        width: container.clientWidth,
        height: 300,
      });

      chartRef.current = chart;

      const pctFormat = {
        type: "custom" as const,
        formatter: (price: number) =>
          `${price >= 0 ? "+" : ""}${price.toFixed(1)}%`,
      };

      const equitySeries = chart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 2,
        priceScaleId: "left",
        title: "策略",
        priceFormat: pctFormat,
      });

      const equityData: LineData<Time>[] = equityCurve.map((point) => ({
        time: (point.timestamp / 1000) as Time,
        value: ((point.equity / capital) - 1) * 100,
      }));

      equitySeries.setData(equityData);

      const benchmarkData = buildBenchmarkReturnSeries(
        equityCurve.map((p) => p.timestamp),
        tcseCandles
      );

      if (benchmarkData.length > 0) {
        const benchmarkSeries = chart.addSeries(LineSeries, {
          color: "#f59e0b",
          lineWidth: 2,
          priceScaleId: "left",
          title: "TCSE",
          priceFormat: pctFormat,
        });
        benchmarkSeries.setData(benchmarkData);
      }

      const baselineSeries = chart.addSeries(LineSeries, {
        color: "#8b8fa340",
        lineWidth: 1,
        lineStyle: 2,
        priceScaleId: "left",
        priceLineVisible: false,
        lastValueVisible: false,
      });

      baselineSeries.setData(
        equityCurve.map((point) => ({
          time: (point.timestamp / 1000) as Time,
          value: 0,
        }))
      );

      chart.timeScale().fitContent();

      if (cancelled) {
        chart.remove();
        return;
      }

      chartRef.current = chart;

      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      ro.observe(container);

      return () => {
        ro.disconnect();
        chart.remove();
        chartRef.current = null;
      };
    };

    let chartCleanup: (() => void) | undefined;

    renderChart().then((cleanup) => {
      if (!cancelled) chartCleanup = cleanup;
      else cleanup?.();
    });

    return () => {
      cancelled = true;
      chartCleanup?.();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [result, capital, klineInterval]);

  return (
    <AppShell>
      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e1e4ea]">历史回测</h1>
            <p className="text-sm text-[#8b8fa3] mt-1">
              组合回测 — 最多 {config.maxPositions} 只持仓，单仓 {Math.round(config.positionSize * 100)}%
              {appliedMeta && (
                <span className="ml-2 text-[#22c55e]">
                  · 已应用策略 ({new Date(appliedMeta.appliedAt).toLocaleString("zh-CN")})
                </span>
              )}
            </p>
          </div>
        </div>

        {applySuccess && (
          <div className="bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-lg p-3 mb-4 flex items-center gap-2 text-[#22c55e] text-sm">
            <Check className="h-4 w-4 flex-shrink-0" />
            {applySuccess}
          </div>
        )}

        {/* Config */}
        <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4 mb-6">
          <div className="grid grid-cols-6 gap-4 mb-4">
            {/* Mode */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">回测模式</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "single" | "portfolio")}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              >
                <option value="portfolio">组合 (推荐)</option>
                <option value="single">单股</option>
              </select>
            </div>

            {/* Symbol */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">标的</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={mode === "portfolio"}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none disabled:opacity-50"
              >
                {TRACKED_SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Interval */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">K线周期</label>
              <select
                value={klineInterval}
                onChange={(e) => setKlineInterval(e.target.value as Interval)}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              >
                {ALL_INTERVALS.map((iv) => (
                  <option key={iv} value={iv}>
                    {INTERVAL_LABELS[iv]}
                  </option>
                ))}
              </select>
            </div>

            {/* Capital */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">初始资金</label>
              <MoneyInput value={capital} onChange={setCapital} />
              <p className="text-[10px] text-[#8b8fa3] mt-1">
                支持 k / m / b / t 单位，如 100k、1.5m、2b
              </p>
            </div>

            {/* Start Date */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">开始日期</label>
              <input
                type="date"
                value={startDate}
                min={BACKTEST_DATE_MIN}
                max={endDate || BACKTEST_DATE_MAX}
                onChange={(e) =>
                  handleDateChange(
                    e.target.value,
                    BACKTEST_DATE_MIN,
                    endDate || BACKTEST_DATE_MAX,
                    setStartDate
                  )
                }
                onBlur={(e) =>
                  setStartDate(
                    sanitizeDateInput(
                      e.target.value,
                      BACKTEST_DATE_MIN,
                      endDate || BACKTEST_DATE_MAX
                    )
                  )
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">结束日期</label>
              <input
                type="date"
                value={endDate}
                min={startDate || BACKTEST_DATE_MIN}
                max={BACKTEST_DATE_MAX}
                onChange={(e) =>
                  handleDateChange(
                    e.target.value,
                    startDate || BACKTEST_DATE_MIN,
                    BACKTEST_DATE_MAX,
                    setEndDate
                  )
                }
                onBlur={(e) =>
                  setEndDate(
                    sanitizeDateInput(
                      e.target.value,
                      startDate || BACKTEST_DATE_MIN,
                      BACKTEST_DATE_MAX
                    )
                  )
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
              <p className="text-[10px] text-[#8b8fa3] mt-1">留空表示不限 · 年份 4 位</p>
            </div>
          </div>

          <div className="grid grid-cols-6 gap-4 mb-4">
            {/* RSI Period */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">RSI 周期</label>
              <input
                type="number"
                value={config.rsiPeriod}
                onChange={(e) =>
                  setConfig({ ...config, rsiPeriod: parseInt(e.target.value) || 14 })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>

            {/* RSI Overbought */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">RSI 超买</label>
              <input
                type="number"
                value={config.rsiOverbought}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    rsiOverbought: parseInt(e.target.value) || 70,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>

            {/* RSI Oversold */}
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">RSI 超卖</label>
              <input
                type="number"
                value={config.rsiOversold}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    rsiOversold: parseInt(e.target.value) || 30,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-6 gap-4">
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">单仓比例 (%)</label>
              <input
                type="number"
                value={Math.round(config.positionSize * 100)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    positionSize: (parseInt(e.target.value) || 40) / 100,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">最大持仓数</label>
              <input
                type="number"
                value={config.maxPositions}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    maxPositions: parseInt(e.target.value) || 4,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">止损 (%)</label>
              <input
                type="number"
                value={Math.round(config.stopLoss * 100)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    stopLoss: (parseInt(e.target.value) || 8) / 100,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">止盈 (%)</label>
              <input
                type="number"
                value={Math.round(config.takeProfit * 100)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    takeProfit: (parseInt(e.target.value) || 45) / 100,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">移动止损 (%)</label>
              <input
                type="number"
                value={Math.round(config.trailingStop * 100)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    trailingStop: (parseInt(e.target.value) || 12) / 100,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">最低买入分</label>
              <input
                type="number"
                step={0.01}
                value={config.minBuyScore}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    minBuyScore: parseFloat(e.target.value) || 0.38,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={runBacktest}
              disabled={loading}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                loading
                  ? "bg-[#3b82f6]/50 text-white/50 cursor-not-allowed"
                  : "bg-[#3b82f6] text-white hover:bg-[#3b82f6]/80"
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {loading ? "运行中..." : "运行回测"}
            </button>
            <button
              onClick={applyStrategy}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#22c55e] text-white text-sm font-medium hover:bg-[#22c55e]/80 transition-colors"
            >
              <Check className="h-4 w-4" />
              应用策略
            </button>
            <button
              onClick={() => {
                setConfig(DEFAULT_STRATEGY_CONFIG);
                setMode("portfolio");
                setSymbol("TCI");
                setKlineInterval("d1");
                setCapital(100000);
                setStartDate("");
                setEndDate("");
              }}
              className="px-4 py-2 rounded-lg bg-[#2a2d3a] text-[#8b8fa3] hover:text-[#e1e4ea] text-sm transition-colors"
            >
              重置参数
            </button>
          </div>
        </div>

        {/* Email Alerts */}
        <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#3b82f6]" />
              <h3 className="text-sm font-semibold text-[#e1e4ea]">买卖信号邮件提醒</h3>
              {alertStatus?.isRunning && (
                <span className="px-2 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e] text-xs">
                  运行中
                </span>
              )}
              {alertConfigSaved && !alertStatus?.isRunning && (
                <span className="text-xs text-[#8b8fa3]">已保存到本地</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {alertStatus?.isRunning && (
                <span className="text-xs text-[#8b8fa3] font-data">
                  买入 {alertStatus.lastBuyCount} · 卖出 {alertStatus.lastSellCount}
                  {alertStatus.nextCheck && (
                    <> · 下次 {new Date(alertStatus.nextCheck).toLocaleTimeString("zh-CN")}</>
                  )}
                </span>
              )}
              <button
                type="button"
                onClick={exportAlertConfig}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2a2d3a] text-[#8b8fa3] hover:text-[#e1e4ea] text-xs transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                导出配置
              </button>
              <button
                type="button"
                onClick={importAlertConfig}
                disabled={alertStatus?.isRunning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2a2d3a] text-[#8b8fa3] hover:text-[#e1e4ea] text-xs transition-colors disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                导入配置
              </button>
            </div>
          </div>

          <p className="text-xs text-[#8b8fa3] mb-4">
            定时检测全市场策略信号，当标的信号变为买入或卖出时发送邮件。首次启动仅记录基准，避免重复通知。配置会自动保存到浏览器 localStorage，也可导出/导入 JSON 文件。
          </p>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">SMTP 服务器</label>
              <input
                type="text"
                value={emailHost}
                onChange={(e) => setEmailHost(e.target.value)}
                placeholder="smtp.example.com"
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">端口</label>
              <input
                type="number"
                value={emailPort}
                onChange={(e) => setEmailPort(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">加密 (SSL/TLS)</label>
              <select
                value={emailSecure}
                onChange={(e) => setEmailSecure(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] text-sm focus:border-[#3b82f6] focus:outline-none"
              >
                <option value="false">否 (STARTTLS)</option>
                <option value="true">是 (SSL)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">发件邮箱</label>
              <input
                type="email"
                value={emailUser}
                onChange={(e) => setEmailUser(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">邮箱密码 / 授权码</label>
              <input
                type="password"
                value={emailPass}
                onChange={(e) => setEmailPass(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">收件邮箱</label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="recipient@email.com"
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b8fa3] mb-1 block">检查间隔 (秒)</label>
              <input
                type="number"
                min={60}
                value={alertCheckInterval}
                onChange={(e) => setAlertCheckInterval(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none"
              />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-[#e1e4ea] cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyBuy}
                  onChange={(e) => setNotifyBuy(e.target.checked)}
                  className="rounded border-[#2a2d3a]"
                />
                买入提醒
              </label>
              <label className="flex items-center gap-2 text-sm text-[#e1e4ea] cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifySell}
                  onChange={(e) => setNotifySell(e.target.checked)}
                  className="rounded border-[#2a2d3a]"
                />
                卖出提醒
              </label>
            </div>
          </div>

          {alertMessage && (
            <div
              className={cn(
                "rounded-lg p-3 mb-4 text-sm flex items-center gap-2",
                alertMessage.type === "success"
                  ? "bg-[#22c55e]/10 border border-[#22c55e]/20 text-[#22c55e]"
                  : "bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]"
              )}
            >
              {alertMessage.type === "success" ? (
                <Check className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              {alertMessage.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={testEmail}
              disabled={testEmailLoading || alertStatus?.isRunning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2a2d3a] text-[#e1e4ea] text-sm hover:bg-[#3b82f6]/20 transition-colors disabled:opacity-50"
            >
              {testEmailLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              发送测试邮件
            </button>
            {!alertStatus?.isRunning ? (
              <button
                onClick={startAlerts}
                disabled={alertLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3b82f6] text-white text-sm hover:bg-[#3b82f6]/80 transition-colors disabled:opacity-50"
              >
                {alertLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                启动提醒
              </button>
            ) : (
              <button
                onClick={stopAlerts}
                disabled={alertLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ef4444] text-white text-sm hover:bg-[#ef4444]/80 transition-colors disabled:opacity-50"
              >
                {alertLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
                停止提醒
              </button>
            )}
          </div>
        </div>

        {/* Backtest History */}
        <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#3b82f6]" />
              <h3 className="text-sm font-semibold text-[#e1e4ea]">历史回测记录</h3>
              <span className="text-xs text-[#8b8fa3]">
                本地保存 {historyRecords.length} 条
              </span>
            </div>
            {historyRecords.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  if (confirm("确定清空全部历史回测记录？")) {
                    await clearBacktestHistory();
                    if (viewingHistory) {
                      setResult(null);
                      setViewingHistory(false);
                      setActiveHistoryId(null);
                    }
                  }
                }}
                className="text-xs text-[#8b8fa3] hover:text-[#ef4444] transition-colors"
              >
                清空全部
              </button>
            )}
          </div>
          {historyRecords.length === 0 ? (
            <p className="text-xs text-[#8b8fa3]">
              运行回测后自动保存到本地 IndexedDB，可在此查看历史结果
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[220px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#1a1d29]">
                  <tr className="border-b border-[#2a2d3a] text-[#8b8fa3]">
                    <th className="text-left px-3 py-2 font-medium">时间</th>
                    <th className="text-left px-3 py-2 font-medium">标签</th>
                    <th className="text-right px-3 py-2 font-medium">年化</th>
                    <th className="text-right px-3 py-2 font-medium">总收益</th>
                    <th className="text-right px-3 py-2 font-medium">交易</th>
                    <th className="text-right px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.map((record) => (
                    <tr
                      key={record.id}
                      className={cn(
                        "border-b border-[#2a2d3a]/50 hover:bg-[#2a2d3a]/30",
                        activeHistoryId === record.id && "bg-[#3b82f6]/10"
                      )}
                    >
                      <td className="px-3 py-2 font-data text-[#8b8fa3] text-xs">
                        {new Date(record.ranAt).toLocaleString("zh-CN")}
                      </td>
                      <td className="px-3 py-2 text-[#e1e4ea]">{record.label}</td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-data",
                          record.result.metrics.annualizedReturn >= 0
                            ? "text-[#22c55e]"
                            : "text-[#ef4444]"
                        )}
                      >
                        {(record.result.metrics.annualizedReturn * 100).toFixed(1)}%
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-data",
                          record.result.metrics.totalReturnPercent >= 0
                            ? "text-[#22c55e]"
                            : "text-[#ef4444]"
                        )}
                      >
                        {(record.result.metrics.totalReturnPercent * 100).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right font-data text-[#8b8fa3]">
                        {record.result.metrics.totalTrades}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => loadHistoryRecord(record)}
                            className="p-1.5 rounded hover:bg-[#3b82f6]/20 text-[#3b82f6]"
                            title="查看"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteBacktestHistoryRecord(record.id);
                              if (activeHistoryId === record.id) {
                                setResult(null);
                                setViewingHistory(false);
                                setActiveHistoryId(null);
                              }
                            }}
                            className="p-1.5 rounded hover:bg-[#ef4444]/20 text-[#ef4444]"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg p-4 mb-6 flex items-center gap-2 text-[#ef4444] text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {viewingHistory && (
              <div className="bg-[#3b82f6]/10 border border-[#3b82f6]/20 rounded-lg px-4 py-2 mb-4 text-sm text-[#3b82f6] flex items-center gap-2">
                <History className="h-4 w-4" />
                正在查看历史回测记录
              </div>
            )}
            {/* Metrics */}
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <MetricCard
                label="年化收益"
                value={`${result.metrics.annualizedReturn >= 0 ? "+" : ""}${(result.metrics.annualizedReturn * 100).toFixed(1)}%`}
                icon={<TrendingUp className="h-5 w-5" />}
                positive={result.metrics.annualizedReturn >= 0.3}
              />
              <MetricCard
                label="总收益"
                value={`${result.metrics.totalReturnPercent >= 0 ? "+" : ""}${(result.metrics.totalReturnPercent * 100).toFixed(2)}%`}
                icon={<DollarSign className="h-5 w-5" />}
                positive={result.metrics.totalReturnPercent >= 0}
              />
              <MetricCard
                label="交易次数"
                value={result.metrics.totalTrades.toString()}
                icon={<BarChart3 className="h-5 w-5" />}
              />
              <MetricCard
                label="胜率"
                value={`${(result.metrics.winRate * 100).toFixed(1)}%`}
                icon={<Target className="h-5 w-5" />}
                positive={result.metrics.winRate >= 0.5}
              />
              <MetricCard
                label="最大回撤"
                value={`${(result.metrics.maxDrawdownPercent * 100).toFixed(2)}%`}
                icon={<TrendingDown className="h-5 w-5" />}
                negative
              />
              <MetricCard
                label="盈亏比"
                value={
                  result.metrics.profitFactor === Infinity
                    ? "∞"
                    : result.metrics.profitFactor.toFixed(2)
                }
                icon={<TrendingUp className="h-5 w-5" />}
                positive={result.metrics.profitFactor >= 1}
              />
            </div>

            {/* Additional Metrics */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
                <span className="text-xs text-[#8b8fa3]">回测模式</span>
                <div className="font-data text-lg font-bold text-[#e1e4ea] mt-1">
                  {result.mode === "portfolio" ? "组合" : "单股"}
                </div>
              </div>
              <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
                <span className="text-xs text-[#8b8fa3]">年化收益</span>
                <div
                  className={cn(
                    "font-data text-lg font-bold mt-1",
                    result.metrics.annualizedReturn >= 0.3
                      ? "text-[#22c55e]"
                      : "text-[#e1e4ea]"
                  )}
                >
                  {(result.metrics.annualizedReturn * 100).toFixed(2)}%
                </div>
              </div>
              <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
                <span className="text-xs text-[#8b8fa3]">平均交易收益</span>
                <div className="font-data text-lg font-bold text-[#e1e4ea] mt-1">
                  {(result.metrics.avgTradeReturn * 100).toFixed(3)}%
                </div>
              </div>
              <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
                <span className="text-xs text-[#8b8fa3]">夏普比率</span>
                <div className="font-data text-lg font-bold text-[#e1e4ea] mt-1">
                  {result.metrics.sharpeRatio.toFixed(2)}
                </div>
              </div>
              <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-3">
                <span className="text-xs text-[#8b8fa3]">总手续费</span>
                <div className="font-data text-lg font-bold text-[#f59e0b] mt-1">
                  {formatMoney(result.metrics.totalFees)}
                </div>
              </div>
            </div>

            {/* Equity Curve */}
            <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-semibold text-[#e1e4ea]">
                    权益曲线（累计收益率）
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-[#8b8fa3]">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5 bg-[#3b82f6] rounded" />
                      策略
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5 bg-[#f59e0b] rounded" />
                      TCSE 大盘
                    </span>
                  </div>
                </div>
                {(result.startDate || result.endDate) && (
                  <span className="text-xs text-[#8b8fa3] font-data">
                    {result.startDate ?? "—"} ~ {result.endDate ?? "—"}
                  </span>
                )}
              </div>
              <div ref={chartContainerRef} className="w-full h-[300px]" />
            </div>

            {/* Trades / Position History */}
            <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a]">
              <div className="px-4 py-3 border-b border-[#2a2d3a] flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setResultTab("trades")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      resultTab === "trades"
                        ? "bg-[#3b82f6] text-white"
                        : "text-[#8b8fa3] hover:text-[#e1e4ea]"
                    )}
                  >
                    交易记录
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultTab("positions")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      resultTab === "positions"
                        ? "bg-[#3b82f6] text-white"
                        : "text-[#8b8fa3] hover:text-[#e1e4ea]"
                    )}
                  >
                    历史持仓
                  </button>
                </div>
                <span className="text-xs text-[#8b8fa3]">
                  {resultTab === "trades"
                    ? `共 ${result.trades.length} 笔交易`
                    : `共 ${result.positionHistory?.length ?? 0} 条持仓快照`}
                </span>
              </div>
              {resultTab === "trades" ? (
                <TradeRecordsTable result={result} capital={capital} />
              ) : (
                <PositionHistoryTable
                  snapshots={result.positionHistory ?? []}
                />
              )}
            </div>
          </>
        )}

        {/* Empty State */}
        {!result && !loading && !error && (
          <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-16 text-center">
            <FlaskConical className="h-12 w-12 text-[#8b8fa3] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#e1e4ea] mb-2">
              选择参数并运行回测
            </h3>
            <p className="text-sm text-[#8b8fa3]">
              默认使用组合模式：分散持仓、止损止盈、按信号强度分配仓位
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  icon,
  positive,
  negative,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  positive?: boolean;
  negative?: boolean;
}) {
  const color = positive
    ? "#22c55e"
    : negative
      ? "#ef4444"
      : "#e1e4ea";

  return (
    <div className="bg-[#1a1d29] rounded-lg border border-[#2a2d3a] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#8b8fa3]">{label}</span>
        <div style={{ color }}>{icon}</div>
      </div>
      <span className="font-data text-2xl font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
