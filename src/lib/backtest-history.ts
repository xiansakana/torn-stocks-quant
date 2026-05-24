import type {
  BacktestHistoryRecord,
  BacktestHistoryParams,
  BacktestResult,
  Interval,
} from "@/types/stock";
import { INTERVAL_LABELS } from "@/types/stock";

/** Legacy localStorage key — migrated once into IndexedDB */
export const BACKTEST_HISTORY_KEY = "tsq-backtest-history";
export const BACKTEST_HISTORY_MAX = 20;
export const BACKTEST_HISTORY_EVENT = "tsq-backtest-history-updated";

const DB_NAME = "tsq-quant";
const DB_VERSION = 1;
const STORE_NAME = "backtest-history";

let dbPromise: Promise<IDBDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("ranAt", "ranAt", { unique: false });
        }
      };
    });
  }
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

async function migrateFromLocalStorage(): Promise<void> {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(BACKTEST_HISTORY_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as BacktestHistoryRecord[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem(BACKTEST_HISTORY_KEY);
      return;
    }

    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const record of parsed.slice(0, BACKTEST_HISTORY_MAX)) {
      store.put(record);
    }
    await txComplete(tx);
    localStorage.removeItem(BACKTEST_HISTORY_KEY);
  } catch {
    // Keep localStorage data if migration fails so the user can retry.
  }
}

async function ensureReady(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!migrationPromise) {
    migrationPromise = migrateFromLocalStorage();
  }
  await migrationPromise;
  return openDb();
}

function notifyUpdated(): void {
  window.dispatchEvent(new CustomEvent(BACKTEST_HISTORY_EVENT));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildBacktestLabel(params: BacktestHistoryParams): string {
  const modeLabel = params.mode === "portfolio" ? "组合" : params.symbol ?? "单股";
  const range =
    params.startDate || params.endDate
      ? ` ${params.startDate ?? "…"}~${params.endDate ?? "…"}`
      : "";
  return `${modeLabel} · ${INTERVAL_LABELS[params.interval as Interval] ?? params.interval}${range}`;
}

async function loadAllRecords(): Promise<BacktestHistoryRecord[]> {
  if (typeof window === "undefined") return [];
  try {
    const db = await ensureReady();
    const tx = db.transaction(STORE_NAME, "readonly");
    const records = await requestToPromise(
      tx.objectStore(STORE_NAME).getAll()
    );
    await txComplete(tx);
    return records.sort((a, b) => b.ranAt - a.ranAt);
  } catch {
    return [];
  }
}

async function trimToMax(): Promise<void> {
  const records = await loadAllRecords();
  if (records.length <= BACKTEST_HISTORY_MAX) return;

  const db = await ensureReady();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const record of records.slice(BACKTEST_HISTORY_MAX)) {
    store.delete(record.id);
  }
  await txComplete(tx);
}

export async function loadBacktestHistory(): Promise<BacktestHistoryRecord[]> {
  const records = await loadAllRecords();
  return records.slice(0, BACKTEST_HISTORY_MAX);
}

export async function saveBacktestHistory(
  records: BacktestHistoryRecord[]
): Promise<void> {
  const db = await ensureReady();
  const trimmed = records.slice(0, BACKTEST_HISTORY_MAX);
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  for (const record of trimmed) {
    store.put(record);
  }
  await txComplete(tx);
  notifyUpdated();
}

export async function addBacktestHistoryRecord(
  params: BacktestHistoryParams,
  result: BacktestResult
): Promise<BacktestHistoryRecord> {
  const record: BacktestHistoryRecord = {
    id: generateId(),
    ranAt: Date.now(),
    label: buildBacktestLabel(params),
    params,
    result: {
      ...result,
      initialCapital: result.initialCapital ?? params.capital,
    },
  };

  const db = await ensureReady();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(record);
  await txComplete(tx);
  await trimToMax();
  notifyUpdated();
  return record;
}

export async function getBacktestHistoryRecord(
  id: string
): Promise<BacktestHistoryRecord | null> {
  if (typeof window === "undefined") return null;
  try {
    const db = await ensureReady();
    const tx = db.transaction(STORE_NAME, "readonly");
    const record = await requestToPromise(
      tx.objectStore(STORE_NAME).get(id)
    );
    await txComplete(tx);
    return record ?? null;
  } catch {
    return null;
  }
}

export async function deleteBacktestHistoryRecord(id: string): Promise<void> {
  const db = await ensureReady();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  await txComplete(tx);
  notifyUpdated();
}

export async function clearBacktestHistory(): Promise<void> {
  const db = await ensureReady();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).clear();
  await txComplete(tx);
  localStorage.removeItem(BACKTEST_HISTORY_KEY);
  notifyUpdated();
}

export async function getLatestBacktestCapital(
  defaultCapital = 100000
): Promise<number> {
  const latest = (await loadBacktestHistory())[0];
  return latest?.params.capital ?? defaultCapital;
}
