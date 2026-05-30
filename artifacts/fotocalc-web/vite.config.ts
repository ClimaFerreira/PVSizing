import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT ?? "5174");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
  port,
  strictPort: true,
  host: "0.0.0.0",
  allowedHosts: true,
  headers: {
    "X-Frame-Options": "ALLOWALL",
    "Content-Security-Policy": "frame-ancestors *",
  },
  fs: {
    strict: true,
  },

  proxy: {
    "/api": {
      target: "http://localhost:3001",
      changeOrigin: true,
    },
  },
},

preview: {
  port,
  host: "0.0.0.0",
  allowedHosts: true,
  headers: {
    "X-Frame-Options": "ALLOWALL",
    "Content-Security-Policy": "frame-ancestors *",
  },
},
});
