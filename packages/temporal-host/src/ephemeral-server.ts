/**
 * Owner of every cached ephemeral Temporal server this package's tests start, extracted from the old adapter's
 * testkit (`packages/temporal-adapter/testkit/src/ephemeral-server.ts`) so nothing here imports that adapter.
 *
 * A `cached-download` executable requires its download directory to exist: the SDK otherwise reports a bare
 * `Failed to start ephemeral server: No such file or directory (os error 2)` naming neither the directory nor the
 * caller, so the directory is created here. Callers bound the combined create-and-start with their own deadline.
 */
import { mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { TestWorkflowEnvironment, type EphemeralServerExecutable } from "@temporalio/testing";

/** Pinned Temporal CLI release providing the local ephemeral server. */
export const temporalCliVersion = "v1.8.1";

export interface CachedEnvironmentOptions {
  /** Client identity recorded on the ephemeral server's connections. */
  readonly identity: string;
  /** Executable cache directory, created when absent. */
  readonly downloadDirectory: string;
}

/** Starts a local ephemeral server that advances time with the host clock. */
export async function createCachedLocalEnvironment(options: CachedEnvironmentOptions): Promise<TestWorkflowEnvironment> {
  return TestWorkflowEnvironment.createLocal({
    server: { executable: await cachedExecutable(options.downloadDirectory, temporalCliVersion, `temporal-${temporalCliVersion}`) },
    client: { identity: options.identity },
  });
}

/**
 * Starts a time-skipping test server. It is a distinct executable from the Temporal CLI, so it carries the SDK's own
 * pinned `default` release rather than {@link temporalCliVersion}.
 */
export async function createCachedTimeSkippingEnvironment(options: CachedEnvironmentOptions): Promise<TestWorkflowEnvironment> {
  const sdkVersion = (createRequire(import.meta.url)("@temporalio/testing/package.json") as { version: string }).version;
  return TestWorkflowEnvironment.createTimeSkipping({
    server: {
      executable: await cachedExecutable(options.downloadDirectory, "default", `temporal-test-server-sdk-typescript-${sdkVersion}`),
    },
    client: { identity: options.identity },
  });
}

/**
 * Preserves installed version-bound executables across offline runs. The pinned SDK's `ephemeral-server.ts` gives
 * even fixed versions a one-day TTL, and sdk-core `ephemeral_server::remove_file_past_ttl` deletes the old binary
 * before fetching its replacement; its `ExistingPath` arm bypasses that expiry. Cache names follow
 * `EphemeralExe::get_or_download`.
 */
async function cachedExecutable(downloadDirectory: string, version: string, basename: string): Promise<EphemeralServerExecutable> {
  await mkdir(downloadDirectory, { recursive: true });
  const executable = path.resolve(downloadDirectory, `${basename}${process.platform === "win32" ? ".exe" : ""}`);
  const metadata = await stat(executable).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (metadata !== undefined) {
    if (!metadata.isFile()) throw new Error(`Temporal executable cache entry is not a file: ${executable}`);
    return { type: "existing-path", path: executable };
  }
  return { type: "cached-download", version, downloadDir: downloadDirectory };
}
