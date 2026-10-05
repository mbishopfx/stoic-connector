import { build } from "esbuild";
import fs from "node:fs/promises";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

await build({
  entryPoints: ["src/mcp-app/widget-react.tsx"],
  outfile: "public/stoic-mcp-widget.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  tsconfig: "tsconfig.json",
  jsx: "automatic",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
});

const widgetCss = await fs.readFile("src/mcp-app/widget.css", "utf8");
const compiledCss = await postcss([tailwindcss()]).process(widgetCss, {
  from: "src/mcp-app/widget.css",
  to: "public/stoic-mcp-widget.css",
});
await fs.writeFile("public/stoic-mcp-widget.css", compiledCss.css);

console.log("Built the Stoic ShadCN MCP App widget and stylesheet.");
