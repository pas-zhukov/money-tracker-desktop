import { gunzipSync, gzipSync } from "fflate";
import { JournalError } from "./errors.js";
import type {
  Account,
  AccountKind,
  BalanceAccount,
  BalanceSnapshot,
  Category,
  ExpenseBudget,
  PayrollSettings,
  Transaction,
  TransactionType,
} from "./types.js";

export const BACKUP_FORMAT = "money-tracker-backup";
export const LEGACY_HEADER = "MTBAK1";
export const V2_HEADER = "MTBAK2";
export const LEGACY_VERSION = 1;
export const V2_VERSION = 2;

export interface BackupPayload {
  format: string;
  version: number;
  exportedAt: string;
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  transactions: TransactionRecord[];
  payrollSettings: PayrollSettingsRecord[];
  balanceAccounts: BalanceAccountRecord[];
  balanceSnapshots: BalanceSnapshotRecord[];
  expenseBudgets: ExpenseBudgetRecord[];
  appSettings?: AppSettingsRecord | null;
}

export interface AccountRecord {
  id: string;
  name: string;
  openingBalance: string;
  kind: AccountKind;
  openedOn: string;
  defaultAccount: boolean;
  archived: boolean;
}

export interface CategoryRecord {
  id: string;
  name: string;
  type: TransactionType;
  archived: boolean;
}

