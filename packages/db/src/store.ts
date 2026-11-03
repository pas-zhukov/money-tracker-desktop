import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  type Account,
  type AccountView,
  type ActiveEntryType,
  type AppSettings,
  type BackupPayload,
  type BalanceAccountStatus,
  type BalanceSnapshotView,
  type BudgetLine,
  type CategoryView,
  type EntryDraft,
  type EntryPage,
  type EntryQuery,
  type EntryView,
  type ExpenseBudget,
  type MonthBudget,
  type PeriodSummary,
  type PayrollSettings,
  type Transaction,
  type TransactionType,
  DEFAULT_APP_SETTINGS,
  DEFAULT_PAGE_SIZE,
  JournalError,
  MAX_PAGE_SIZE,
  NotFoundError,
  add,
  cashflowPoints,
  cleanName,
  cmp,
  entitiesToPayload,
  isLegacyType,
  isSavingsType,
  money,
  parseNonNegativeAmount,
  parsePositiveAmount,
  savingsOf,
  signum,
  sub,
  toYearMonth,
  totalsOf,
  validateBackupPayload,
  yearMonthEnd,
  yearMonthStart,
  previousMonth,
  daysInMonth,
  parseIsoDate,
  addDays,
  compareIso,
} from "@money-tracker/core";
import { migrate } from "./schema.js";

type Db = Database.Database;

function bool(v: number | boolean): boolean {
  return Boolean(v);
}

export class MoneyStore {
  constructor(private readonly db: Db) {
    migrate(db);
  }

