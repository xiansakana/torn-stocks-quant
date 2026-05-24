import { NextResponse } from "next/server";

const TORNSY_API_BASE = "https://tornsy.com/api";

export async function GET() {
  try {
    const res = await fetch(`${TORNSY_API_BASE}/stocks`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch stocks: ${res.status}` },
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
