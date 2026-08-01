import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 构建产物输出到 web/dist,由 server.mjs 静态托管。
// 开发模式: vite --root web (可用 --proxy 或手动把 /api 指到 3838)。
export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3838",
    },
  },
});