  static open(filePath: string): MoneyStore {
    const db = new Database(filePath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return new MoneyStore(db);
  }

  close(): void {
    this.db.close();
  }

  // ─── helpers ───────────────────────────────────────────────

  private nowIso(): string {
    return new Date().toISOString();
  }

  private defaultAccountId(): string {
    const row = this.db
      .prepare(
        `SELECT id FROM accounts WHERE is_default = 1 AND archived = 0 LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    if (!row) throw new JournalError("Нет счёта по умолчанию");
    return row.id;
  }

  private getAccount(id: string) {
    const row = this.db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new NotFoundError("Счёт не найден");
    return row;
  }

  private getCategory(id: string) {
    const row = this.db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new NotFoundError("Категория не найдена");
    return row;
  }

  private getTransaction(id: string) {
    const row = this.db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new NotFoundError("Запись не найдена");
    return row;
  }

  private toEntryView(row: Record<string, unknown>): EntryView {
    const account = this.getAccount(String(row.account_id));
    let counterName: string | null = null;
    if (row.counter_account_id) {
      counterName = String(this.getAccount(String(row.counter_account_id)).name);
    }
    let categoryName: string | null = null;
    if (row.category_id) {
      const cat = this.db
        .prepare(`SELECT name FROM categories WHERE id = ?`)
        .get(String(row.category_id)) as { name: string } | undefined;
      categoryName = cat?.name ?? null;
    }
    const type = row.type as TransactionType;
    return {
      id: String(row.id),
      type,
      amount: money(String(row.amount)),
      description: String(row.description),
      occurredOn: String(row.occurred_on),
      accountId: String(row.account_id),
      accountName: String(account.name),
      counterAccountId: row.counter_account_id ? String(row.counter_account_id) : null,
      counterAccountName: counterName,
      categoryId: row.category_id ? String(row.category_id) : null,
      categoryName,
      locked: isLegacyType(type),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private normalizeAmount(raw: string): string {
    return parsePositiveAmount(raw);
  }

  private resolveCategory(
    categoryId: string | null | undefined,
    type: TransactionType,
    currentId?: string | null,
  ): string | null {
    if (categoryId === undefined) return currentId ?? null;
    if (categoryId == null || categoryId === "") return null;
    const cat = this.getCategory(categoryId);
    if (bool(cat.archived as number)) throw new JournalError("Категория в архиве");
    if (cat.type !== type) throw new JournalError("Категория не подходит к типу операции");
    return String(cat.id);
  }

  private applyDraft(draft: EntryDraft, existing?: Record<string, unknown>): {
    type: ActiveEntryType;
    amount: string;
    description: string;
    occurredOn: string;
    accountId: string;
    categoryId: string | null;
  } {
    if (!draft.type) throw new JournalError("Укажите тип операции");
    if (!draft.occurredOn) throw new JournalError("Укажите дату");
    if (isLegacyType(draft.type)) {
      throw new JournalError("Этот тип записи больше не поддерживается");
    }
    if (existing && isLegacyType(existing.type as TransactionType)) {
      throw new JournalError("Эту запись нельзя изменить");
    }
    if (existing) {
      const oldType = existing.type as TransactionType;
      const sameGroup =
        (["INCOME", "EXPENSE"].includes(oldType) &&
          ["INCOME", "EXPENSE"].includes(draft.type)) ||
        (isSavingsType(oldType) && isSavingsType(draft.type));
      if (oldType !== draft.type && !sameGroup) {
        throw new JournalError("Тип записи менять нельзя");
      }
    }
    const amount = this.normalizeAmount(draft.amount);
    const description = (draft.description ?? "").trim();
    if (description.length > 500) {
      throw new JournalError("Описание: не длиннее 500 символов");
    }
    let accountId = draft.accountId || (existing ? String(existing.account_id) : null);
    if (!accountId) accountId = this.defaultAccountId();
    const account = this.getAccount(accountId);
    if (bool(account.archived as number)) throw new JournalError("Счёт в архиве");

    let categoryId: string | null = null;
    if (draft.type === "INCOME" || draft.type === "EXPENSE") {
      categoryId = this.resolveCategory(
        draft.categoryId,
        draft.type,
        existing?.category_id ? String(existing.category_id) : null,
      );
    }

    return {
      type: draft.type,
      amount,
      description,
      occurredOn: draft.occurredOn,
      accountId,
      categoryId,
    };
  }

  // ─── entries ───────────────────────────────────────────────

  createEntry(draft: EntryDraft): EntryView {
    const applied = this.applyDraft(draft);
    const id = randomUUID();
    const now = this.nowIso();
    this.db
      .prepare(
        `INSERT INTO transactions
         (id, type, amount, description, occurred_on, account_id, counter_account_id, category_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      )
      .run(
        id,
        applied.type,
        applied.amount,
        applied.description,
        applied.occurredOn,
        applied.accountId,
        applied.categoryId,
        now,
        now,
      );
    return this.toEntryView(this.getTransaction(id));
  }

  updateEntry(id: string, draft: EntryDraft): EntryView {
    const existing = this.getTransaction(id);
    const applied = this.applyDraft(draft, existing);
    const now = this.nowIso();
    this.db
      .prepare(
        `UPDATE transactions SET type=?, amount=?, description=?, occurred_on=?, account_id=?,
         counter_account_id=NULL, category_id=?, updated_at=? WHERE id=?`,
      )
      .run(
        applied.type,
        applied.amount,
        applied.description,
        applied.occurredOn,
        applied.accountId,
        applied.categoryId,
        now,
        id,
      );
    return this.toEntryView(this.getTransaction(id));
  }

  deleteEntry(id: string): void {
    const info = this.db.prepare(`DELETE FROM transactions WHERE id = ?`).run(id);
    if (info.changes === 0) throw new NotFoundError("Запись не найдена");
  }

  deleteLast(): EntryView {
    const row = this.db
      .prepare(`SELECT * FROM transactions ORDER BY created_at DESC, id DESC LIMIT 1`)
      .get() as Record<string, unknown> | undefined;
    if (!row) throw new JournalError("Удалять нечего");
    const view = this.toEntryView(row);
    this.db.prepare(`DELETE FROM transactions WHERE id = ?`).run(String(row.id));
    return view;
  }

  getEntry(id: string): EntryView {
    return this.toEntryView(this.getTransaction(id));
  }

  search(query: EntryQuery): EntryPage {
    let size = !query.size || query.size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(query.size, MAX_PAGE_SIZE);
    let page = Math.max(query.page ?? 0, 0);
    const { where, params } = this.buildFilter(query);

    const totalElements = (
      this.db.prepare(`SELECT COUNT(*) AS c FROM transactions t WHERE ${where}`).get(...params) as {
        c: number;
      }
    ).c;
    let totalPages = Math.max(1, Math.ceil(totalElements / size));
    if (totalElements === 0) totalPages = 0;
    if (page > 0 && totalPages > 0 && page >= totalPages) page = totalPages - 1;

    const items = (
      this.db
        .prepare(
          `SELECT t.* FROM transactions t WHERE ${where}
           ORDER BY t.occurred_on DESC, t.created_at DESC
           LIMIT ? OFFSET ?`,
        )
        .all(...params, size, page * size) as Record<string, unknown>[]
    ).map((r) => this.toEntryView(r));

    const sums = this.db
      .prepare(
        `SELECT type, SUM(CAST(amount AS REAL)) AS s FROM transactions t
         WHERE ${where} AND type IN ('INCOME','EXPENSE') GROUP BY type`,
      )
      .all(...params) as Array<{ type: string; s: number }>;
    let income = "0.00";
    let expense = "0.00";
    for (const s of sums) {
      if (s.type === "INCOME") income = money(s.s);
      if (s.type === "EXPENSE") expense = money(s.s);
    }

    return {
      items,
      page,
      size,
      totalElements,
      totalPages,
      totals: totalsOf(income, expense),
    };
  }

  private buildFilter(query: EntryQuery): { where: string; params: unknown[] } {
    const parts: string[] = ["1=1"];
    const params: unknown[] = [];
    if (query.from) {
      parts.push("t.occurred_on >= ?");
      params.push(query.from);
    }
    if (query.to) {
      parts.push("t.occurred_on <= ?");
      params.push(query.to);
    }
    if (query.type) {
      parts.push("t.type = ?");
      params.push(query.type);
    }
    if (query.accountId) {
      parts.push("t.account_id = ?");
      params.push(query.accountId);
    }
    if (query.withoutCategory) {
      parts.push("t.category_id IS NULL");
    } else if (query.categoryId) {
      parts.push("t.category_id = ?");
      params.push(query.categoryId);
    }
    if (query.text && query.text.trim()) {
      parts.push("LOWER(t.description) LIKE ?");
      params.push(`%${query.text.trim().toLowerCase()}%`);
    }
    return { where: parts.join(" AND "), params };
  }

  incomeAndExpenses(from: string, to: string): EntryView[] {
    this.assertPeriod(from, to);
    const rows = this.db
      .prepare(
        `SELECT * FROM transactions
         WHERE occurred_on >= ? AND occurred_on <= ?
           AND type IN ('INCOME','EXPENSE','TO_SAVINGS','FROM_SAVINGS')
         ORDER BY occurred_on DESC, created_at DESC`,
      )
      .all(from, to) as Record<string, unknown>[];
    return rows.map((r) => this.toEntryView(r));
  }

  cashflow(from: string, to: string) {
    this.assertPeriod(from, to);
    const rows = this.db
      .prepare(
        `SELECT occurred_on, type, SUM(CAST(amount AS REAL)) AS s
         FROM transactions
         WHERE occurred_on >= ? AND occurred_on <= ? AND type IN ('INCOME','EXPENSE')
         GROUP BY occurred_on, type`,
      )
      .all(from, to) as Array<{ occurred_on: string; type: string; s: number }>;
    const income = new Map<string, string>();
    const expense = new Map<string, string>();
    for (const r of rows) {
      if (r.type === "INCOME") income.set(r.occurred_on, money(r.s));
      else expense.set(r.occurred_on, money(r.s));
    }
    return cashflowPoints(from, to, income, expense);
  }

  expensesByCategory(query: EntryQuery) {
    if (query.type && query.type !== "EXPENSE") return [];
    const q = { ...query, type: "EXPENSE" as const };
    const { where, params } = this.buildFilter(q);
    const rows = this.db
      .prepare(
        `SELECT t.category_id AS categoryId, c.name AS name, SUM(CAST(t.amount AS REAL)) AS s
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE ${where}
         GROUP BY t.category_id, c.name
         ORDER BY s DESC`,
      )
      .all(...params) as Array<{ categoryId: string | null; name: string | null; s: number }>;
    return rows.map((r) => ({
      categoryId: r.categoryId,
      name: r.name ?? "Без категории",
      type: "EXPENSE" as const,
      amount: money(r.s),
    }));
  }

  summarize(from: string, to: string): PeriodSummary {
    this.assertPeriod(from, to);
    const page = this.search({ from, to, page: 0, size: 1 });
    const savingsRows = this.db
      .prepare(
        `SELECT type, SUM(CAST(amount AS REAL)) AS s FROM transactions
         WHERE occurred_on >= ? AND occurred_on <= ?
           AND type IN ('TO_SAVINGS','FROM_SAVINGS') GROUP BY type`,
      )
      .all(from, to) as Array<{ type: string; s: number }>;
    let toSav = "0.00";
    let fromSav = "0.00";
    for (const r of savingsRows) {
      if (r.type === "TO_SAVINGS") toSav = money(r.s);
      if (r.type === "FROM_SAVINGS") fromSav = money(r.s);
    }

    const byCategory = this.db
      .prepare(
        `SELECT t.category_id AS categoryId, c.name AS name, t.type AS type, SUM(CAST(t.amount AS REAL)) AS s
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.occurred_on >= ? AND t.occurred_on <= ?
           AND t.type IN ('INCOME','EXPENSE')
         GROUP BY t.category_id, c.name, t.type`,
      )
      .all(from, to) as Array<{
      categoryId: string | null;
      name: string | null;
      type: TransactionType;
      s: number;
    }>;

    const byAccount = this.db
      .prepare(
        `SELECT t.account_id AS accountId, a.name AS name,
           SUM(CASE WHEN t.type='INCOME' THEN CAST(t.amount AS REAL) ELSE 0 END) AS income,
           SUM(CASE WHEN t.type='EXPENSE' THEN CAST(t.amount AS REAL) ELSE 0 END) AS expense
         FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE t.occurred_on >= ? AND t.occurred_on <= ?
           AND t.type IN ('INCOME','EXPENSE')
         GROUP BY t.account_id, a.name`,
      )
      .all(from, to) as Array<{ accountId: string; name: string; income: number; expense: number }>;

    return {
      from,
      to,
      totals: page.totals,
      savingsFlow: savingsOf(toSav, fromSav),
      byCategory: byCategory.map((r) => ({
        categoryId: r.categoryId,
        name: r.name ?? "Без категории",
        type: r.type,
        amount: money(r.s),
      })),
      byAccount: byAccount.map((r) => ({
        accountId: r.accountId,
        name: r.name,
        income: money(r.income),
        expense: money(r.expense),
        net: sub(money(r.income), money(r.expense)),
      })),
    };
  }

  private assertPeriod(from: string, to: string): void {
    if (!from || !to) throw new JournalError("Укажите период");
    if (to < from) throw new JournalError("Конец периода раньше начала");
  }

  // ─── categories ────────────────────────────────────────────

  categories(): CategoryView[] {
    return (
      this.db
        .prepare(`SELECT * FROM categories ORDER BY archived ASC, name COLLATE NOCASE ASC`)
        .all() as Array<Record<string, unknown>>
    ).map((c) => ({
      id: String(c.id),
      name: String(c.name),
      type: c.type as "INCOME" | "EXPENSE",
      archived: bool(c.archived as number),
    }));
  }

  activeCategories(type: "INCOME" | "EXPENSE"): CategoryView[] {
    return this.categories().filter((c) => !c.archived && c.type === type);
  }

  createCategory(name: string, type: "INCOME" | "EXPENSE"): CategoryView {
    const cleaned = cleanName(name);
    const exists = this.db
      .prepare(
        `SELECT 1 FROM categories WHERE LOWER(name)=LOWER(?) AND type=?`,
      )
      .get(cleaned, type);
    if (exists) throw new JournalError("Категория с таким названием уже есть");
    const id = randomUUID();
    this.db
      .prepare(`INSERT INTO categories (id, name, type, archived) VALUES (?, ?, ?, 0)`)
      .run(id, cleaned, type);
    return { id, name: cleaned, type, archived: false };
  }

  renameCategory(id: string, name: string): CategoryView {
    const cat = this.getCategory(id);
    const cleaned = cleanName(name);
    const exists = this.db
      .prepare(
        `SELECT 1 FROM categories WHERE LOWER(name)=LOWER(?) AND type=? AND id<>?`,
      )
      .get(cleaned, cat.type, id);
    if (exists) throw new JournalError("Категория с таким названием уже есть");
    this.db.prepare(`UPDATE categories SET name=? WHERE id=?`).run(cleaned, id);
    return {
      id,
      name: cleaned,
      type: cat.type as "INCOME" | "EXPENSE",
      archived: bool(cat.archived as number),
    };
  }

  archiveCategory(id: string): CategoryView {
    this.getCategory(id);
    this.db.prepare(`UPDATE categories SET archived=1 WHERE id=?`).run(id);
    return this.categories().find((c) => c.id === id)!;
  }

  restoreCategory(id: string): CategoryView {
    this.getCategory(id);
    this.db.prepare(`UPDATE categories SET archived=0 WHERE id=?`).run(id);
    return this.categories().find((c) => c.id === id)!;
  }

  // ─── payroll / settings ────────────────────────────────────

  getPayroll(): PayrollSettings {
    const row = this.db.prepare(`SELECT * FROM payroll_settings LIMIT 1`).get() as Record<
      string,
      unknown
    >;
    return {
      id: String(row.id),
      salaryDay: Number(row.salary_day),
      advanceDay: Number(row.advance_day),
      includeAdvance: bool(row.include_advance as number),
    };
  }

  updatePayroll(salaryDay: number, advanceDay: number, includeAdvance: boolean): PayrollSettings {
    if (salaryDay < 1 || salaryDay > 31 || advanceDay < 1 || advanceDay > 31) {
      throw new JournalError("День выплаты: от 1 до 31");
    }
    const current = this.getPayroll();
    this.db
      .prepare(
        `UPDATE payroll_settings SET salary_day=?, advance_day=?, include_advance=? WHERE id=?`,
      )
      .run(salaryDay, advanceDay, includeAdvance ? 1 : 0, current.id);
    return this.getPayroll();
  }

  getAppSettings(): AppSettings {
    const row = this.db.prepare(`SELECT * FROM app_settings WHERE id=1`).get() as
      | Record<string, unknown>
      | undefined;
    if (!row) return { ...DEFAULT_APP_SETTINGS };
    return {
      timezone: String(row.timezone),
      reminderEnabled: bool(row.reminder_enabled as number),
      reminderDay: Number(row.reminder_day),
      reminderHour: Number(row.reminder_hour),
      reminderMinute: Number(row.reminder_minute),
      autostart: bool(row.autostart as number),
      trayEnabled: bool(row.tray_enabled as number),
    };
  }

  updateAppSettings(patch: Partial<AppSettings>): AppSettings {
    const cur = this.getAppSettings();
    const next = { ...cur, ...patch };
    this.db
      .prepare(
        `UPDATE app_settings SET timezone=?, reminder_enabled=?, reminder_day=?, reminder_hour=?,
         reminder_minute=?, autostart=?, tray_enabled=? WHERE id=1`,
      )
      .run(
        next.timezone,
        next.reminderEnabled ? 1 : 0,
        next.reminderDay,
        next.reminderHour,
        next.reminderMinute,
        next.autostart ? 1 : 0,
        next.trayEnabled ? 1 : 0,
      );
    return this.getAppSettings();
  }

  // ─── balance accounts ──────────────────────────────────────

  balanceAccounts(): BalanceAccountStatus[] {
    const accounts = this.db
      .prepare(`SELECT * FROM balance_accounts ORDER BY name COLLATE NOCASE`)
      .all() as Array<Record<string, unknown>>;
    return accounts
      .map((a) => this.toBalanceStatus(a))
      .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "ru"));
  }

