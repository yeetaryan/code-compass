import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Use the exact production security headers in `vite preview`, so CSP problems show up locally.
const vercel = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8"));
const prodHeaders: Record<string, string> = Object.fromEntries(
  vercel.headers[0].headers.filter((h: { key: string }) => h.key !== "Strict-Transport-Security").map((h: { key: string; value: string }) => [h.key, h.value]),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:3001", changeOrigin: false } },
  },
  preview: {
    port: 5173,
    headers: prodHeaders,
    proxy: { "/api": { target: "http://localhost:3001", changeOrigin: false } },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // react/react-dom stay in the entry chunk: splitting them by hand breaks module init order.
          if (/node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//.test(id)) return "motion";
          if (/node_modules\/@tanstack\//.test(id)) return "query";
          if (/node_modules\/(better-auth|@better-auth|better-call|nanostores|@better-fetch)\//.test(id)) return "auth";
        },
      },
    },
  },
});
