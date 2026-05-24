import type { LineData, Time } from "lightweight-charts";

export interface BenchmarkCandle {
  timestamp: number;
  close: number;
}

/** Build cumulative return % series aligned to equity curve timestamps. */
export function buildBenchmarkReturnSeries(
  equityTimestamps: number[],
  benchmarkCandles: BenchmarkCandle[]
): LineData<Time>[] {
  if (equityTimestamps.length === 0 || benchmarkCandles.length === 0) {
    return [];
  }

  const sorted = [...benchmarkCandles].sort((a, b) => a.timestamp - b.timestamp);
  const startTs = equityTimestamps[0];

  let baseIdx = sorted.findIndex((c) => c.timestamp >= startTs);
  if (baseIdx === -1) {
    baseIdx = sorted.length - 1;
  } else if (baseIdx > 0 && sorted[baseIdx].timestamp > startTs) {
    baseIdx -= 1;
  }

  const basePrice = sorted[baseIdx]?.close;
  if (!basePrice || basePrice <= 0) return [];

  let tcseIdx = baseIdx;

  return equityTimestamps.map((ts) => {
    while (
      tcseIdx + 1 < sorted.length &&
      sorted[tcseIdx + 1].timestamp <= ts
    ) {
      tcseIdx++;
    }
    const close = sorted[tcseIdx].close;
    return {
      time: (ts / 1000) as Time,
      value: ((close / basePrice) - 1) * 100,
    };
  });
}

/** Fetch paginated TCSE candles covering [startTs, endTs]. */
export async function fetchTcseCandles(
  interval: string,
  startTs: number,
  endTs: number
): Promise<BenchmarkCandle[]> {
  let all: BenchmarkCandle[] = [];
  let to: number | undefined;

  for (let page = 0; page < 5; page++) {
    let url = `/api/tcse?interval=${encodeURIComponent(interval)}`;
    if (to) url += `&to=${to}`;

    const res = await fetch(url);
    if (!res.ok) break;

    const json = (await res.json()) as {
      data: BenchmarkCandle[];
      error?: string;
    };
    if (json.error || !json.data?.length) break;

    all = [...json.data, ...all];

    if (json.data[0].timestamp <= startTs || json.data.length < 1000) {
      break;
    }
    to = Math.floor(json.data[0].timestamp / 1000);
  }

  return all.filter((c) => c.timestamp <= endTs);
}
