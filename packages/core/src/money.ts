import { JournalError } from "./errors.js";
import type { MoneyTotals, SavingsFlow } from "./types.js";

export function money(value: string | number | null | undefined): string {
  if (value == null || value === "") return "0.00";
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return "0.00";
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function add(a: string, b: string): string {
  return money((Number(a) * 100 + Number(b) * 100) / 100);
}

export function sub(a: string, b: string): string {
  return money((Number(a) * 100 - Number(b) * 100) / 100);
}

export function neg(a: string): string {
  return money(-Number(a));
}

export function cmp(a: string, b: string): number {
  return Math.round(Number(a) * 100) - Math.round(Number(b) * 100);
}

export function signum(a: string): number {
  const n = Number(a);
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

export function totalsOf(income?: string | null, expense?: string | null): MoneyTotals {
  const i = money(income);
  const e = money(expense);
  return { income: i, expense: e, net: sub(i, e) };
}

export function savingsOf(toSavings?: string | null, fromSavings?: string | null): SavingsFlow {
  const to = money(toSavings);
  const from = money(fromSavings);
  return { toSavings: to, fromSavings: from, net: sub(to, from) };
}

export function parsePositiveAmount(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") {
    throw new JournalError("Укажите сумму");
  }
  const text = String(raw).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new JournalError("Укажите сумму");
  }
  const parts = text.split(".");
  if (parts[1] && parts[1].length > 2) {
    throw new JournalError("Сумма: не больше двух знаков после запятой");
  }
  const amount = money(text);
  if (signum(amount) <= 0) {
    throw new JournalError("Сумма должна быть больше нуля");
  }
  return amount;
}

export function parseNonNegativeAmount(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") {
    throw new JournalError("Укажите сумму");
  }
  const text = String(raw).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new JournalError("Укажите сумму");
  }
  const parts = text.split(".");
  if (parts[1] && parts[1].length > 2) {
    throw new JournalError("Сумма: не больше двух знаков после запятой");
  }
  const amount = money(text);
  if (signum(amount) < 0) {
    throw new JournalError("Остаток не может быть отрицательным");
  }
  return amount;
}

export function cleanName(name: string | null | undefined, label = "название"): string {
  if (name == null || !String(name).trim()) {
    throw new JournalError(`Укажите ${label}`);
  }
  const cleaned = String(name).trim().replace(/\s+/g, " ");
  if (cleaned.length > 100) {
    throw new JournalError("Название: не длиннее 100 символов");
  }
  return cleaned;
}