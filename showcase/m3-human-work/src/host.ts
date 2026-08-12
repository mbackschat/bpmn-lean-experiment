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
  withDeadline,
} from "@bpmn-lean/temporal-testkit";

import { reportM3HostFailure } from "./host-log.ts";

const operationDeadlineMs = 10_000;
const environmentStartupDeadlineMs = 40_000;
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);

async function runShowcaseHost(): Promise<void> {
  const configured = readPlatformServerConfig();
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-m3-human-work-"));
  const identity = `bpmn-m3-human-work-${process.pid}`;
  let environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>> | undefined;
  let worker: ExternalTemporalRuntime | undefined;
  let platform: Awaited<ReturnType<typeof createPlatformServer>> | undefined;
  try {
    environment = await withDeadline(
      createCachedLocalEnvironment({
        identity: `${identity}-server`,
        downloadDirectory: temporalCacheDirectory,
      }),
      environmentStartupDeadlineMs,
      "M3 Human Work browser Temporal environment startup",
    );
    worker = await withDeadline(
      ExternalTemporalRuntime.connect({
        address: environment.address,
        namespace: environment.namespace ?? "default",
        taskQueue: configured.temporalTaskQueue,
        identity: `${identity}-worker`,
      }, createHostEffectActivities([])),
      operationDeadlineMs,
      "M3 Human Work browser Worker startup",
    );
    platform = await createPlatformServer({
      ...configured,
      dataDirectory,
      temporalAddress: environment.address,
      temporalNamespace: environment.namespace ?? "default",
    });
    const origin = await withDeadline(
      platform.listen(),
      operationDeadlineMs,
      "M3 Human Work platform listen",
    );
    process.stdout.write(`M3 Human Work showcase ready at ${origin}\n`);
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
  if (firstFailure !== undefined) throw firstFailure;
}

await runShowcaseHost().catch((error: unknown) => {
  reportM3HostFailure(error);
  process.exitCode = 1;
});
