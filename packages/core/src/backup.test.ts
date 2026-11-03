import { describe, expect, it } from "vitest";
import {
  decodeLegacyBackup,
  encodeLegacyBackup,
  type BackupPayload,
} from "./backup.js";

function sample(): BackupPayload {
  return {
    format: "money-tracker-backup",
    version: 1,
    exportedAt: "2026-03-15T10:00:00Z",
    accounts: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Наличные",
        openingBalance: "0.00",
        kind: "SPENDING",
        openedOn: "2026-01-01",
        defaultAccount: true,
        archived: false,
      },
    ],
    categories: [],
    transactions: [],
    payrollSettings: [
      {
        id: "33333333-3333-3333-3333-333333333333",
        salaryDay: 6,
        advanceDay: 21,
        includeAdvance: false,
      },
    ],
    balanceAccounts: [],
    balanceSnapshots: [],
    expenseBudgets: [],
  };
}

describe("BackupCodec", () => {
  it("round trips and hides plaintext payload", () => {
    const encoded = encodeLegacyBackup(sample());
    const text = new TextDecoder().decode(encoded);
    expect(text.startsWith("MTBAK1\n")).toBe(true);
    expect(text.includes("Наличные")).toBe(false);
    const decoded = decodeLegacyBackup(encoded);
    expect(decoded.accounts[0]!.name).toBe("Наличные");
  });

  it("rejects broken files", () => {
    expect(() => decodeLegacyBackup(new TextEncoder().encode(""))).toThrow();
    expect(() => decodeLegacyBackup(new TextEncoder().encode("NOPE\nabc"))).toThrow();
  });
});