import { NextRequest, NextResponse } from "next/server";

const TORNSY_API_BASE = "https://tornsy.com/api";

/** TCSE index OHLCV from tornsy (7 fields per row) */
interface RawTcseRow {
  data: [number, string, string, string, string, number, number][];
}

export interface TcseCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function parseTcse(raw: RawTcseRow): TcseCandle[] {
  return raw.data.map(([timestamp, open, high, low, close]) => ({
    timestamp: timestamp * 1000,
    open: parseFloat(open),
    high: parseFloat(high),
    low: parseFloat(low),
    close: parseFloat(close),
  }));
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const interval = searchParams.get("interval") ?? "d1";
    const to = searchParams.get("to");

    let url = `${TORNSY_API_BASE}/tcse?interval=${interval}`;
    if (to) {
      url += `&to=${to}`;
    }

    const res = await fetch(url, { next: { revalidate: 300 } });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch TCSE data: ${res.status}` },
        { status: res.status }
      );
    }

    const data: RawTcseRow = await res.json();
    return NextResponse.json({
      data: parseTcse(data),
      interval,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
