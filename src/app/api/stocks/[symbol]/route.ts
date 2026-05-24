import { NextRequest, NextResponse } from "next/server";

const TORNSY_API_BASE = "https://tornsy.com/api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const searchParams = request.nextUrl.searchParams;
    const interval = searchParams.get("interval");
    const to = searchParams.get("to");

    let url = `${TORNSY_API_BASE}/${symbol.toLowerCase()}`;
    const queryParams: string[] = [];

    if (interval && interval !== "m1") {
      queryParams.push(`interval=${interval}`);
    }
    if (to) {
      queryParams.push(`to=${to}`);
    }
    if (queryParams.length > 0) {
      url += `?${queryParams.join("&")}`;
    }

    const res = await fetch(url, {
      next: { revalidate: 30 }, // Cache for 30 seconds
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch stock data: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