  activeBalanceAccounts(): BalanceAccountStatus[] {
    return this.balanceAccounts().filter((a) => !a.archived);
  }

  private toBalanceStatus(account: Record<string, unknown>): BalanceAccountStatus {
    const snaps = this.db
      .prepare(
        `SELECT * FROM balance_snapshots WHERE account_id=? ORDER BY recorded_on ASC, created_at ASC`,
      )
      .all(String(account.id)) as Array<Record<string, unknown>>;
    const views: BalanceSnapshotView[] = snaps.map((s) => ({
      id: String(s.id),
      recordedOn: String(s.recorded_on),
      amount: money(String(s.amount)),
    }));
    const last = views[views.length - 1];
    return {
      id: String(account.id),
      name: String(account.name),
      openedOn: String(account.opened_on),
      archived: bool(account.archived as number),
      lastAmount: last?.amount ?? null,
      lastRecordedOn: last?.recordedOn ?? null,
      snapshots: views,
    };
  }

  createBalanceAccount(name: string, openedOn: string): BalanceAccountStatus {
    const cleaned = cleanName(name);
    const exists = this.db
      .prepare(`SELECT 1 FROM balance_accounts WHERE LOWER(name)=LOWER(?)`)
      .get(cleaned);
    if (exists) throw new JournalError("Счёт с таким названием уже есть");
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO balance_accounts (id, name, opened_on, archived) VALUES (?, ?, ?, 0)`,
      )
      .run(id, cleaned, openedOn);
    return this.balanceAccounts().find((a) => a.id === id)!;
  }

  renameBalanceAccount(id: string, name: string): BalanceAccountStatus {
    const cleaned = cleanName(name);
    const exists = this.db
      .prepare(`SELECT 1 FROM balance_accounts WHERE LOWER(name)=LOWER(?) AND id<>?`)
      .get(cleaned, id);
    if (exists) throw new JournalError("Счёт с таким названием уже есть");
    const info = this.db.prepare(`UPDATE balance_accounts SET name=? WHERE id=?`).run(cleaned, id);
    if (info.changes === 0) throw new NotFoundError("Счёт не найден");
    return this.balanceAccounts().find((a) => a.id === id)!;
  }

  archiveBalanceAccount(id: string): BalanceAccountStatus {
    const info = this.db.prepare(`UPDATE balance_accounts SET archived=1 WHERE id=?`).run(id);
    if (info.changes === 0) throw new NotFoundError("Счёт не найден");
    return this.balanceAccounts().find((a) => a.id === id)!;
  }

  restoreBalanceAccount(id: string): BalanceAccountStatus {
    const info = this.db.prepare(`UPDATE balance_accounts SET archived=0 WHERE id=?`).run(id);
    if (info.changes === 0) throw new NotFoundError("Счёт не найден");
    return this.balanceAccounts().find((a) => a.id === id)!;
  }

  recordBalance(accountId: string, recordedOn: string, amount: string): BalanceSnapshotView {
    const account = this.db.prepare(`SELECT * FROM balance_accounts WHERE id=?`).get(accountId) as
      | Record<string, unknown>
      | undefined;
    if (!account) throw new NotFoundError("Счёт не найден");
    if (bool(account.archived as number)) throw new JournalError("Счёт в архиве");
    if (!recordedOn) throw new JournalError("Укажите дату");
    if (recordedOn < String(account.opened_on)) {
      throw new JournalError("Дата раньше открытия счёта");
    }
    const moneyAmount = parseNonNegativeAmount(amount);
    const existing = this.db
      .prepare(`SELECT id FROM balance_snapshots WHERE account_id=? AND recorded_on=?`)
      .get(accountId, recordedOn) as { id: string } | undefined;
    if (existing) {
      this.db
        .prepare(`UPDATE balance_snapshots SET amount=? WHERE id=?`)
        .run(moneyAmount, existing.id);
      return { id: existing.id, recordedOn, amount: moneyAmount };
    }
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO balance_snapshots (id, account_id, amount, recorded_on, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, accountId, moneyAmount, recordedOn, this.nowIso());
    return { id, recordedOn, amount: moneyAmount };
  }

  deleteBalanceSnapshot(id: string): void {
    const info = this.db.prepare(`DELETE FROM balance_snapshots WHERE id=?`).run(id);
    if (info.changes === 0) throw new NotFoundError("Запись не найдена");
  }

  // ─── budgets ───────────────────────────────────────────────

  monthBudget(ym: string): MonthBudget {
    const monthStart = yearMonthStart(ym);
    const monthEnd = yearMonthEnd(ym);
    const planned = this.plannedByCategory(monthStart);
    const summary = this.summarize(monthStart, monthEnd);
    const actual = new Map<string, string>();
    let withoutCategory = "0.00";
    for (const slice of summary.byCategory) {
      if (slice.type !== "EXPENSE") continue;
      if (!slice.categoryId) {
        withoutCategory = add(withoutCategory, slice.amount);
        continue;
      }
      actual.set(slice.categoryId, add(actual.get(slice.categoryId) ?? "0.00", slice.amount));
    }
    const ids = new Set([...planned.keys(), ...actual.keys()]);
    const lines: BudgetLine[] = [];
    for (const id of ids) {
      const cat = this.db.prepare(`SELECT * FROM categories WHERE id=?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!cat || cat.type !== "EXPENSE") continue;
      const plan = planned.get(id) ?? "0.00";
      const fact = actual.get(id) ?? "0.00";
      if (signum(plan) === 0 && signum(fact) === 0) continue;
      const remaining = sub(plan, fact);
      lines.push({
        categoryId: id,
        name: String(cat.name),
        archived: bool(cat.archived as number),
        plan,
        fact,
        remaining,
        unplanned: signum(plan) === 0,
        overspent: cmp(fact, plan) > 0 && signum(plan) > 0,
      });
    }
    lines.sort(
      (a, b) =>
        Number(a.unplanned) - Number(b.unplanned) ||
        Number(a.archived) - Number(b.archived) ||
        a.name.localeCompare(b.name, "ru"),
    );
    if (signum(withoutCategory) > 0) {
      lines.push({
        categoryId: null,
        name: "Без категории",
        archived: false,
        plan: "0.00",
        fact: withoutCategory,
        remaining: sub("0.00", withoutCategory),
        unplanned: true,
        overspent: false,
      });
    }
    const planTotal = lines.reduce((s, l) => add(s, l.plan), "0.00");
    const factTotal = lines.reduce((s, l) => add(s, l.fact), "0.00");
    return {
      month: ym,
      lines,
      planTotal,
      factTotal,
      remainingTotal: sub(planTotal, factTotal),
    };
  }

  private plannedByCategory(monthStart: string): Map<string, string> {
    const rows = this.db
      .prepare(`SELECT category_id, amount FROM expense_budgets WHERE month=?`)
      .all(monthStart) as Array<{ category_id: string; amount: string }>;
    return new Map(rows.map((r) => [r.category_id, money(r.amount)]));
  }

  availableBudgetCategories(ym: string): CategoryView[] {
    const planned = this.plannedByCategory(yearMonthStart(ym));
    return this.activeCategories("EXPENSE").filter((c) => !planned.has(c.id));
  }

  addBudget(ym: string, categoryId: string, amount: string): MonthBudget {
    if (!ym) throw new JournalError("Укажите месяц");
    if (!categoryId) throw new JournalError("Выберите категорию");
    const addition = parsePositiveAmount(amount);
    const cat = this.getCategory(categoryId);
    if (cat.type !== "EXPENSE") throw new JournalError("Планировать можно только расходные категории");
    if (bool(cat.archived as number)) throw new JournalError("Категория в архиве");
    const amounts = this.plannedByCategory(yearMonthStart(ym));
    amounts.set(categoryId, add(amounts.get(categoryId) ?? "0.00", addition));
    return this.saveBudgets(ym, Object.fromEntries(amounts));
  }

  saveBudgets(ym: string, amounts: Record<string, string>): MonthBudget {
    if (!ym) throw new JournalError("Укажите месяц");
    const monthStart = yearMonthStart(ym);
    const cleaned = new Map<string, string>();
    for (const [id, raw] of Object.entries(amounts)) {
      if (!id) continue;
      const value = money(raw);
      if (signum(value) < 0) throw new JournalError("План не может быть отрицательным");
      if (signum(value) === 0) continue;
      const cat = this.getCategory(id);
      if (cat.type !== "EXPENSE") throw new JournalError("Планировать можно только расходные категории");
      cleaned.set(id, value);
    }
    const existing = this.db
      .prepare(`SELECT id, category_id FROM expense_budgets WHERE month=?`)
      .all(monthStart) as Array<{ id: string; category_id: string }>;
    for (const row of existing) {
      if (!cleaned.has(row.category_id)) {
        this.db.prepare(`DELETE FROM expense_budgets WHERE id=?`).run(row.id);
      }
    }
    for (const [categoryId, amount] of cleaned) {
      const found = existing.find((e) => e.category_id === categoryId);
      if (found) {
        this.db.prepare(`UPDATE expense_budgets SET amount=? WHERE id=?`).run(amount, found.id);
      } else {
        this.db
          .prepare(
            `INSERT INTO expense_budgets (id, category_id, month, amount) VALUES (?, ?, ?, ?)`,
          )
          .run(randomUUID(), categoryId, monthStart, amount);
      }
    }
    return this.monthBudget(ym);
  }

  copyBudgetFromPrevious(ym: string): MonthBudget {
    const prev = previousMonth(ym);
    const planned = this.plannedByCategory(yearMonthStart(prev));
    if (planned.size === 0) throw new JournalError(`За ${prev} плана нет`);
    return this.saveBudgets(ym, Object.fromEntries(planned));
  }

  plannedExpenseSeries(from: string, to: string): string[] {
    if (!from || !to || to < from) return [];
    const { y, m } = parseIsoDate(from);
    const days = daysInMonth(y, m);
    // For each day in range, accumulate daily planned rate across overlapping months
    const dailyRates = new Map<string, number>();
    let cursor = toYearMonth(from);
    const lastYm = toYearMonth(to);
    while (cursor <= lastYm) {
      const start = yearMonthStart(cursor);
      const end = yearMonthEnd(cursor);
      const [yy, mm] = cursor.split("-").map(Number);
      const dim = daysInMonth(yy, mm);
      const planTotal = [...this.plannedByCategory(start).values()].reduce(
        (s, v) => add(s, v),
        "0.00",
      );
      const rate = Number(planTotal) / dim;
      for (let d = start; d <= end; d = addDays(d, 1)) {
        dailyRates.set(d, rate);
      }
      cursor = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
    }
    void days;
    let running = 0;
    const series: string[] = [];
    for (let d = from; compareIso(d, to) <= 0; d = addDays(d, 1)) {
      running += dailyRates.get(d) ?? 0;
      series.push(money(running));
    }
    return series;
  }

  // ─── backup dump / restore ─────────────────────────────────

  exportPayload(): BackupPayload {
    const accounts = this.db.prepare(`SELECT * FROM accounts`).all() as Array<Record<string, unknown>>;
    const categories = this.db.prepare(`SELECT * FROM categories`).all() as Array<
      Record<string, unknown>
    >;
    const transactions = this.db.prepare(`SELECT * FROM transactions`).all() as Array<
      Record<string, unknown>
    >;
    const payrollSettings = this.db.prepare(`SELECT * FROM payroll_settings`).all() as Array<
      Record<string, unknown>
    >;
    const balanceAccounts = this.db.prepare(`SELECT * FROM balance_accounts`).all() as Array<
      Record<string, unknown>
    >;
    const balanceSnapshots = this.db.prepare(`SELECT * FROM balance_snapshots`).all() as Array<
      Record<string, unknown>
    >;
    const expenseBudgets = this.db.prepare(`SELECT * FROM expense_budgets`).all() as Array<
      Record<string, unknown>
    >;
    const settings = this.getAppSettings();
    return entitiesToPayload({
      accounts: accounts.map((a) => ({
        id: String(a.id),
        name: String(a.name),
        openingBalance: money(String(a.opening_balance)),
        kind: (a.kind as Account["kind"]) || "SPENDING",
        openedOn: String(a.opened_on),
        defaultAccount: bool(a.is_default as number),
        archived: bool(a.archived as number),
      })),
      categories: categories.map((c) => ({
        id: String(c.id),
        name: String(c.name),
        type: c.type as "INCOME" | "EXPENSE",
        archived: bool(c.archived as number),
      })),
      transactions: transactions.map(
        (t) =>
          ({
            id: String(t.id),
            type: t.type as TransactionType,
            amount: money(String(t.amount)),
            description: String(t.description ?? ""),
            occurredOn: String(t.occurred_on),
            accountId: String(t.account_id),
            counterAccountId: t.counter_account_id ? String(t.counter_account_id) : null,
            categoryId: t.category_id ? String(t.category_id) : null,
            createdAt: String(t.created_at),
            updatedAt: String(t.updated_at),
          }) satisfies Transaction,
      ),
      payrollSettings: payrollSettings.map((p) => ({
        id: String(p.id),
        salaryDay: Number(p.salary_day),
        advanceDay: Number(p.advance_day),
        includeAdvance: bool(p.include_advance as number),
      })),
      balanceAccounts: balanceAccounts.map((b) => ({
        id: String(b.id),
        name: String(b.name),
        openedOn: String(b.opened_on),
        archived: bool(b.archived as number),
      })),
      balanceSnapshots: balanceSnapshots.map((s) => ({
        id: String(s.id),
        accountId: String(s.account_id),
        amount: money(String(s.amount)),
        recordedOn: String(s.recorded_on),
        createdAt: String(s.created_at),
      })),
      expenseBudgets: expenseBudgets.map(
        (e) =>
          ({
            id: String(e.id),
            categoryId: String(e.category_id),
            month: String(e.month),
            amount: money(String(e.amount)),
          }) satisfies ExpenseBudget,
      ),
      appSettings: settings,
    });
  }

  importPayload(payload: BackupPayload): void {
    validateBackupPayload(payload);
    const run = this.db.transaction(() => {
      this.db.exec(`
        DELETE FROM transactions;
        DELETE FROM balance_snapshots;
        DELETE FROM expense_budgets;
        DELETE FROM accounts;
        DELETE FROM categories;
        DELETE FROM balance_accounts;
        DELETE FROM payroll_settings;
      `);
      for (const a of payload.accounts) {
        this.db
          .prepare(
            `INSERT INTO accounts (id, name, opening_balance, kind, opened_on, is_default, archived)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            a.id,
            a.name,
            a.openingBalance,
            a.kind || "SPENDING",
            a.openedOn,
            a.defaultAccount ? 1 : 0,
            a.archived ? 1 : 0,
          );
      }
      for (const c of payload.categories) {
        this.db
          .prepare(`INSERT INTO categories (id, name, type, archived) VALUES (?, ?, ?, ?)`)
          .run(c.id, c.name, c.type, c.archived ? 1 : 0);
      }
      for (const b of payload.balanceAccounts) {
        this.db
          .prepare(
            `INSERT INTO balance_accounts (id, name, opened_on, archived) VALUES (?, ?, ?, ?)`,
          )
          .run(b.id, b.name, b.openedOn, b.archived ? 1 : 0);
      }
      for (const p of payload.payrollSettings) {
        this.db
          .prepare(
            `INSERT INTO payroll_settings (id, salary_day, advance_day, include_advance) VALUES (?, ?, ?, ?)`,
          )
          .run(p.id, p.salaryDay, p.advanceDay, p.includeAdvance ? 1 : 0);
      }
      if (payload.payrollSettings.length === 0) {
        // keep seed via migrate? table empty — insert default
        migrate(this.db);
      }
      for (const t of payload.transactions) {
        this.db
          .prepare(
            `INSERT INTO transactions
             (id, type, amount, description, occurred_on, account_id, counter_account_id, category_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            t.id,
            t.type,
            t.amount,
            t.description ?? "",
            t.occurredOn,
            t.accountId,
            t.counterAccountId,
            t.categoryId,
            t.createdAt || this.nowIso(),
            t.updatedAt || this.nowIso(),
          );
      }
      for (const s of payload.balanceSnapshots) {
        this.db
          .prepare(
            `INSERT INTO balance_snapshots (id, account_id, amount, recorded_on, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(s.id, s.accountId, s.amount, s.recordedOn, s.createdAt || this.nowIso());
      }
      for (const e of payload.expenseBudgets) {
        this.db
          .prepare(
            `INSERT INTO expense_budgets (id, category_id, month, amount) VALUES (?, ?, ?, ?)`,
          )
          .run(e.id, e.categoryId, e.month, e.amount);
      }
      if (payload.appSettings) {
        this.updateAppSettings(payload.appSettings);
      }
    });
    run();
  }

  /** Journal account balances (for completeness / future UI). */
  journalAccounts(): AccountView[] {
    const accounts = this.db.prepare(`SELECT * FROM accounts`).all() as Array<Record<string, unknown>>;
    const txs = this.db
      .prepare(`SELECT * FROM transactions ORDER BY occurred_on ASC, created_at ASC`)
      .all() as Array<Record<string, unknown>>;
    const balances = new Map<string, number>();
    for (const a of accounts) {
      balances.set(String(a.id), Number(a.opening_balance));
    }
    for (const t of txs) {
      const type = t.type as TransactionType;
      const amount = Number(t.amount);
      const accountId = String(t.account_id);
      if (type === "INCOME") balances.set(accountId, (balances.get(accountId) ?? 0) + amount);
      else if (type === "EXPENSE") balances.set(accountId, (balances.get(accountId) ?? 0) - amount);
      else if (type === "TRANSFER" || type === "REPAYMENT") {
        balances.set(accountId, (balances.get(accountId) ?? 0) - amount);
        const counter = String(t.counter_account_id);
        balances.set(counter, (balances.get(counter) ?? 0) + amount);
      } else if (type === "VALUATION") {
        balances.set(accountId, amount);
      }
      // savings: no-op on journal account balance
    }
    return accounts.map((a) => ({
      id: String(a.id),
      name: String(a.name),
      kind: (a.kind as Account["kind"]) || "SPENDING",
      openingBalance: money(String(a.opening_balance)),
      balance: money(balances.get(String(a.id)) ?? 0),
      openedOn: String(a.opened_on),
      defaultAccount: bool(a.is_default as number),
      archived: bool(a.archived as number),
    }));
  }
}