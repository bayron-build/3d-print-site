import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirror the tsconfig `@/*` path alias so Vitest resolves value imports of
// project modules (e.g. `@/lib/format`) the same way Next.js does at build
// time. Uses only vitest's bundled Vite config helper — no extra dependency.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
