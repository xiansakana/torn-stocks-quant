/** Format money with thousand separators, e.g. 1234567.8 → 1,234,567.80 */
export function formatMoney(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Signed money, e.g. +1,234.56 / -500.00 */
export function formatMoneySigned(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "-";
  const prefix = value >= 0 ? "+" : "";
  return prefix + formatMoney(value, decimals);
}

/** Whole-number money (no decimals), e.g. for initial capital display */
export function formatMoneyCompact(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString("en-US");
}
