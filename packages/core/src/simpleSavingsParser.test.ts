import { describe, expect, it } from "vitest";
import { parseSavings } from "./simpleSavingsParser.js";

describe("SimpleSavingsParser", () => {
  it("parses deposit withdrawal and date prefix", () => {
    expect(parseSavings("в накопления 5000", "2026-03-15")).toEqual({
      kind: "move",
      type: "TO_SAVINGS",
      amount: "5000.00",
      description: "",
      occurredOn: "2026-03-15",
    });
    expect(parseSavings("из накоплений 2000 отпуск", "2026-03-15")).toMatchObject({
      kind: "move",
      type: "FROM_SAVINGS",
      amount: "2000.00",
      description: "отпуск",
    });
    expect(parseSavings("вчера в накопления 100", "2026-03-15")).toMatchObject({
      kind: "move",
      occurredOn: "2026-03-14",
    });
  });

  it("leaves ordinary text and reports bad amount", () => {
    expect(parseSavings("250 кофе", "2026-03-15")).toEqual({ kind: "none" });
    expect(parseSavings("в накопления", "2026-03-15").kind).toBe("failure");
  });
});