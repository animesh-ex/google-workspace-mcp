import { build } from "esbuild";
const banner = { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" };
for (const [entry, out] of [["src/index.ts", "plugin/server/index.mjs"], ["src/auth-cli.ts", "plugin/server/auth-cli.mjs"]]) {
  await build({ entryPoints: [entry], outfile: out, bundle: true, platform: "node", target: "node20", format: "esm", banner, minify: true, legalComments: "none", logLevel: "warning" });
}
console.log("bundled");
