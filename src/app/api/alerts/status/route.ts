import { NextResponse } from "next/server";
import { signalAlertService } from "@/lib/signal-alert";

export async function GET() {
  const status = signalAlertService.getStatus();
  return NextResponse.json({
    success: true,
    status: {
      ...status,
      lastCheck: status.lastCheck?.toISOString() ?? null,
      nextCheck: status.nextCheck?.toISOString() ?? null,
      recentAlerts: status.recentAlerts.map((a) => ({
        ...a,
        timestamp: a.timestamp.toISOString(),
      })),
    },
  });
}
