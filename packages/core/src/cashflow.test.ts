import { describe, expect, it } from "vitest";
import { cashflowPoints, crossings, cumulative } from "./cashflow.js";

describe("Cashflow", () => {
  it("builds daily points and cumulative", () => {
    const income = new Map([["2026-03-01", "100.00"]]);
    const expense = new Map([["2026-03-02", "40.00"]]);
    const points = cashflowPoints("2026-03-01", "2026-03-03", income, expense);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ date: "2026-03-01", income: "100.00", expense: "0.00" });
    const cum = cumulative(points);
    expect(cum[2]!.income).toBe("100.00");
    expect(cum[2]!.expense).toBe("40.00");
  });

  it("finds crossings", () => {
    const cum = [
      { date: "2026-03-01", income: "0.00", expense: "10.00" },
      { date: "2026-03-02", income: "20.00", expense: "10.00" },
    ];
    const found = crossings(cum);
    expect(found.length).toBeGreaterThan(0);
  });
});