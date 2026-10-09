import { defineConfig } from "@playwright/test";

import humanWork from "./playwright.config.ts";

const servers = humanWork.webServer;
if (!Array.isArray(servers) || servers.length !== 2) {
  throw new Error("Invoice acceptance requires the M3 API and production web servers.");
}

export default defineConfig({
  ...humanWork,
  testIgnore: [],
  testMatch: "**/business-invoice.spec.ts",
  webServer: [
    { ...servers[0]!, command: "./scripts/pnpm.sh run showcase:m3-human-work:invoice-host" },
    servers[1]!,
  ],
});
