import { addDays, daysBetweenInclusive, parseIsoDate, toYearMonth, yearMonthEnd, yearMonthStart } from "./dates.js";
import { add, money, signum, sub } from "./money.js";
import type { CashflowCrossing, CashflowPoint } from "./types.js";

export const DAILY_LIMIT = 62;

export function useMonthly(from: string, to: string): boolean {
  return daysBetweenInclusive(from, to) > DAILY_LIMIT;
}

export function cumulative(points: CashflowPoint[]): CashflowPoint[] {
  let income = "0.00";
  let expense = "0.00";
  return points.map((point) => {
    income = add(income, point.income);
    expense = add(expense, point.expense);
    return { date: point.date, income, expense };
  });
}

export function crossings(cum: CashflowPoint[]): CashflowCrossing[] {
  const found: CashflowCrossing[] = [];
  for (let index = 0; index < cum.length; index++) {
    const point = cum[index]!;
    const gap = sub(point.income, point.expense);
    if (signum(gap) === 0 && signum(point.income) > 0) {
      found.push({ from: point.date, to: null, amount: point.income, share: "0" });
      continue;
    }
    if (index + 1 >= cum.length || signum(gap) === 0) continue;
    const next = cum[index + 1]!;
    const nextGap = sub(next.income, next.expense);
    if (signum(nextGap) === 0 || signum(gap) === signum(nextGap)) continue;
    const gapN = Number(gap);
    const nextGapN = Number(nextGap);
    const share = gapN / (gapN - nextGapN);
    const amount = money(
      Number(point.income) + (Number(next.income) - Number(point.income)) * share,
    );
    found.push({ from: point.date, to: next.date, amount, share: String(share) });
  }
  return found;
}

export function cashflowPoints(
  from: string,
  to: string,
  income: Map<string, string>,
  expense: Map<string, string>,
): CashflowPoint[] {
  if (useMonthly(from, to)) {
    return months(from, to, income, expense);
  }
  const points: CashflowPoint[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    points.push({
      date: day,
      income: money(income.get(day)),
      expense: money(expense.get(day)),
    });
  }
  return points;
}

function months(
  from: string,
  to: string,
  income: Map<string, string>,
  expense: Map<string, string>,
): CashflowPoint[] {
  const points: CashflowPoint[] = [];
  let ym = toYearMonth(from);
  const last = toYearMonth(to);
  while (ym <= last) {
    const start = yearMonthStart(ym);
    const end = yearMonthEnd(ym);
    const pointStart = start < from ? from : start;
    let inn = "0.00";
    let out = "0.00";
    for (let day = start; day <= end; day = addDays(day, 1)) {
      inn = add(inn, money(income.get(day)));
      out = add(out, money(expense.get(day)));
    }
    points.push({ date: pointStart, income: inn, expense: out });
    const { y, m } = parseIsoDate(start);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return points;
}