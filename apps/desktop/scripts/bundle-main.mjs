import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const outdir = path.join(root, "dist");

// Main process: ESM (package.json "type": "module")
await esbuild.build({
  entryPoints: [path.join(src, "main/index.ts")],
  outfile: path.join(outdir, "main/index.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  packages: "bundle",
  external: ["electron", "better-sqlite3"],
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
});

// Preload MUST be CommonJS — ESM preload often fails silently in Electron,
// leaving window.api undefined and a blank/black renderer.
await esbuild.build({
  entryPoints: [path.join(src, "preload/index.ts")],
  outfile: path.join(outdir, "preload/index.cjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  external: ["electron"],
});

console.log("Bundled electron main (esm) + preload (cjs)");
