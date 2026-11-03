import { addDays, isoDate } from "./dates.js";
import type { ActiveEntryType } from "./types.js";

export const AMOUNT_HINT = "Не понял сумму. Пример: 250 кофе";
export const DATE_HINT = "Не понял дату. Пример: 13.10 или вчера";

export type ParseResult =
  | { ok: true; type: ActiveEntryType; amount: string; description: string; occurredOn: string }
  | { ok: false; message: string };

export type DateParse =
  | { ok: true; date: string }
  | { ok: false; message: string };

const NUMERIC_DATE = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s+(\S[\s\S]*)$/;

function looksLikeAmount(text: string): boolean {
  return /^[+-]?\s*\d[\s\S]*$/.test(text);
}

function parseAmount(body: string, date: string): ParseResult {
  let source = body.trim();
  let type: ActiveEntryType = "EXPENSE";
  if (source.startsWith("+")) {
    type = "INCOME";
    source = source.slice(1).trim();
  } else if (source.startsWith("-")) {
    source = source.slice(1).trim();
  }
  if (!source || !/\d/.test(source[0]!)) {
    return { ok: false, message: AMOUNT_HINT };
  }

  let rawNumber = "";
  let dot = false;
  let fraction = 0;
  let index = 0;
  while (index < source.length) {
    const current = source[index]!;
    if (/\d/.test(current)) {
      rawNumber += current;
      if (dot) fraction++;
      index++;
      continue;
    }
    if (
      current === " " &&
      !dot &&
      index > 0 &&
      /\d/.test(source[index - 1]!) &&
      index + 1 < source.length &&
      /\d/.test(source[index + 1]!)
    ) {
      rawNumber += " ";
      index++;
      continue;
    }
    if ((current === "," || current === ".") && !dot) {
      rawNumber += ".";
      dot = true;
      index++;
      continue;
    }
    break;
  }
  if (fraction > 2 || !rawNumber || rawNumber.endsWith(".")) {
    if (fraction > 2) {
      return { ok: false, message: "Сумма: не больше двух знаков после запятой" };
    }
    return { ok: false, message: AMOUNT_HINT };
  }

  const dotAt = rawNumber.indexOf(".");
  let integer = dotAt < 0 ? rawNumber : rawNumber.slice(0, dotAt);
  if (integer.includes(" ") && !/^\d{1,3}(?: \d{3})+$/.test(integer)) {
    return { ok: false, message: AMOUNT_HINT };
  }
  integer = integer.replace(/ /g, "");
  if (!integer || integer.length > 15) {
    return { ok: false, message: AMOUNT_HINT };
  }
  const number = dotAt < 0 ? integer : integer + rawNumber.slice(dotAt);
  const amountNum = Number(number);
  if (!Number.isFinite(amountNum)) {
    return { ok: false, message: AMOUNT_HINT };
  }
  if (amountNum <= 0) {
    return { ok: false, message: "Сумма должна быть больше нуля" };
  }
  const amount = amountNum.toFixed(2);
  const description = source.slice(index).trim();
  if (description.length > 500) {
    return { ok: false, message: "Описание: не длиннее 500 символов" };
  }
  return { ok: true, type, amount, description, occurredOn: date };
}

export function parseEntry(raw: string | null | undefined, today: string): ParseResult {
  if (raw == null || !String(raw).trim()) {
    return { ok: false, message: AMOUNT_HINT };
  }
  const text = String(raw).replace(/\u00A0/g, " ").trim();
  const lower = text.toLocaleLowerCase("ru");
  for (const word of ["сегодня", "вчера"] as const) {
    if (lower === word || lower.startsWith(word + " ")) {
      const rest = text.slice(word.length).trim();
      if (rest && looksLikeAmount(rest)) {
        const date = word === "сегодня" ? today : addDays(today, -1);
        return parseAmount(rest, date);
      }
      break;
    }
  }

  const dateMatch = NUMERIC_DATE.exec(text);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const yearText = dateMatch[3];
    const rest = dateMatch[4]!.trim();
    if (month >= 1 && month <= 12 && looksLikeAmount(rest)) {
      const year = yearText == null ? Number(today.slice(0, 4)) : Number(yearText);
      if (year < 2000 || year > 2100) {
        return { ok: false, message: DATE_HINT };
      }
      try {
        const date = isoDate(year, month, day);
        const check = new Date(Date.UTC(year, month - 1, day));
        if (
          check.getUTCFullYear() !== year ||
          check.getUTCMonth() + 1 !== month ||
          check.getUTCDate() !== day
        ) {
          return { ok: false, message: DATE_HINT };
        }
        return parseAmount(rest, date);
      } catch {
        return { ok: false, message: DATE_HINT };
      }
    }
  }
  return parseAmount(text, today);
}

export function parseDateOnly(raw: string | null | undefined, today: string): DateParse {
  if (raw == null || !String(raw).trim()) {
    return { ok: false, message: DATE_HINT };
  }
  const text = String(raw).replace(/\u00A0/g, " ").trim();
  const lower = text.toLocaleLowerCase("ru");
  if (lower === "сегодня") return { ok: true, date: today };
  if (lower === "вчера") return { ok: true, date: addDays(today, -1) };
  const m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/.exec(lower);
  if (!m) return { ok: false, message: DATE_HINT };
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3] == null ? Number(today.slice(0, 4)) : Number(m[3]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    return { ok: false, message: DATE_HINT };
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return { ok: false, message: DATE_HINT };
  }
  return { ok: true, date: isoDate(year, month, day) };
}