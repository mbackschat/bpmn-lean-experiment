import { readFileSync } from "node:fs";

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { buildProcessShowcaseCatalog } from "../../../scripts/rc-showcase-catalog.ts";

const platformApiOrigin =
  process.env.PLATFORM_API_ORIGIN ?? "http://127.0.0.1:3000";
const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as Readonly<{ version: string }>;

export default defineConfig(async () => ({
  build: {
    manifest: true,
  },
  define: {
    __BPMN_LEAN_PRODUCT_VERSION__: JSON.stringify(packageJson.version),
    __BPMN_PROCESS_SHOWCASES__: JSON.stringify(await buildProcessShowcaseCatalog(
      fileURLToPath(new URL("../../../", import.meta.url)),
    )),
  },
  server: {
    proxy: {
      "/api": {
        target: platformApiOrigin,
      },
    },
  },
}));
