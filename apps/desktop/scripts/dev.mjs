import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

const ui = spawn("pnpm", ["--filter", "@money-tracker/ui", "dev"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

await waitOn({ resources: ["http://127.0.0.1:5173"], timeout: 120000 });

const electronBin = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);

// Ensure desktop is built
await new Promise((resolve, reject) => {
  const build = spawn("pnpm", ["--filter", "@money-tracker/desktop", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("build failed"))));
});

const electron = spawn(electronBin, ["."], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  shell: true,
  env: { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:5173", ELECTRON_ENABLE_LOGGING: "1" },
});

const shutdown = () => {
  ui.kill();
  electron.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

electron.on("exit", shutdown);