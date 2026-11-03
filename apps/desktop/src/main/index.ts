import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

function uiUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) return process.env.VITE_DEV_SERVER_URL;
  return pathToFileURL(path.join(process.resourcesPath, "ui", "index.html")).href;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Money Tracker",
    webPreferences: {
      preload: path.join(path.dirname(fileURLToPath(import.meta.url)), "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(uiUrl());
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
  tray = new Tray(img.isEmpty() ? nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAHElEQVQoz2NgGAWjYBSMglEwCkbBKBgFo4AaAACJ5gABGqEwWwAAAABJRU5ErkJggg==",
  ) : img);
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