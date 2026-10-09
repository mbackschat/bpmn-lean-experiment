import { defineConfig } from "@playwright/test";

import invoice from "./playwright.invoice.config.ts";

const servers = invoice.webServer;
if (!Array.isArray(servers) || servers.length !== 2) {
  throw new Error("Invoice recovery acceptance requires the M3 API and production web servers.");
}

export default defineConfig({
  ...invoice,
  testMatch: "**/business-invoice-recovery.spec.ts",
  webServer: [
    { ...servers[0]!, command: "./scripts/pnpm.sh run showcase:m3-human-work:invoice-recovery-host" },
    servers[1]!,
  ],
});
