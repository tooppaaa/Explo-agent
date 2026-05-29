import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Build en mode librairie : un bundle IIFE auto-montant exposant window.initAgent.
// React/Recharts sont bundlés (widget framework-agnostic, PRD §9).
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      name: "CodeModeAgent",
      formats: ["iife"],
      fileName: () => "agent.js",
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
