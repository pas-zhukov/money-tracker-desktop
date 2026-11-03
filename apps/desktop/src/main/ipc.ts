import { app, dialog, ipcMain, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  currentPayPeriod,
  excelFilename,
  JournalError,
  NotFoundError,
  parseEntry,
  parseSavings,
  todayInZone,
  writeExcelReport,
  yearMonthStart,
  type EntryDraft,
  type EntryQuery,
  type AppSettings,
} from "@money-tracker/core";
import { SessionManager, UserVault } from "@money-tracker/db";

function wrap<T>(fn: () => Promise<T> | T): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ ok: true as const, data }))
    .catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    }));
}

export function registerIpc(session: SessionManager, onAutostartChange: (enabled: boolean) => void): void {
  ipcMain.handle("users:list", () => wrap(() => session.listUsers()));
  ipcMain.handle("users:create", (_e, username: string, password: string) =>
    wrap(async () => {
      await session.createAccount(username, password);
      return session.currentUser;
    }),
  );
  ipcMain.handle("users:login", (_e, username: string, password: string) =>
    wrap(async () => {
      await session.login(username, password);
      return session.currentUser;
    }),
  );
  ipcMain.handle("users:logout", () => wrap(() => session.logout()));
  ipcMain.handle("users:current", () => wrap(() => session.currentUser));
  ipcMain.handle("users:changePassword", (_e, oldP: string, newP: string) =>
    wrap(() => session.changePassword(oldP, newP)),
  );

  ipcMain.handle("journal:search", (_e, query: EntryQuery) => wrap(() => session.money.search(query)));
  ipcMain.handle("journal:create", (_e, draft: EntryDraft) => wrap(() => session.money.createEntry(draft)));
  ipcMain.handle("journal:update", (_e, id: string, draft: EntryDraft) =>
    wrap(() => session.money.updateEntry(id, draft)),
  );
  ipcMain.handle("journal:delete", (_e, id: string) => wrap(() => session.money.deleteEntry(id)));
  ipcMain.handle("journal:deleteLast", () => wrap(() => session.money.deleteLast()));
  ipcMain.handle("journal:summarize", (_e, from: string, to: string) =>
    wrap(() => session.money.summarize(from, to)),
  );
  ipcMain.handle("journal:cashflow", (_e, from: string, to: string) =>
    wrap(() => session.money.cashflow(from, to)),
  );
  ipcMain.handle("journal:expensesByCategory", (_e, query: EntryQuery) =>
    wrap(() => session.money.expensesByCategory(query)),
  );
  ipcMain.handle("journal:quickParse", (_e, text: string) =>
    wrap(() => {
      const settings = session.money.getAppSettings();
      const today = todayInZone(settings.timezone);
      const savings = parseSavings(text, today);
      if (savings.kind === "move") {
        return session.money.createEntry({
          type: savings.type,
          amount: savings.amount,
          description: savings.description,
          occurredOn: savings.occurredOn,
        });
      }
      if (savings.kind === "failure") throw new JournalError(savings.message);
      const parsed = parseEntry(text, today);
      if (!parsed.ok) throw new JournalError(parsed.message);
      return session.money.createEntry({
        type: parsed.type,
        amount: parsed.amount,
        description: parsed.description,
        occurredOn: parsed.occurredOn,
      });
    }),
  );

  ipcMain.handle("categories:list", () => wrap(() => session.money.categories()));
  ipcMain.handle("categories:active", (_e, type: "INCOME" | "EXPENSE") =>
    wrap(() => session.money.activeCategories(type)),
  );
  ipcMain.handle("categories:create", (_e, name: string, type: "INCOME" | "EXPENSE") =>
    wrap(() => session.money.createCategory(name, type)),
  );
  ipcMain.handle("categories:rename", (_e, id: string, name: string) =>
    wrap(() => session.money.renameCategory(id, name)),
  );
  ipcMain.handle("categories:archive", (_e, id: string) => wrap(() => session.money.archiveCategory(id)));
  ipcMain.handle("categories:restore", (_e, id: string) => wrap(() => session.money.restoreCategory(id)));

  ipcMain.handle("budget:month", (_e, ym: string) => wrap(() => session.money.monthBudget(ym)));
  ipcMain.handle("budget:available", (_e, ym: string) =>
    wrap(() => session.money.availableBudgetCategories(ym)),
  );
  ipcMain.handle("budget:add", (_e, ym: string, categoryId: string, amount: string) =>
    wrap(() => session.money.addBudget(ym, categoryId, amount)),
  );
  ipcMain.handle("budget:save", (_e, ym: string, amounts: Record<string, string>) =>
    wrap(() => session.money.saveBudgets(ym, amounts)),
  );
  ipcMain.handle("budget:copy", (_e, ym: string) => wrap(() => session.money.copyBudgetFromPrevious(ym)));
  ipcMain.handle("budget:series", (_e, from: string, to: string) =>
    wrap(() => session.money.plannedExpenseSeries(from, to)),
  );

  ipcMain.handle("balances:list", () => wrap(() => session.money.balanceAccounts()));
  ipcMain.handle("balances:create", (_e, name: string) =>
    wrap(() => {
      const settings = session.money.getAppSettings();
      return session.money.createBalanceAccount(name, todayInZone(settings.timezone));
    }),
  );
  ipcMain.handle("balances:rename", (_e, id: string, name: string) =>
    wrap(() => session.money.renameBalanceAccount(id, name)),
  );
  ipcMain.handle("balances:archive", (_e, id: string) => wrap(() => session.money.archiveBalanceAccount(id)));
  ipcMain.handle("balances:restore", (_e, id: string) => wrap(() => session.money.restoreBalanceAccount(id)));
  ipcMain.handle("balances:record", (_e, id: string, date: string, amount: string) =>
    wrap(() => session.money.recordBalance(id, date, amount)),
  );
  ipcMain.handle("balances:deleteSnapshot", (_e, id: string) =>
    wrap(() => session.money.deleteBalanceSnapshot(id)),
  );

  ipcMain.handle("settings:get", () =>
    wrap(() => ({
      payroll: session.money.getPayroll(),
      app: session.money.getAppSettings(),
    })),
  );
  ipcMain.handle(
    "settings:payroll",
    (_e, salaryDay: number, advanceDay: number, includeAdvance: boolean) =>
      wrap(() => session.money.updatePayroll(salaryDay, advanceDay, includeAdvance)),
  );
  ipcMain.handle("settings:app", (_e, patch: Partial<AppSettings>) =>
    wrap(() => {
      const next = session.money.updateAppSettings(patch);
      if (patch.autostart !== undefined) onAutostartChange(next.autostart);
      return next;
    }),
  );

  ipcMain.handle("periods:pay", () =>
    wrap(() => {
      const p = session.money.getPayroll();
      const settings = session.money.getAppSettings();
      const today = todayInZone(settings.timezone);
      return currentPayPeriod(today, p.salaryDay, p.advanceDay, p.includeAdvance);
    }),
  );
  ipcMain.handle("periods:today", () =>
    wrap(() => todayInZone(session.money.getAppSettings().timezone)),
  );

  ipcMain.handle("export:excel", async (_e, from: string, to: string) =>
    wrap(async () => {
      const summary = session.money.summarize(from, to);
      const entries = session.money.incomeAndExpenses(from, to);
      const bytes = await writeExcelReport(summary, entries, false);
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: excelFilename(from, to),
        filters: [{ name: "Excel", extensions: ["xlsx"] }],
      });
      if (canceled || !filePath) throw new JournalError("Сохранение отменено");
      await fs.writeFile(filePath, bytes);
      return filePath;
    }),
  );

  ipcMain.handle("backup:export", async () =>
    wrap(async () => {
      const bytes = await session.exportBackupV2();
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: session.backupFilename(),
        filters: [{ name: "Money Tracker Backup", extensions: ["mtbak"] }],
      });
      if (canceled || !filePath) throw new JournalError("Сохранение отменено");
      await fs.writeFile(filePath, bytes);
      return filePath;
    }),
  );

  ipcMain.handle("backup:import", async (_e, password?: string) =>
    wrap(async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        filters: [{ name: "Money Tracker Backup", extensions: ["mtbak"] }],
        properties: ["openFile"],
      });
      if (canceled || !filePaths[0]) throw new JournalError("Выбор файла отменён");
      const bytes = await fs.readFile(filePaths[0]);
      await session.importBackupFile(bytes, password);
      return true;
    }),
  );

  ipcMain.handle("persist", () => wrap(() => session.persist()));

  // silence unused
  void path;
  void yearMonthStart;
  void shell;
  void app;
  void NotFoundError;
}

export function createSession(): SessionManager {
  const dataDir = path.join(app.getPath("userData"), "data");
  return new SessionManager(new UserVault(dataDir));
}