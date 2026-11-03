import type Database from "better-sqlite3";
import {
  SEED_CARD_ID,
  SEED_CASH_ID,
  SEED_PAYROLL_ID,
  todayInZone,
} from "@money-tracker/core";

export function migrate(db: Database.Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      opening_balance TEXT NOT NULL DEFAULT '0.00',
      kind TEXT NOT NULL DEFAULT 'SPENDING',
      opened_on TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      amount TEXT NOT NULL,
      description TEXT NOT NULL,
      occurred_on TEXT NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      counter_account_id TEXT REFERENCES accounts(id),
      category_id TEXT REFERENCES categories(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll_settings (
      id TEXT PRIMARY KEY NOT NULL,
      salary_day INTEGER NOT NULL,
      advance_day INTEGER NOT NULL,
      include_advance INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS balance_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      opened_on TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS balance_snapshots (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL REFERENCES balance_accounts(id),
      amount TEXT NOT NULL,
      recorded_on TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(account_id, recorded_on)
    );

    CREATE TABLE IF NOT EXISTS expense_budgets (
      id TEXT PRIMARY KEY NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      month TEXT NOT NULL,
      amount TEXT NOT NULL,
      UNIQUE(category_id, month)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      timezone TEXT NOT NULL,
      reminder_enabled INTEGER NOT NULL DEFAULT 1,
      reminder_day INTEGER NOT NULL DEFAULT 1,
      reminder_hour INTEGER NOT NULL DEFAULT 10,
      reminder_minute INTEGER NOT NULL DEFAULT 0,
      autostart INTEGER NOT NULL DEFAULT 0,
      tray_enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_occurred_on ON transactions(occurred_on);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
  `);

  const accounts = db.prepare("SELECT COUNT(*) AS c FROM accounts").get() as { c: number };
  if (accounts.c === 0) {
    const today = todayInZone();
    db.prepare(
      `INSERT INTO accounts (id, name, opening_balance, kind, opened_on, is_default, archived)
       VALUES (?, ?, '0.00', 'SPENDING', ?, 1, 0)`,
    ).run(SEED_CASH_ID, "Наличные", today);
    db.prepare(
      `INSERT INTO accounts (id, name, opening_balance, kind, opened_on, is_default, archived)
       VALUES (?, ?, '0.00', 'SPENDING', ?, 0, 0)`,
    ).run(SEED_CARD_ID, "Карта", today);
  }

  const payroll = db.prepare("SELECT COUNT(*) AS c FROM payroll_settings").get() as { c: number };
  if (payroll.c === 0) {
    db.prepare(
      `INSERT INTO payroll_settings (id, salary_day, advance_day, include_advance)
       VALUES (?, 6, 21, 0)`,
    ).run(SEED_PAYROLL_ID);
  }

  const settings = db.prepare("SELECT COUNT(*) AS c FROM app_settings").get() as { c: number };
  if (settings.c === 0) {
    db.prepare(
      `INSERT INTO app_settings (id, timezone, reminder_enabled, reminder_day, reminder_hour, reminder_minute, autostart, tray_enabled)
       VALUES (1, 'Europe/Moscow', 1, 1, 10, 0, 0, 1)`,
    ).run();
  }
}