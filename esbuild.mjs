// Bundles the extension and its dependency (the TypeScript parser) into one file.
import { build } from "esbuild";

const production = process.argv.includes("--production");

await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  minify: production,
  sourcemap: !production,
  logLevel: "info",
});
