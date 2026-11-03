import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
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

function resolveExactVersion(packageName) {
  const pkgJson = require.resolve(`${packageName}/package.json`, { paths: [appDir] });
  return JSON.parse(readFileSync(pkgJson, "utf8")).version;
}

try {
  if (!existsSync(path.join(appDir, "dist", "main", "index.js"))) {
    throw new Error("Run pnpm build first (missing apps/desktop/dist)");
  }
  if (!existsSync(uiDist)) {
    throw new Error(`UI build missing at ${uiDist}`);
  }

  const electronVersion = resolveExactVersion("electron");
  const electronBuilderVersion = resolveExactVersion("electron-builder");
  console.log(`Using electron@${electronVersion}, electron-builder@${electronBuilderVersion}`);

  rmSync(releaseOut, { recursive: true, force: true });
  cpSync(path.join(appDir, "dist"), path.join(stage, "dist"), { recursive: true });

  const pkg = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8"));
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
          // Exact pin required by electron-builder / install-app-deps.
          electron: electronVersion,
          "electron-builder": electronBuilderVersion,
        },
      },
      null,
      2,
    ),
  );

  let builderYml = readFileSync(path.join(appDir, "electron-builder.yml"), "utf8");
  builderYml = builderYml.replace(/from:\s*\.\.\/ui\/dist/, `from: ${JSON.stringify(uiDist)}`);
  if (!/^electronVersion:/m.test(builderYml)) {
    builderYml = `electronVersion: ${electronVersion}\n` + builderYml;
  } else {
    builderYml = builderYml.replace(/^electronVersion:.*$/m, `electronVersion: ${electronVersion}`);
  }
  writeFileSync(path.join(stage, "electron-builder.yml"), builderYml);

  // Flat npm install — no pnpm workspace symlinks outside the stage dir.
  run("npm", ["install", "--no-fund", "--no-audit"], stage);
  run("npx", ["electron-builder", "install-app-deps"], stage);
  run(
    "npx",
    ["electron-builder", "--win", "nsis", "--x64", "--config", "electron-builder.yml", "--publish", "never"],
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

void realpathSync;
