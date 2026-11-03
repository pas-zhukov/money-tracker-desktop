/// <reference types="vite/client" />

type DesktopApi = {
  users: {
    list: () => Promise<unknown>;
    create: (username: string, password: string) => Promise<unknown>;
    login: (username: string, password: string) => Promise<unknown>;
    logout: () => Promise<unknown>;
    current: () => Promise<unknown>;
    changePassword: (oldP: string, newP: string) => Promise<unknown>;
  };
  journal: {
    search: (query: unknown) => Promise<unknown>;
    create: (draft: unknown) => Promise<unknown>;
    update: (id: string, draft: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<unknown>;
    deleteLast: () => Promise<unknown>;
    summarize: (from: string, to: string) => Promise<unknown>;
    cashflow: (from: string, to: string) => Promise<unknown>;
    expensesByCategory: (query: unknown) => Promise<unknown>;
    quickParse: (text: string) => Promise<unknown>;
  };
  categories: {
    list: () => Promise<unknown>;
    active: (type: "INCOME" | "EXPENSE") => Promise<unknown>;
    create: (name: string, type: "INCOME" | "EXPENSE") => Promise<unknown>;
    rename: (id: string, name: string) => Promise<unknown>;
    archive: (id: string) => Promise<unknown>;
    restore: (id: string) => Promise<unknown>;
  };
  budget: {
    month: (ym: string) => Promise<unknown>;
    available: (ym: string) => Promise<unknown>;
    add: (ym: string, categoryId: string, amount: string) => Promise<unknown>;
    save: (ym: string, amounts: Record<string, string>) => Promise<unknown>;
    copy: (ym: string) => Promise<unknown>;
    series: (from: string, to: string) => Promise<unknown>;
  };
  balances: {
    list: () => Promise<unknown>;
    create: (name: string) => Promise<unknown>;
    rename: (id: string, name: string) => Promise<unknown>;
    archive: (id: string) => Promise<unknown>;
    restore: (id: string) => Promise<unknown>;
    record: (id: string, date: string, amount: string) => Promise<unknown>;
    deleteSnapshot: (id: string) => Promise<unknown>;
  };
  settings: {
    get: () => Promise<unknown>;
    payroll: (salaryDay: number, advanceDay: number, includeAdvance: boolean) => Promise<unknown>;
    app: (patch: unknown) => Promise<unknown>;
  };
  periods: {
    pay: () => Promise<unknown>;
    today: () => Promise<string>;
  };
  exportExcel: (from: string, to: string) => Promise<unknown>;
  backup: {
    export: () => Promise<unknown>;
    import: (password?: string) => Promise<unknown>;
  };
  persist: () => Promise<unknown>;
  onNavigate: (cb: (path: string) => void) => () => void;
};

declare global {
  interface Window {
    api: DesktopApi;
  }
}

export {};
