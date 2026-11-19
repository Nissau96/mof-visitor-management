import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // The reports page is lazy-loaded, so Vite would only discover
    // ECharts on first visit and re-bundle mid-session ("504 Outdated
    // Optimize Dep"). Pre-bundling it at start-up avoids that.
    include: [
      "echarts/core",
      "echarts/charts",
      "echarts/components",
      "echarts/renderers",
    ],
  },
});
