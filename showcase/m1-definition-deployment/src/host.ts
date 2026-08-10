import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPlatformServer,
  readPlatformServerConfig,
} from "@bpmn-lean/platform-server";
import {
  ExternalTemporalRuntime,
  createCachedLocalEnvironment,
  createHostEffectActivities,
} from "@bpmn-lean/temporal-testkit";

const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);

async function runShowcaseHost(): Promise<void> {
  const configured = readPlatformServerConfig();
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-m1-showcase-"));
  const identity = `bpmn-m1-showcase-${process.pid}`;
  let environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>> | undefined;
  let worker: ExternalTemporalRuntime | undefined;
  let platform: Awaited<ReturnType<typeof createPlatformServer>> | undefined;
  try {
    environment = await createCachedLocalEnvironment({
      identity: `${identity}-server`,
      downloadDirectory: temporalCacheDirectory,
    });
    worker = await ExternalTemporalRuntime.connect({
      address: environment.address,
      namespace: environment.namespace ?? "default",
      taskQueue: configured.temporalTaskQueue,
      identity: `${identity}-worker`,
    }, createHostEffectActivities([]));
    platform = await createPlatformServer({
      ...configured,
      dataDirectory,
      temporalAddress: environment.address,
      temporalNamespace: environment.namespace ?? "default",
    });
    const origin = await platform.listen();
    process.stdout.write(`M1 showcase ready at ${origin}\n`);
    await terminationSignal();
  } finally {
    try {
      await closeShowcase(platform, worker, environment);
    } finally {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  }
}

function terminationSignal(): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
}

async function closeShowcase(
  platform: Awaited<ReturnType<typeof createPlatformServer>> | undefined,
  worker: ExternalTemporalRuntime | undefined,
  environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>> | undefined,
): Promise<void> {
  let firstFailure: unknown;
  for (const close of [
    platform === undefined ? undefined : () => platform.close(),
    worker === undefined ? undefined : () => worker.shutdown(),
    environment === undefined ? undefined : () => environment.teardown(),
  ]) {
    try {
      await close?.();
    } catch (error: unknown) {
      firstFailure ??= error;
    }
  }
  if (firstFailure !== undefined) {
    throw firstFailure;
  }
}

await runShowcaseHost().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
