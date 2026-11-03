import { describe, expect, it } from "vitest";
import { parseDateOnly, parseEntry } from "./entryParser.js";

describe("EntryParser", () => {
  it("parses expense with description", () => {
    const r = parseEntry("250 кофе", "2026-03-15");
    expect(r).toEqual({
      ok: true,
      type: "EXPENSE",
      amount: "250.00",
      description: "кофе",
      occurredOn: "2026-03-15",
    });
  });

  it("parses signed amounts and decimal separators", () => {
    expect(parseEntry("+80 000 зарплата", "2026-03-15")).toMatchObject({
      ok: true,
      type: "INCOME",
      amount: "80000.00",
    });
    expect(parseEntry("-12,5 обед", "2026-03-15")).toMatchObject({
      ok: true,
      type: "EXPENSE",
      amount: "12.50",
    });
    expect(parseEntry("1.5 чай", "2026-03-15")).toMatchObject({
      ok: true,
      amount: "1.50",
    });
  });

  it("parses date prefix", () => {
    expect(parseEntry("вчера 100 такси", "2026-03-15")).toMatchObject({
      ok: true,
      occurredOn: "2026-03-14",
    });
    expect(parseEntry("сегодня +500 бонус", "2026-03-15")).toMatchObject({
      ok: true,
      type: "INCOME",
      occurredOn: "2026-03-15",
    });
    expect(parseEntry("13.10 40 метро", "2026-03-15")).toMatchObject({
      ok: true,
      occurredOn: "2026-10-13",
    });
    expect(parseEntry("13.10.2025 40 метро", "2026-03-15")).toMatchObject({
      ok: true,
      occurredOn: "2025-10-13",
    });
  });

  it("rejects garbage and invalid dates", () => {
    expect(parseEntry("кофе", "2026-03-15").ok).toBe(false);
    expect(parseEntry("0 кофе", "2026-03-15").ok).toBe(false);
    expect(parseEntry("31.02.2026 10", "2026-03-15").ok).toBe(false);
    expect(parseDateOnly("завтра", "2026-03-15").ok).toBe(false);
    expect(parseDateOnly("32.01", "2026-03-15").ok).toBe(false);
    expect(parseDateOnly("вчера", "2026-03-15")).toEqual({ ok: true, date: "2026-03-14" });
  });
});