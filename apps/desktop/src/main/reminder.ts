import { Notification, BrowserWindow } from "electron";
import type { SessionManager } from "@money-tracker/db";

export class ReminderScheduler {
  private timer: NodeJS.Timeout | null = null;
  private lastFiredKey: string | null = null;

  constructor(
    private readonly getSession: () => SessionManager | null,
    private readonly getWindow: () => BrowserWindow | null,
  ) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.tick(), 30_000);
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const session = this.getSession();
    if (!session?.currentUser) return;
    let settings;
    try {
      settings = session.money.getAppSettings();
    } catch {
      return;
    }
    if (!settings.reminderEnabled) return;

    const now = this.nowParts(settings.timezone);
    if (now.day !== settings.reminderDay) return;
    if (now.hour !== settings.reminderHour) return;
    if (now.minute !== settings.reminderMinute) return;

    const key = `${session.currentUser.id}:${now.year}-${now.month}-${now.day}-${now.hour}:${now.minute}`;
    if (this.lastFiredKey === key) return;
    this.lastFiredKey = key;

    const accounts = session.money.activeBalanceAccounts();
    const list =
      accounts.length === 0
        ? "Добавьте счета на экране «Состояние счетов»."
        : accounts.map((a) => `• ${a.name}`).join("\n");

    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: "Пора зафиксировать остатки",
      body: list,
    });
    n.on("click", () => {
      const win = this.getWindow();
      if (win) {
        win.show();
        win.focus();
        win.webContents.send("navigate", "/accounts");
      }
    });
    n.show();
  }

  private nowParts(timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
    return {
      year: Number(get("year")),
      month: Number(get("month")),
      day: Number(get("day")),
      hour: Number(get("hour")),
      minute: Number(get("minute")),
    };
  }
}