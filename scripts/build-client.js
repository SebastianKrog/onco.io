import { build } from "esbuild";

const entryPoints = [
  "client/alert-events.js",
  "client/budget.js",
  "client/client.js",
  "client/hex.js",
];

await build({
  entryPoints,
  outdir: "public",
  format: "esm",
  minifyWhitespace: true,
  sourcemap: true,
  sourcesContent: true,
});
