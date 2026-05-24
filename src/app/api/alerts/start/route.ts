import { NextRequest, NextResponse } from "next/server";
import { signalAlertService } from "@/lib/signal-alert";
import type { StrategyConfig } from "@/types/stock";
import { DEFAULT_STRATEGY_CONFIG } from "@/types/stock";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      strategyConfig,
      checkInterval,
      emailConfig,
      recipientEmail,
      notifyBuy = true,
      notifySell = true,
    } = body as {
      strategyConfig?: Partial<StrategyConfig>;
      checkInterval?: number;
      emailConfig?: {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        pass: string;
      };
      recipientEmail?: string;
      notifyBuy?: boolean;
      notifySell?: boolean;
    };

    if (!checkInterval || !emailConfig || !recipientEmail) {
      return NextResponse.json({ error: "缺少必填参数" }, { status: 400 });
    }

    if (!emailConfig.host || !emailConfig.port || !emailConfig.user || !emailConfig.pass) {
      return NextResponse.json({ error: "邮件配置不完整" }, { status: 400 });
    }

    if (checkInterval < 60) {
      return NextResponse.json(
        { error: "检查间隔不能小于 60 秒" },
        { status: 400 }
      );
    }

    if (!notifyBuy && !notifySell) {
      return NextResponse.json(
        { error: "请至少启用买入或卖出提醒" },
        { status: 400 }
      );
    }

    signalAlertService.start({
      strategyConfig: {
        ...DEFAULT_STRATEGY_CONFIG,
        ...strategyConfig,
      },
      checkInterval,
      emailConfig,
      recipientEmail,
      notifyBuy,
      notifySell,
    });

    return NextResponse.json({
      success: true,
      message: "信号提醒已启动",
    });
  } catch (error) {
    console.error("启动信号提醒失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "启动失败" },
      { status: 500 }
    );
  }
}