export interface TransactionRecord {
  id: string;
  type: TransactionType;
  amount: string;
  description: string;
  occurredOn: string;
  accountId: string;
  counterAccountId: string | null;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollSettingsRecord {
  id: string;
  salaryDay: number;
  advanceDay: number;
  includeAdvance: boolean;
}

export interface BalanceAccountRecord {
  id: string;
  name: string;
  openedOn: string;
  archived: boolean;
}

export interface BalanceSnapshotRecord {
  id: string;
  accountId: string;
  amount: string;
  recordedOn: string;
  createdAt: string;
}

export interface ExpenseBudgetRecord {
  id: string;
  categoryId: string;
  month: string;
  amount: string;
}

export interface AppSettingsRecord {
  timezone: string;
  reminderEnabled: boolean;
  reminderDay: number;
  reminderHour: number;
  reminderMinute: number;
  autostart: boolean;
  trayEnabled: boolean;
}

function toBytes(text: string): Uint8Array {
  return Buffer.from(text, "utf8");
}

function fromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

function normalizeMoney(value: unknown): string {
  if (value == null) return "0.00";
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function normalizeDate(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function normalizeInstant(value: unknown): string {
  if (value == null) return new Date().toISOString();
  return String(value);
}

/** Decode legacy MTBAK1 (Base64+GZIP JSON) from the Java app. */
export function decodeLegacyBackup(fileBytes: Uint8Array): BackupPayload {
  if (!fileBytes || fileBytes.length === 0) {
    throw new JournalError("Файл бекапа пустой");
  }
  const text = fromBytes(fileBytes).trim();
  const newline = text.indexOf("\n");
  if (newline < 0) throw new JournalError("Неверный формат бекапа");
  const header = text.slice(0, newline).trim();
  if (header !== LEGACY_HEADER) throw new JournalError("Неверный формат бекапа");
  const body = text.slice(newline + 1).replace(/\s+/g, "");
  if (!body) throw new JournalError("Неверный формат бекапа");
  try {
    const gzipped = new Uint8Array(Buffer.from(body, "base64"));
    const json = gunzipSync(gzipped);
    const raw = JSON.parse(fromBytes(json)) as Record<string, unknown>;
    if (raw.format !== BACKUP_FORMAT || Number(raw.version) !== LEGACY_VERSION) {
      throw new JournalError("Неподдерживаемая версия бекапа");
    }
    return normalizePayload(raw);
  } catch (e) {
    if (e instanceof JournalError) throw e;
    throw new JournalError("Не удалось прочитать бекап");
  }
}

/** Encode legacy-compatible MTBAK1 for tests / interoperability. */
export function encodeLegacyBackup(payload: BackupPayload): Uint8Array {
  const json = toBytes(JSON.stringify({ ...payload, format: BACKUP_FORMAT, version: LEGACY_VERSION }));
  const gzipped = gzipSync(json);
  const body = Buffer.from(gzipped).toString("base64");
  return toBytes(`${LEGACY_HEADER}\n${body}`);
}

export function encodeV2ClearPayload(payload: BackupPayload): Uint8Array {
  return toBytes(
    JSON.stringify({
      ...payload,
      format: BACKUP_FORMAT,
      version: V2_VERSION,
    }),
  );
}

export function decodeV2ClearPayload(jsonBytes: Uint8Array): BackupPayload {
  try {
    const raw = JSON.parse(fromBytes(jsonBytes)) as Record<string, unknown>;
    if (raw.format !== BACKUP_FORMAT || Number(raw.version) !== V2_VERSION) {
      throw new JournalError("Неподдерживаемая версия бекапа");
    }
    return normalizePayload(raw);
  } catch (e) {
    if (e instanceof JournalError) throw e;
    throw new JournalError("Не удалось прочитать бекап");
  }
}

/** Detect header without full decode. */
export function backupHeader(fileBytes: Uint8Array): string | null {
  const text = fromBytes(fileBytes).trim();
  const newline = text.indexOf("\n");
  if (newline < 0) return null;
  return text.slice(0, newline).trim();
}

function normalizePayload(raw: Record<string, unknown>): BackupPayload {
  const accounts = ((raw.accounts as unknown[]) ?? []).map((a) => {
    const row = a as Record<string, unknown>;
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      openingBalance: normalizeMoney(row.openingBalance),
      kind: (row.kind as AccountKind) || "SPENDING",
      openedOn: normalizeDate(row.openedOn) || "2000-01-01",
      defaultAccount: Boolean(row.defaultAccount),
      archived: Boolean(row.archived),
    } satisfies AccountRecord;
  });
  const categories = ((raw.categories as unknown[]) ?? []).map((c) => {
    const row = c as Record<string, unknown>;
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      type: row.type as TransactionType,
      archived: Boolean(row.archived),
    } satisfies CategoryRecord;
  });
  const transactions = ((raw.transactions as unknown[]) ?? []).map((t) => {
    const row = t as Record<string, unknown>;
    return {
      id: String(row.id),
      type: row.type as TransactionType,
      amount: normalizeMoney(row.amount),
      description: String(row.description ?? ""),
      occurredOn: normalizeDate(row.occurredOn) || "2000-01-01",
      accountId: String(row.accountId),
      counterAccountId: row.counterAccountId == null ? null : String(row.counterAccountId),
      categoryId: row.categoryId == null ? null : String(row.categoryId),
      createdAt: normalizeInstant(row.createdAt),
      updatedAt: normalizeInstant(row.updatedAt),
    } satisfies TransactionRecord;
  });
  const payrollSettings = ((raw.payrollSettings as unknown[]) ?? []).map((p) => {
    const row = p as Record<string, unknown>;
    return {
      id: String(row.id),
      salaryDay: Number(row.salaryDay),
      advanceDay: Number(row.advanceDay),
      includeAdvance: Boolean(row.includeAdvance),
    } satisfies PayrollSettingsRecord;
  });
  const balanceAccounts = ((raw.balanceAccounts as unknown[]) ?? []).map((b) => {
    const row = b as Record<string, unknown>;
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      openedOn: normalizeDate(row.openedOn) || "2000-01-01",
      archived: Boolean(row.archived),
    } satisfies BalanceAccountRecord;
  });
  const balanceSnapshots = ((raw.balanceSnapshots as unknown[]) ?? []).map((s) => {
    const row = s as Record<string, unknown>;
    return {
      id: String(row.id),
      accountId: String(row.accountId),
      amount: normalizeMoney(row.amount),
      recordedOn: normalizeDate(row.recordedOn) || "2000-01-01",
      createdAt: normalizeInstant(row.createdAt),
    } satisfies BalanceSnapshotRecord;
  });
  const expenseBudgets = ((raw.expenseBudgets as unknown[]) ?? []).map((e) => {
    const row = e as Record<string, unknown>;
    return {
      id: String(row.id),
      categoryId: String(row.categoryId),
      month: normalizeDate(row.month) || "2000-01-01",
      amount: normalizeMoney(row.amount),
    } satisfies ExpenseBudgetRecord;
  });
  const appSettingsRaw = raw.appSettings as Record<string, unknown> | null | undefined;
  const appSettings = appSettingsRaw
    ? {
        timezone: String(appSettingsRaw.timezone ?? "Europe/Moscow"),
        reminderEnabled: Boolean(appSettingsRaw.reminderEnabled ?? true),
        reminderDay: Number(appSettingsRaw.reminderDay ?? 1),
        reminderHour: Number(appSettingsRaw.reminderHour ?? 10),
        reminderMinute: Number(appSettingsRaw.reminderMinute ?? 0),
        autostart: Boolean(appSettingsRaw.autostart ?? false),
        trayEnabled: Boolean(appSettingsRaw.trayEnabled ?? true),
      }
    : null;

