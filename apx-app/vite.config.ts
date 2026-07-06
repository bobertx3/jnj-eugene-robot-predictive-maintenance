import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Standalone vite config used to build the UI outside of `apx build`.
// apx's dependency "heal" installs an incompatible vite 7 + @vitejs/plugin-react 6
// pair; here we pin the compatible pair (matching apx's own template) and build
// directly, then package the wheel with `apx build --skip-ui-build`.
const uiRoot = path.resolve(__dirname, "src/jnj_dsp2_gold_genie/ui");
const distDir = path.resolve(__dirname, "src/jnj_dsp2_gold_genie/__dist__");

export default defineConfig({
  root: uiRoot,
  plugins: [react(), tailwindcss()],
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
