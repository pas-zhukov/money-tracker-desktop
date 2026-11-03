/** Thin typed accessors; window.api is injected by Electron preload. */

export function api() {
  if (!window.api) {
    throw new Error("API недоступен вне Electron");
  }
  return window.api;
}

export function formatMoney(value: string | number): string {
  const n = Number(value);
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function firstDay(ym: string): string {
  return `${ym}-01`;
}

export function lastDay(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${ym}-${String(d).padStart(2, "0")}`;
}