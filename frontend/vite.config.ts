import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import { loadEnv, type UserConfig } from "vite";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));

interface FrontendViteOptions {
  input?: Record<string, string>;
  outDir?: string;
}

export function createFrontendViteConfig(
  mode: string,
  options: FrontendViteOptions = {},
): UserConfig {
  const env = loadEnv(mode, process.cwd(), "");
  const backendOrigin = env.VITE_BACKEND_ORIGIN || "http://127.0.0.1:8000";
  const backendUrl = new URL(backendOrigin);
  const localBackend = backendUrl.hostname === "127.0.0.1" || backendUrl.hostname === "localhost";
  const backendApiPrefix = normalizeApiPrefix(
    env.VITE_BACKEND_API_PREFIX ?? (localBackend ? "" : "/api"),
  );
  const proxy = {
    "/api": {
      target: backendUrl.origin,
      changeOrigin: true,
      cookieDomainRewrite: "",
      ws: true,
      rewrite: (path: string) => `${backendApiPrefix}${path.replace(/^\/api/u, "")}` || "/",
    },
  };

  return {
    plugins: [react()],
    optimizeDeps: { include: ["react", "react-dom", "react/jsx-runtime"] },
    resolve: { alias: { "@": sourceRoot }, dedupe: ["react", "react-dom"] },
    server: { proxy },
    preview: { proxy },
    test: { hookTimeout: 15_000, testTimeout: 15_000, maxWorkers: 4 },
    build: {
      chunkSizeWarningLimit: 300,
      outDir: options.outDir,
      rollupOptions: {
        input: options.input,
      },
    },
  };
}

function normalizeApiPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/gu, "")}`;
}

export default defineConfig(({ mode }) => createFrontendViteConfig(mode));
