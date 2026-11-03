import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [
    path.join(root, "src/main/index.ts"),
    path.join(root, "src/preload/index.ts"),
  ],
  outdir: path.join(root, "dist"),
  outbase: path.join(root, "src"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  packages: "bundle",
  external: ["electron", "better-sqlite3", "argon2"],
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
});

console.log("Bundled electron main + preload");