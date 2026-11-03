export type TransactionType =
  | "INCOME"
  | "EXPENSE"
  | "TO_SAVINGS"
  | "FROM_SAVINGS"
  | "TRANSFER"
  | "VALUATION"
  | "REPAYMENT";

export type AccountKind = "SPENDING" | "SAVINGS" | "CREDIT";

export type ActiveEntryType = "INCOME" | "EXPENSE" | "TO_SAVINGS" | "FROM_SAVINGS";

export interface Account {
  id: string;
  name: string;
  openingBalance: string;
  kind: AccountKind;
  openedOn: string;
  defaultAccount: boolean;
  archived: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  archived: boolean;
}

export interface Transaction {
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

export interface PayrollSettings {
  id: string;
  salaryDay: number;
  advanceDay: number;
  includeAdvance: boolean;
}

export interface BalanceAccount {
  id: string;
  name: string;
  openedOn: string;
  archived: boolean;
}

export interface BalanceSnapshot {
  id: string;
  accountId: string;
  amount: string;
  recordedOn: string;
  createdAt: string;
}

export interface ExpenseBudget {
  id: string;
  categoryId: string;
  month: string;
  amount: string;
}

export interface EntryDraft {
  type: ActiveEntryType;
  amount: string;
  description: string;
  occurredOn: string;
  categoryId?: string | null;
  accountId?: string | null;
}

export interface EntryView {
  id: string;
  type: TransactionType;
  amount: string;
  description: string;
  occurredOn: string;
  accountId: string;
  accountName: string;
  counterAccountId: string | null;
  counterAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EntryQuery {
  from?: string | null;
  to?: string | null;
  type?: ActiveEntryType | null;
  accountId?: string | null;
  categoryId?: string | null;
  withoutCategory?: boolean;
  text?: string | null;
  page?: number;
  size?: number;
}

export interface MoneyTotals {
  income: string;
  expense: string;
  net: string;
}

export interface SavingsFlow {
  toSavings: string;
  fromSavings: string;
  net: string;
}

export interface EntryPage {
  items: EntryView[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  totals: MoneyTotals;
}

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  type: TransactionType;
  amount: string;
}

export interface AccountSlice {
  accountId: string;
  name: string;
  income: string;
  expense: string;
  net: string;
}

export interface PeriodSummary {
  from: string;
  to: string;
  totals: MoneyTotals;
  savingsFlow: SavingsFlow;
  byCategory: CategorySlice[];
  byAccount: AccountSlice[];
}

export interface AccountView {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalance: string;
  balance: string;
  openedOn: string;
  defaultAccount: boolean;
  archived: boolean;
}

export interface CategoryView {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  archived: boolean;
}

export interface BudgetLine {
  categoryId: string | null;
  name: string;
  archived: boolean;
  plan: string;
  fact: string;
  remaining: string;
  unplanned: boolean;
  overspent: boolean;
}

export interface MonthBudget {
  month: string;
  lines: BudgetLine[];
  planTotal: string;
  factTotal: string;
  remainingTotal: string;
}

export interface BalanceSnapshotView {
  id: string;
  recordedOn: string;
  amount: string;
}

export interface BalanceAccountStatus {
  id: string;
  name: string;
  openedOn: string;
  archived: boolean;
  lastAmount: string | null;
  lastRecordedOn: string | null;
  snapshots: BalanceSnapshotView[];
}

export interface CashflowPoint {
  date: string;
  income: string;
  expense: string;
}

export interface CashflowCrossing {
  from: string;
  to: string | null;
  amount: string;
  share: string;
}

export interface AppSettings {
  timezone: string;
  reminderEnabled: boolean;
  reminderDay: number;
  reminderHour: number;
  reminderMinute: number;
  autostart: boolean;
  trayEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  timezone: "Europe/Moscow",
  reminderEnabled: true,
  reminderDay: 1,
  reminderHour: 10,
  reminderMinute: 0,
  autostart: false,
  trayEnabled: true,
};

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export const SEED_CASH_ID = "11111111-1111-1111-1111-111111111111";
export const SEED_CARD_ID = "22222222-2222-2222-2222-222222222222";
export const SEED_PAYROLL_ID = "33333333-3333-3333-3333-333333333333";

export function isLegacyType(type: TransactionType): boolean {
  return type === "TRANSFER" || type === "VALUATION" || type === "REPAYMENT";
}

export function isSavingsType(type: TransactionType): boolean {
  return type === "TO_SAVINGS" || type === "FROM_SAVINGS";
}

export function typeLabel(type: TransactionType): string {
  switch (type) {
    case "INCOME":
      return "Доход";
    case "EXPENSE":
      return "Расход";
    case "TO_SAVINGS":
      return "В накопления";
    case "FROM_SAVINGS":
      return "Из накоплений";
    case "TRANSFER":
      return "Перевод";
    case "VALUATION":
      return "Баланс";
    case "REPAYMENT":
      return "Погашение";
  }
}