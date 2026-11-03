import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = mkdtempSync(path.join(tmpdir(), "mt-pack-"));
const releaseOut = path.join(appDir, "release");
const uiDist = path.resolve(appDir, "../ui/dist");

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with ${result.status}`);
  }
}

function collectExes(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectExes(full, out);
    else if (entry.name.toLowerCase().endsWith(".exe")) out.push(full);
  }
  return out;
}

try {
  if (!existsSync(path.join(appDir, "dist", "main", "index.js"))) {
    throw new Error("Run pnpm build first (missing apps/desktop/dist)");
  }
  if (!existsSync(uiDist)) {
    throw new Error(`UI build missing at ${uiDist}`);
  }

  rmSync(releaseOut, { recursive: true, force: true });

  cpSync(path.join(appDir, "dist"), path.join(stage, "dist"), { recursive: true });

  const pkg = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8"));
  const electronRange = pkg.devDependencies?.electron ?? pkg.dependencies?.electron;
  if (!electronRange) {
    throw new Error("electron version missing from apps/desktop/package.json");
  }
  writeFileSync(
    path.join(stage, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description ?? "Money Tracker",
        author: pkg.author ?? "Money Tracker",
        private: true,
        type: "module",
        main: "dist/main/index.js",
        dependencies: {
          "better-sqlite3": pkg.dependencies["better-sqlite3"],
          "electron-updater": pkg.dependencies["electron-updater"],
        },
        // Needed so install-app-deps rebuilds better-sqlite3 against Electron ABI.
        devDependencies: {
          electron: electronRange,
        },
      },
      null,
      2,
    ),
  );

  const builderYml = readFileSync(path.join(appDir, "electron-builder.yml"), "utf8").replace(
    /from:\s*\.\.\/ui\/dist/,
    `from: ${JSON.stringify(uiDist)}`,
  );
  writeFileSync(path.join(stage, "electron-builder.yml"), builderYml);

  // Flat npm install — no pnpm workspace symlinks outside the stage dir.
  run("npm", ["install", "--omit=dev", "--no-fund", "--no-audit"], stage);
  run("npx", ["--yes", "electron-builder", "install-app-deps"], stage);
  run(
    "npx",
    ["--yes", "electron-builder", "--win", "nsis", "--x64", "--config", "electron-builder.yml", "--publish", "never"],
    stage,
  );

  const stagedRelease = path.join(stage, "release");
  mkdirSync(releaseOut, { recursive: true });
  cpSync(stagedRelease, releaseOut, { recursive: true });

  const exes = collectExes(releaseOut);
  if (exes.length === 0) {
    throw new Error("No .exe produced in apps/desktop/release");
  }
  console.log("Packaged:\n" + exes.map((p) => ` - ${p}`).join("\n"));
} finally {
  rmSync(stage, { recursive: true, force: true });
}
