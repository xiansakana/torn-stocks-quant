import { NextResponse } from "next/server";
import { signalAlertService } from "@/lib/signal-alert";

export async function POST() {
  signalAlertService.stop();
  return NextResponse.json({
    success: true,
    message: "信号提醒已停止",
  });
}
