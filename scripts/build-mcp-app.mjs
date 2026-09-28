import { build } from "esbuild";

await build({
  entryPoints: ["src/mcp-app/widget.ts"],
  outfile: "public/stoic-mcp-widget.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
});

console.log("Built the Stoic MCP App widget.");
