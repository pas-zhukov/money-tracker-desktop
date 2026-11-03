import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, registerIpc } from "./ipc.js";
import { ReminderScheduler } from "./reminder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const session = createSession();
const reminder = new ReminderScheduler(
  () => session,
  () => mainWindow,
);

function resolveUiIndexHtml(): string | null {
  const candidates = [
    // Packaged: electron-builder extraResources → resources/ui
    path.join(process.resourcesPath, "ui", "index.html"),
    // Unpackaged / monorepo: apps/ui/dist next to apps/desktop
    path.join(__dirname, "../../../ui/dist/index.html"),
    path.join(app.getAppPath(), "ui", "index.html"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function uiTarget(): { kind: "url"; value: string } | { kind: "file"; value: string } {
  if (process.env.VITE_DEV_SERVER_URL) {
    return { kind: "url", value: process.env.VITE_DEV_SERVER_URL };
  }
  const html = resolveUiIndexHtml();
  if (!html) {
    throw new Error(
      "UI index.html not found. Expected resources/ui or apps/ui/dist. Run pnpm build first.",
    );
  }
  return { kind: "file", value: html };
}

function preloadPath(): string {
  const cjs = path.join(__dirname, "../preload/index.cjs");
  if (existsSync(cjs)) return cjs;
  // Legacy fallback if an older build left .js around
  return path.join(__dirname, "../preload/index.js");
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Money Tracker",
    backgroundColor: "#10151c",
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const target = uiTarget();
  const wc = mainWindow.webContents;

  wc.on("did-fail-load", (_e, code, desc, url) => {
    console.error("did-fail-load", { code, desc, url });
    void wc.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<html><body style="font-family:sans-serif;background:#10151c;color:#e8eef6;padding:32px">
          <h1>Не удалось загрузить UI</h1>
          <p>${desc} (${code})</p>
          <pre>${url}</pre>
        </body></html>`,
      )}`,
    );
  });

  wc.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  wc.on("preload-error", (_e, preload, error) => {
    console.error("preload-error", preload, error);
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (target.kind === "url") {
    void mainWindow.loadURL(target.value);
  } else {
    void mainWindow.loadFile(target.value);
  }

  if (process.env.MT_DEBUG === "1") {
    wc.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function setAutostart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    path: process.execPath,
    args: enabled ? ["--hidden"] : [],
  });
}

function ensureTray(enabled: boolean): void {
  if (!enabled) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  const img = nativeImage.createEmpty();
  tray = new Tray(
    img.isEmpty()
      ? nativeImage.createFromDataURL(
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAHElEQVQoz2NgGAWjYBSMglEwCkbBKBgFo4AaAACJ5gABGqEwWwAAAABJRU5ErkJggg==",
        )
      : img,
  );
  tray.setToolTip("Money Tracker");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Открыть",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: "Выход",
        click: async () => {
          await session.logout();
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.whenReady().then(() => {
  registerIpc(session, (enabled) => {
    setAutostart(enabled);
    try {
      const settings = session.money.getAppSettings();
      ensureTray(settings.trayEnabled);
    } catch {
      ensureTray(enabled);
    }
  });
  createWindow();
  reminder.start();

  if (process.argv.includes("--hidden")) {
    mainWindow?.hide();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  reminder.stop();
  await session.logout();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  reminder.stop();
  await session.persist().catch(() => undefined);
  await session.logout().catch(() => undefined);
});
