import { RcShowcaseRuntime } from "./rc-showcase-runtime.ts";
import { Runtime } from "@temporalio/worker";

// SDK RuntimeOptions defaults to signal-driven worker shutdown; this host owns the ordered cleanup.
Runtime.install({ shutdownSignals: [] });

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--automated-participants")) {
  throw new Error("Usage: rc-showcase-host.ts [--automated-participants]");
}
const automatedParticipants = args[0] === "--automated-participants";
const port = process.env.API_ORIGIN === undefined
  ? Number(process.env.PLATFORM_PORT ?? (automatedParticipants ? "3001" : "3000"))
  : Number(new URL(process.env.API_ORIGIN).port || "80");
const webAssetDirectory = process.env.PLATFORM_WEB_ASSET_DIRECTORY;
const runtime = await RcShowcaseRuntime.create({
  port, automatedParticipants, ...(webAssetDirectory === undefined ? {} : { webAssetDirectory }),
});

let ready = false;
let stopRequested = false;
const shutdown = (): void => {
  stopRequested = true;
  if (!ready) return;
  void runtime.close().catch((error: unknown) => {
    console.error("RC showcase cleanup failed", error);
    process.exitCode = 1;
  });
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
try {
  await runtime.start();
  ready = true;
  console.log(`RC showcase: ${runtime.origin} (${automatedParticipants
    ? "automation host: scripted participants and simulated services"
    : "interactive evaluation: tasks wait for you in Work"})`);
  console.log(`Prepared process catalog: ${runtime.origin}/#/definitions?view=showcases`);
  if (stopRequested) shutdown();
  await runtime.wait();
} finally {
  await runtime.close();
  process.off("SIGINT", shutdown);
  process.off("SIGTERM", shutdown);
}
