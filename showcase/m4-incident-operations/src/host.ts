import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { IncidentOperationsShowcaseRuntime } from "./showcase-runtime.ts";

const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);

async function runShowcaseHost(): Promise<void> {
  const dataDirectory = await mkdtemp(
    join(tmpdir(), "bpmn-lean-m4-incident-operations-"),
  );
  const runtime = new IncidentOperationsShowcaseRuntime(
    dataDirectory,
    temporalCacheDirectory,
  );
  try {
    await runtime.start();
    process.stdout.write("M4 incident operations showcase ready\n");
    await terminationSignal();
  } finally {
    await runtime.close();
  }
}

function terminationSignal(): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
}

await runShowcaseHost().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`M4 incident operations showcase failed: ${message}\n`);
  process.exitCode = 1;
});
