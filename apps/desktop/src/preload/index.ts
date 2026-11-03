import { contextBridge, ipcRenderer } from "electron";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as Result<T>;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const api = {
  users: {
    list: () => invoke("users:list"),
    create: (username: string, password: string) => invoke("users:create", username, password),
    login: (username: string, password: string) => invoke("users:login", username, password),
    logout: () => invoke("users:logout"),
    current: () => invoke("users:current"),
    changePassword: (oldP: string, newP: string) => invoke("users:changePassword", oldP, newP),
  },
  journal: {
    search: (query: unknown) => invoke("journal:search", query),
    create: (draft: unknown) => invoke("journal:create", draft),
    update: (id: string, draft: unknown) => invoke("journal:update", id, draft),
    delete: (id: string) => invoke("journal:delete", id),
    deleteLast: () => invoke("journal:deleteLast"),
    summarize: (from: string, to: string) => invoke("journal:summarize", from, to),
    cashflow: (from: string, to: string) => invoke("journal:cashflow", from, to),
    expensesByCategory: (query: unknown) => invoke("journal:expensesByCategory", query),
    quickParse: (text: string) => invoke("journal:quickParse", text),
  },
  categories: {
    list: () => invoke("categories:list"),
    active: (type: "INCOME" | "EXPENSE") => invoke("categories:active", type),
    create: (name: string, type: "INCOME" | "EXPENSE") => invoke("categories:create", name, type),
    rename: (id: string, name: string) => invoke("categories:rename", id, name),
    archive: (id: string) => invoke("categories:archive", id),
    restore: (id: string) => invoke("categories:restore", id),
  },
  budget: {
    month: (ym: string) => invoke("budget:month", ym),
    available: (ym: string) => invoke("budget:available", ym),
    add: (ym: string, categoryId: string, amount: string) =>
      invoke("budget:add", ym, categoryId, amount),
    save: (ym: string, amounts: Record<string, string>) => invoke("budget:save", ym, amounts),
    copy: (ym: string) => invoke("budget:copy", ym),
    series: (from: string, to: string) => invoke("budget:series", from, to),
  },
  balances: {
    list: () => invoke("balances:list"),
    create: (name: string) => invoke("balances:create", name),
    rename: (id: string, name: string) => invoke("balances:rename", id, name),
    archive: (id: string) => invoke("balances:archive", id),
    restore: (id: string) => invoke("balances:restore", id),
    record: (id: string, date: string, amount: string) =>
      invoke("balances:record", id, date, amount),
    deleteSnapshot: (id: string) => invoke("balances:deleteSnapshot", id),
  },
  settings: {
    get: () => invoke("settings:get"),
    payroll: (salaryDay: number, advanceDay: number, includeAdvance: boolean) =>
      invoke("settings:payroll", salaryDay, advanceDay, includeAdvance),
    app: (patch: unknown) => invoke("settings:app", patch),
  },
  periods: {
    pay: () => invoke("periods:pay"),
    today: () => invoke("periods:today"),
  },
  exportExcel: (from: string, to: string) => invoke("export:excel", from, to),
  backup: {
    export: () => invoke("backup:export"),
    import: (password?: string) => invoke("backup:import", password),
  },
  persist: () => invoke("persist"),
  onNavigate: (cb: (path: string) => void) => {
    const listener = (_: unknown, pathName: string) => cb(pathName);
    ipcRenderer.on("navigate", listener);
    return () => {
      ipcRenderer.removeListener("navigate", listener);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);

export type DesktopApi = typeof api;