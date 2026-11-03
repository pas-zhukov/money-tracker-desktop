import { describe, expect, it } from "vitest";
import { adjustPayday, currentPayPeriod, paydayInMonth } from "./payPeriod.js";

describe("PayPeriod", () => {
  it("salary only", () => {
    const range = currentPayPeriod("2026-03-10", 6, 21, false);
    expect(range.from).toBe("2026-03-06");
    expect(range.to).toBe("2026-04-05");
  });

  it("with advance", () => {
    // 21.03.2026 — суббота → выплата 20.03, конец периода 19.03
    const range = currentPayPeriod("2026-03-10", 6, 21, true);
    expect(range.from).toBe("2026-03-06");
    expect(range.to).toBe("2026-03-19");
  });

  it("weekend to friday", () => {
    // 2026-06-06 is Saturday
    expect(adjustPayday("2026-06-06")).toBe("2026-06-05");
    expect(adjustPayday("2026-06-07")).toBe("2026-06-05");
  });

  it("clamps february 31", () => {
    expect(paydayInMonth(2026, 2, 31)).toBe("2026-02-27"); // 28 sat -> fri 27
  });
});