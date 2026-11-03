import { addDays, isoDate } from "./dates.js";
import { AMOUNT_HINT, DATE_HINT, parseEntry } from "./entryParser.js";
import type { ActiveEntryType } from "./types.js";

const TO = "в накопления";
const FROM = "из накоплений";
const NUMERIC_DATE = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s+(\S[\s\S]*)$/;

export type SavingsCommand =
  | { kind: "none" }
  | { kind: "failure"; message: string }
  | {
      kind: "move";
      type: "TO_SAVINGS" | "FROM_SAVINGS";
      amount: string;
      description: string;
      occurredOn: string;
    };

function phrase(text: string, p: string): boolean {
  const lower = text.toLocaleLowerCase("ru");
  return lower === p || lower.startsWith(p + " ");
}

function isSavings(text: string): boolean {
  return phrase(text, TO) || phrase(text, FROM);
}

function move(text: string, date: string): SavingsCommand {
  const type: ActiveEntryType = phrase(text, TO) ? "TO_SAVINGS" : "FROM_SAVINGS";
  const phraseText = type === "TO_SAVINGS" ? TO : FROM;
  const rest = text.slice(phraseText.length).trim();
  if (!rest) return { kind: "failure", message: AMOUNT_HINT };
  const parsed = parseEntry(rest, date);
  if (!parsed.ok) return { kind: "failure", message: parsed.message };
  return {
    kind: "move",
    type,
    amount: parsed.amount,
    description: parsed.description,
    occurredOn: parsed.occurredOn,
  };
}

export function parseSavings(raw: string | null | undefined, today: string | null): SavingsCommand {
  if (raw == null || !String(raw).trim() || today == null) {
    return { kind: "none" };
  }
  const text = String(raw).replace(/\u00A0/g, " ").trim();
  const lower = text.toLocaleLowerCase("ru");
  for (const word of ["сегодня", "вчера"] as const) {
    if (lower === word || lower.startsWith(word + " ")) {
      const rest = text.slice(word.length).trim();
      if (!isSavings(rest)) return { kind: "none" };
      const date = word === "сегодня" ? today : addDays(today, -1);
      return move(rest, date);
    }
  }
  const dateMatch = NUMERIC_DATE.exec(text);
  if (dateMatch && isSavings(dateMatch[4]!.trim())) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const yearText = dateMatch[3];
    if (month < 1 || month > 12) return { kind: "failure", message: DATE_HINT };
    const year = yearText == null ? Number(today.slice(0, 4)) : Number(yearText);
    if (year < 2000 || year > 2100) return { kind: "failure", message: DATE_HINT };
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() + 1 !== month ||
      check.getUTCDate() !== day
    ) {
      return { kind: "failure", message: DATE_HINT };
    }
    return move(dateMatch[4]!.trim(), isoDate(year, month, day));
  }
  if (!isSavings(text)) return { kind: "none" };
  return move(text, today);
}