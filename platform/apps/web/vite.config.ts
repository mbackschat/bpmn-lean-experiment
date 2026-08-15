import { readFileSync } from "node:fs";

import { defineConfig } from "vite";

const platformApiOrigin =
  process.env.PLATFORM_API_ORIGIN ?? "http://127.0.0.1:3000";
const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as Readonly<{ version: string }>;

export default defineConfig({
  build: {
    manifest: true,
  },
  define: {
    __BPMN_LEAN_PRODUCT_VERSION__: JSON.stringify(packageJson.version),
  },
  server: {
    proxy: {
      "/api": {
        target: platformApiOrigin,
      },
    },
  },
});
