import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { encodeLegacyBackup } from "@money-tracker/core";
import { MoneyStore } from "./store.js";
import { SessionManager } from "./session.js";
import { UserVault } from "./users.js";

describe("MoneyStore", () => {
  let dir: string;
  let store: MoneyStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mt-"));
    store = MoneyStore.open(path.join(dir, "t.db"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates entries and totals", () => {
    store.createCategory("Зарплата", "INCOME");
    const food = store.createCategory("Еда", "EXPENSE");
    store.createEntry({
      type: "INCOME",
      amount: "1000",
      description: "аванс",
      occurredOn: "2026-03-01",
    });
    store.createEntry({
      type: "EXPENSE",
      amount: "250",
      description: "кофе",
      occurredOn: "2026-03-02",
      categoryId: food.id,
    });
    const page = store.search({ from: "2026-03-01", to: "2026-03-31" });
    expect(page.totals.income).toBe("1000.00");
    expect(page.totals.expense).toBe("250.00");
    expect(page.totals.net).toBe("750.00");
  });

  it("savings do not affect cashflow totals", () => {
    store.createEntry({
      type: "TO_SAVINGS",
      amount: "500",
      description: "",
      occurredOn: "2026-03-01",
    });
    const page = store.search({ from: "2026-03-01", to: "2026-03-01" });
    expect(page.totals.income).toBe("0.00");
    expect(page.totals.expense).toBe("0.00");
    const summary = store.summarize("2026-03-01", "2026-03-01");
    expect(summary.savingsFlow.toSavings).toBe("500.00");
  });

  it("budgets and balance accounts", () => {
    const cat = store.createCategory("Еда", "EXPENSE");
    store.addBudget("2026-03", cat.id, "3000");
    store.createEntry({
      type: "EXPENSE",
      amount: "500",
      description: "обед",
      occurredOn: "2026-03-05",
      categoryId: cat.id,
    });
    const budget = store.monthBudget("2026-03");
    expect(budget.planTotal).toBe("3000.00");
    expect(budget.factTotal).toBe("500.00");

    const acc = store.createBalanceAccount("Тинькофф", "2026-01-01");
    store.recordBalance(acc.id, "2026-03-01", "12000");
    store.recordBalance(acc.id, "2026-03-01", "13000"); // upsert
    const list = store.balanceAccounts();
    expect(list[0]!.lastAmount).toBe("13000.00");
  });

  it("rejects legacy create", () => {
    expect(() =>
      store.createEntry({
        type: "TRANSFER" as never,
        amount: "1",
        description: "",
        occurredOn: "2026-03-01",
      }),
    ).toThrow(/не поддерживается/);
  });
});

describe("SessionManager backup", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mt-sess-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates user, exports v2, imports legacy", async () => {
    const vault = new UserVault(dir);
    const session = new SessionManager(vault);
    await session.createAccount("alice", "secret");
    session.money.createEntry({
      type: "EXPENSE",
      amount: "10",
      description: "x",
      occurredOn: "2026-03-01",
    });
    const v2 = await session.exportBackupV2();
    expect(v2.toString("utf8").startsWith("MTBAK2\n")).toBe(true);

    const legacyPayload = session.money.exportPayload();
    legacyPayload.version = 1;
    const legacy = encodeLegacyBackup(legacyPayload);
    await session.importBackupFile(Buffer.from(legacy));
    expect(session.money.search({}).totalElements).toBe(1);

    await session.logout();
    await session.login("alice", "secret");
    expect(session.money.search({}).totalElements).toBe(1);

    // restore v2 roundtrip after wipe via reimport
    await session.importBackupFile(v2);
    await session.logout();
  });
});