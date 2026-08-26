#!/usr/bin/env node

import { createRecoveryWorker } from "./composition.js";
import { readRecoveryWorkerConfig } from "./config.js";
import { serializeRecoveryWorkerFailure } from "./runtime.js";

async function main(): Promise<void> {
  const runtime = await createRecoveryWorker(readRecoveryWorkerConfig());
  let shutdown: Promise<void> | null = null;
  const stop = (): void => {
    shutdown ??= runtime.close();
    void shutdown.catch(() => undefined);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await runtime.run();
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    shutdown ??= runtime.close();
    await shutdown;
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${serializeRecoveryWorkerFailure(error)}\n`);
  process.exitCode = 1;
});
