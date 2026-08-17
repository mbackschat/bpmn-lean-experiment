#!/usr/bin/env node

import { createRecoveryWorker } from "./composition.js";
import { readRecoveryWorkerConfig } from "./config.js";

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

void main().catch(() => {
  process.stderr.write("recovery-worker failed\n");
  process.exitCode = 1;
});
