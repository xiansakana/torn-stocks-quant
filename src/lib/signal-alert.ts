import type { StrategyConfig, StrategySignal, SignalType } from "@/types/stock";
import { EmailService, type EmailConfig } from "@/lib/email";
import { fetchAllSignals } from "@/lib/signals";

export interface SignalAlertConfig {
  strategyConfig: StrategyConfig;
  checkInterval: number;
  emailConfig: EmailConfig;
  recipientEmail: string;
  notifyBuy: boolean;
  notifySell: boolean;
}

export interface SignalAlertStatus {
  isRunning: boolean;
  lastCheck: Date | null;
  checkCount: number;
  nextCheck: Date | null;
  lastBuyCount: number;
  lastSellCount: number;
  recentAlerts: Array<{
    symbol: string;
    signal: SignalType;
    price: number;
    timestamp: Date;
  }>;
}

class SignalAlertService {
  private config: SignalAlertConfig | null = null;
  private timer: NodeJS.Timeout | null = null;
  private emailService: EmailService | null = null;
  private lastSignals = new Map<string, SignalType>();
  private seeded = false;
  private status: SignalAlertStatus = {
    isRunning: false,
    lastCheck: null,
    checkCount: 0,
    nextCheck: null,
    lastBuyCount: 0,
    lastSellCount: 0,
    recentAlerts: [],
  };

  start(config: SignalAlertConfig): void {
    if (this.status.isRunning) {
      throw new Error("信号提醒服务已在运行中");
    }

    if (config.checkInterval < 60) {
      throw new Error("检查间隔不能小于 60 秒");
    }

    this.config = config;
    this.emailService = new EmailService(config.emailConfig);
    this.lastSignals.clear();
    this.seeded = false;
    this.status.isRunning = true;
    this.status.nextCheck = new Date(Date.now() + config.checkInterval * 1000);

    this.performCheck();

    this.timer = setInterval(() => {
      this.performCheck();
      this.status.nextCheck = new Date(
        Date.now() + this.config!.checkInterval * 1000
      );
    }, config.checkInterval * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status.isRunning = false;
    this.status.nextCheck = null;
    this.config = null;
    this.emailService = null;
    this.lastSignals.clear();
    this.seeded = false;
  }

  getStatus(): SignalAlertStatus {
    return {
      ...this.status,
      recentAlerts: [...this.status.recentAlerts],
    };
  }

  private async performCheck(): Promise<void> {
    if (!this.config || !this.emailService) return;

    try {
      const signals = await fetchAllSignals(this.config.strategyConfig);
      this.status.lastCheck = new Date();
      this.status.checkCount++;
      this.status.lastBuyCount = signals.filter((s) => s.signal === "BUY").length;
      this.status.lastSellCount = signals.filter((s) => s.signal === "SELL").length;

      if (!this.seeded) {
        for (const s of signals) {
          this.lastSignals.set(s.symbol, s.signal);
        }
        this.seeded = true;
        return;
      }

      const changed: StrategySignal[] = [];
      for (const s of signals) {
        const prev = this.lastSignals.get(s.symbol);
        if (prev === s.signal) continue;

        const isBuy = s.signal === "BUY" && this.config.notifyBuy;
        const isSell = s.signal === "SELL" && this.config.notifySell;
        if (isBuy || isSell) {
          changed.push(s);
        }
        this.lastSignals.set(s.symbol, s.signal);
      }

      if (changed.length > 0) {
        await this.sendAlertEmail(changed);
        for (const s of changed) {
          this.status.recentAlerts.unshift({
            symbol: s.symbol,
            signal: s.signal,
            price: s.price,
            timestamp: new Date(),
          });
        }
        if (this.status.recentAlerts.length > 20) {
          this.status.recentAlerts = this.status.recentAlerts.slice(0, 20);
        }
      }
    } catch (error) {
      console.error("信号检查失败:", error);
    }
  }

  private async sendAlertEmail(signals: StrategySignal[]): Promise<void> {
    if (!this.emailService || !this.config) return;

    const buySignals = signals.filter((s) => s.signal === "BUY");
    const sellSignals = signals.filter((s) => s.signal === "SELL");
    const parts: string[] = [];
    if (buySignals.length > 0) parts.push(`${buySignals.length} 个买入`);
    if (sellSignals.length > 0) parts.push(`${sellSignals.length} 个卖出`);

    const subject = `【Torn Stocks】策略信号提醒 - ${parts.join("、")}`;
    const text = this.formatText(signals);
    const html = this.formatHtml(signals);

    await this.emailService.sendEmail({
      to: this.config.recipientEmail,
      subject,
      text,
      html,
    });
  }

  private formatText(signals: StrategySignal[]): string {
    let text = `检测到 ${signals.length} 个策略信号变化：\n\n`;
    for (const s of signals) {
      const label = s.signal === "BUY" ? "买入" : "卖出";
      text += `${s.symbol} (${s.name}) - ${label}\n`;
      text += `  价格: ${s.price.toFixed(2)}\n`;
      text += `  强度: ${s.strength}%\n`;
      text += `  评分: ${s.combinedScore > 0 ? "+" : ""}${s.combinedScore.toFixed(2)}\n`;
      text += `  RSI: ${isNaN(s.rsi) ? "-" : s.rsi.toFixed(1)}\n\n`;
    }
    text += "此邮件由 Torn Stocks Quant 自动发送。";
    return text;
  }

  private formatHtml(signals: StrategySignal[]): string {
    const rows = signals
      .map((s) => {
        const isBuy = s.signal === "BUY";
        const color = isBuy ? "#22c55e" : "#ef4444";
        const label = isBuy ? "买入" : "卖出";
        return `
          <div style="background:#f8f9fa;padding:12px 16px;margin-bottom:12px;border-left:4px solid ${color};border-radius:4px;">
            <h3 style="margin:0 0 8px;color:${color};">${s.symbol} - ${label}</h3>
            <p style="margin:4px 0;color:#666;"><strong>名称:</strong> ${s.name}</p>
            <p style="margin:4px 0;color:#666;"><strong>价格:</strong> ${s.price.toFixed(2)}</p>
            <p style="margin:4px 0;color:#666;"><strong>强度:</strong> ${s.strength}%</p>
            <p style="margin:4px 0;color:#666;"><strong>评分:</strong> ${s.combinedScore > 0 ? "+" : ""}${s.combinedScore.toFixed(2)}</p>
            <p style="margin:4px 0;color:#666;"><strong>RSI:</strong> ${isNaN(s.rsi) ? "-" : s.rsi.toFixed(1)}</p>
          </div>`;
      })
      .join("");

    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#3b82f6;border-bottom:2px solid #3b82f6;padding-bottom:10px;">
          Torn Stocks 策略信号提醒
        </h2>
        <p style="color:#333;">检测到 <strong>${signals.length}</strong> 个信号变化：</p>
        ${rows}
        <p style="margin-top:20px;color:#999;font-size:12px;">此邮件由 Torn Stocks Quant 自动发送，请勿回复。</p>
      </div>`;
  }
}

export const signalAlertService = new SignalAlertService();