  return {
    format: BACKUP_FORMAT,
    version: Number(raw.version),
    exportedAt: normalizeInstant(raw.exportedAt),
    accounts,
    categories,
    transactions,
    payrollSettings,
    balanceAccounts,
    balanceSnapshots,
    expenseBudgets,
    appSettings,
  };
}

export function entitiesToPayload(input: {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  payrollSettings: PayrollSettings[];
  balanceAccounts: BalanceAccount[];
  balanceSnapshots: BalanceSnapshot[];
  expenseBudgets: ExpenseBudget[];
  appSettings?: AppSettingsRecord | null;
}): BackupPayload {
  return {
    format: BACKUP_FORMAT,
    version: V2_VERSION,
    exportedAt: new Date().toISOString(),
    accounts: input.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      openingBalance: a.openingBalance,
      kind: a.kind,
      openedOn: a.openedOn,
      defaultAccount: a.defaultAccount,
      archived: a.archived,
    })),
    categories: input.categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      archived: c.archived,
    })),
    transactions: input.transactions.map((t) => ({ ...t })),
    payrollSettings: input.payrollSettings.map((p) => ({ ...p })),
    balanceAccounts: input.balanceAccounts.map((b) => ({ ...b })),
    balanceSnapshots: input.balanceSnapshots.map((s) => ({ ...s })),
    expenseBudgets: input.expenseBudgets.map((e) => ({ ...e })),
    appSettings: input.appSettings ?? null,
  };
}

export function validateBackupPayload(payload: BackupPayload): void {
  if (!payload.accounts.length) throw new JournalError("В бекапе нет счетов");
  for (const a of payload.accounts) {
    if (!a.id) throw new JournalError("В бекапе нет id счёта");
    if (!a.name.trim()) throw new JournalError("Название счёта пустое");
  }
  for (const c of payload.categories) {
    if (!c.id) throw new JournalError("В бекапе нет id категории");
    if (!c.name.trim()) throw new JournalError("Название категории пустое");
    if (!c.type) throw new JournalError("У категории не указан тип");
  }
  const accountIds = new Set(payload.accounts.map((a) => a.id));
  const categoryIds = new Set(payload.categories.map((c) => c.id));
  const balanceIds = new Set(payload.balanceAccounts.map((b) => b.id));
  for (const t of payload.transactions) {
    if (!t.id) throw new JournalError("В бекапе нет id записи");
    if (!t.type) throw new JournalError("У записи не указан тип");
    if (!accountIds.has(t.accountId)) {
      throw new JournalError(`В бекапе нет счёта: ${t.accountId}`);
    }
    if (t.categoryId && !categoryIds.has(t.categoryId)) {
      throw new JournalError(`В бекапе нет категории: ${t.categoryId}`);
    }
    if (t.counterAccountId && !accountIds.has(t.counterAccountId)) {
      throw new JournalError(`В бекапе нет счёта: ${t.counterAccountId}`);
    }
  }
  for (const b of payload.balanceAccounts) {
    if (!b.id) throw new JournalError("В бекапе нет id балансового счёта");
    if (!b.name.trim()) throw new JournalError("Название балансового счёта пустое");
  }
  for (const s of payload.balanceSnapshots) {
    if (!s.id) throw new JournalError("В бекапе нет id снимка баланса");
    if (!balanceIds.has(s.accountId)) {
      throw new JournalError(`В бекапе нет балансового счёта: ${s.accountId}`);
    }
  }
  for (const e of payload.expenseBudgets) {
    if (!e.id) throw new JournalError("В бекапе нет id бюджета");
    if (!categoryIds.has(e.categoryId)) {
      throw new JournalError(`В бекапе нет категории: ${e.categoryId}`);
    }
  }
}