"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
  t: 1_000_000_000_000,
};

/** Parse money strings: 1k, 1.5m, 1b, 1,000,000 */
export function parseMoneyInput(input: string): number | null {
  const trimmed = input.trim().replace(/\s+/g, "");
  if (!trimmed) return null;

  const unitMatch = trimmed.match(/^([\d,]+(?:\.\d+)?)([kmbt])?$/i);
  if (!unitMatch) return null;

  const numStr = unitMatch[1].replace(/,/g, "");
  if (!numStr || !/^\d+(?:\.\d+)?$/.test(numStr)) return null;

  const base = parseFloat(numStr);
  if (!Number.isFinite(base)) return null;

  const suffix = unitMatch[2]?.toLowerCase() ?? "";
  const multiplier = suffix ? MULTIPLIERS[suffix] : 1;
  if (suffix && !multiplier) return null;

  return Math.round(base * multiplier);
}

/** Format number with thousand separators, e.g. 1000000 → 1,000,000 */
export function formatMoneyDisplay(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Math.round(value).toLocaleString("en-US");
}

interface MoneyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  min?: number;
  placeholder?: string;
}

export function MoneyInput({
  value,
  onChange,
  className,
  min = 1,
  placeholder = "100,000 或 100k",
}: MoneyInputProps) {
  const [text, setText] = useState(() => formatMoneyDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(formatMoneyDisplay(value));
    }
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = parseMoneyInput(raw);
        if (parsed !== null && parsed >= min) {
          onChange(parsed);
        }
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parseMoneyInput(text);
        const final = parsed !== null && parsed >= min ? parsed : value;
        onChange(final);
        setText(formatMoneyDisplay(final));
      }}
      className={cn(
        "w-full px-3 py-2 rounded-lg bg-[#0f1117] border border-[#2a2d3a] text-[#e1e4ea] font-data text-sm focus:border-[#3b82f6] focus:outline-none",
        className
      )}
    />
  );
}
