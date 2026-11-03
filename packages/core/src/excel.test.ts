import { describe, expect, it } from "vitest";
import { excelFilename, writeExcelReport } from "./excel.js";

describe("ExcelReport", () => {
  it("builds workbook with summary and operations sheets", async () => {
    expect(excelFilename("2026-03-01", "2026-03-31")).toBe(
      "доходы-расходы_2026-03-01_2026-03-31.xlsx",
    );
    const bytes = await writeExcelReport(
      {
        from: "2026-03-01",
        to: "2026-03-31",
        totals: { income: "100.00", expense: "40.00", net: "60.00" },
        savingsFlow: { toSavings: "10.00", fromSavings: "0.00", net: "10.00" },
        byCategory: [
          { categoryId: "1", name: "Еда", type: "EXPENSE", amount: "40.00" },
        ],
        byAccount: [],
      },
      [
        {
          id: "t1",
          type: "EXPENSE",
          amount: "40.00",
          description: "обед",
          occurredOn: "2026-03-02",
          accountId: "a",
          accountName: "Наличные",
          counterAccountId: null,
          counterAccountName: null,
          categoryId: "1",
          categoryName: "Еда",
          locked: false,
          createdAt: "",
          updatedAt: "",
        },
      ],
      false,
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // xlsx zip signature
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});