import { dayOfWeekUtc, daysInMonth, isoDate, parseIsoDate } from "./dates.js";

export interface PayRange {
  from: string;
  to: string;
}

export function adjustPayday(date: string): string {
  const dow = dayOfWeekUtc(date); // 0 Sun .. 6 Sat
  if (dow === 6) return shift(date, -1);
  if (dow === 0) return shift(date, -2);
  return date;
}

function shift(date: string, days: number): string {
  const { y, m, d } = parseIsoDate(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function paydayInMonth(year: number, month: number, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  return adjustPayday(isoDate(year, month, day));
}

function paydaysInMonth(
  year: number,
  month: number,
  salaryDay: number,
  advanceDay: number,
  includeAdvance: boolean,
): string[] {
  if (!includeAdvance) {
    return [paydayInMonth(year, month, salaryDay)];
  }
  const first = paydayInMonth(year, month, Math.min(salaryDay, advanceDay));
  const second = paydayInMonth(year, month, Math.max(salaryDay, advanceDay));
  return first === second ? [first] : [first, second];
}

function shiftMonth(year: number, month: number, delta: number): { y: number; m: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

function lastPaydayOnOrBefore(
  today: string,
  salaryDay: number,
  advanceDay: number,
  includeAdvance: boolean,
): string {
  const { y, m } = parseIsoDate(today);
  for (let i = 0; i < 4; i++) {
    const { y: yy, m: mm } = shiftMonth(y, m, -i);
    const dates = paydaysInMonth(yy, mm, salaryDay, advanceDay, includeAdvance);
    for (let index = dates.length - 1; index >= 0; index--) {
      const payday = dates[index]!;
      if (payday <= today) return payday;
    }
  }
  throw new Error(`Не найдена выплата до ${today}`);
}

function nextPaydayAfter(
  after: string,
  salaryDay: number,
  advanceDay: number,
  includeAdvance: boolean,
): string {
  const { y, m } = parseIsoDate(after);
  for (let i = 0; i < 4; i++) {
    const { y: yy, m: mm } = shiftMonth(y, m, i);
    for (const payday of paydaysInMonth(yy, mm, salaryDay, advanceDay, includeAdvance)) {
      if (payday > after) return payday;
    }
  }
  throw new Error(`Не найдена выплата после ${after}`);
}

export function currentPayPeriod(
  today: string,
  salaryDay: number,
  advanceDay: number,
  includeAdvance: boolean,
): PayRange {
  const start = lastPaydayOnOrBefore(today, salaryDay, advanceDay, includeAdvance);
  const next = nextPaydayAfter(start, salaryDay, advanceDay, includeAdvance);
  return { from: start, to: shift(next, -1) };
}