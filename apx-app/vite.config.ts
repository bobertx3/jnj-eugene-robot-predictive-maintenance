import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";

// Standalone vite config used to build the UI outside of `apx build`.
// apx's dependency "heal" installs an incompatible vite 7 + @vitejs/plugin-react 6
// pair; here we pin the compatible pair (matching apx's own template) and build
// directly, then package the wheel with `apx build --skip-ui-build`.
const uiRoot = path.resolve(__dirname, "src/jnj_dsp2_gold_genie/ui");
const distDir = path.resolve(__dirname, "src/jnj_dsp2_gold_genie/__dist__");

// apx injects compile-time globals (e.g. __APP_NAME__) via a vite `define`.
// Replicate that here so the UI does not crash with "__APP_NAME__ is not defined".
// Read the app name from pyproject.toml so it stays in sync with apx.
const pyproject = parseToml(
  readFileSync(path.resolve(__dirname, "pyproject.toml"), "utf-8"),
) as { tool?: { apx?: { metadata?: { "app-name"?: string } } } };
const appName = pyproject.tool?.apx?.metadata?.["app-name"] ?? "App";

export default defineConfig({
  root: uiRoot,
  plugins: [react(), tailwindcss()],
  define: {
    __APP_NAME__: JSON.stringify(appName),
  },
  resolve: {
    alias: {
      "@": uiRoot,
    },
  },
  build: {
    outDir: distDir,
    emptyOutDir: true,
  },
});
