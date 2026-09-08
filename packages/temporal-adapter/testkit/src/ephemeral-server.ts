import { mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { TestWorkflowEnvironment, type EphemeralServerExecutable } from "@temporalio/testing";

/**
 * Owner of every cached ephemeral Temporal server this project starts.
 *
 * A `cached-download` executable requires its download directory to already
 * exist: the SDK otherwise reports a bare `Failed to start ephemeral server:
 * No such file or directory (os error 2)`, which names neither the directory
 * nor the caller. Creating the directory here keeps that obligation out of call
 * sites, so no gate can depend on another gate — or an earlier local run —
 * having left the cache behind. Callers bound the combined create-and-start
 * operation with their own deadline.
 */

/** Pinned Temporal CLI release providing the local ephemeral server. */
export const temporalCliVersion = "v1.8.1";

type CachedEnvironmentOptions = Readonly<{
  /** Client identity recorded on the ephemeral server's connections. */
  identity: string;
  /** Executable cache directory, created when absent. */
  downloadDirectory: string;
}>;

/** Options for the host-clock Temporal CLI environment. */
export type CachedLocalEnvironmentOptions = Readonly<
  CachedEnvironmentOptions & {
    /** Defaults to {@link temporalCliVersion}. */
    cliVersion?: string;
  }
>;

/** Options for the SDK-owned time-skipping test environment. */
export type CachedTimeSkippingEnvironmentOptions = CachedEnvironmentOptions;

/** Starts a local ephemeral server that advances time with the host clock. */
export async function createCachedLocalEnvironment(
  options: CachedLocalEnvironmentOptions,
): Promise<TestWorkflowEnvironment> {
  const version = options.cliVersion ?? temporalCliVersion;
  const fixedVersion = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version);
  return TestWorkflowEnvironment.createLocal({
    server: {
      executable: await cachedExecutable(options.downloadDirectory, version,
        fixedVersion ? `temporal-${version}` : undefined),
    },
    client: {
      identity: options.identity,
    },
  });
}

/**
 * Starts a time-skipping test server.
 *
 * This server is a distinct executable from the Temporal CLI, so it carries the
 * SDK's own pinned `default` release rather than {@link temporalCliVersion}.
 */
export async function createCachedTimeSkippingEnvironment(
  options: CachedTimeSkippingEnvironmentOptions,
): Promise<TestWorkflowEnvironment> {
  const sdkVersion: string = createRequire(import.meta.url)("@temporalio/testing/package.json").version;
  return TestWorkflowEnvironment.createTimeSkipping({
    server: {
      executable: await cachedExecutable(options.downloadDirectory, "default",
        `temporal-test-server-sdk-typescript-${sdkVersion}`),
    },
    client: {
      identity: options.identity,
    },
  });
}

/**
 * Preserve installed version-bound executables across offline runs.
 *
 * The pinned SDK's `ephemeral-server.ts` supplies a one-day TTL even for fixed
 * versions; sdk-core `ephemeral_server::remove_file_past_ttl` deletes the old
 * binary before fetching its replacement. Its `ExistingPath` arm bypasses that
 * expiration. Cache names follow `EphemeralExe::get_or_download`; floating CLI
 * selectors retain SDK download policy.
 */
async function cachedExecutable(
  downloadDirectory: string,
  version: string,
  basename: string | undefined,
): Promise<EphemeralServerExecutable> {
  await mkdir(downloadDirectory, { recursive: true });
  if (basename !== undefined) {
    const executable = path.resolve(downloadDirectory, `${basename}${process.platform === "win32" ? ".exe" : ""}`);
    const metadata = await stat(executable).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (metadata !== undefined) {
      if (!metadata.isFile()) throw new Error(`Temporal executable cache entry is not a file: ${executable}`);
      return { type: "existing-path", path: executable };
    }
  }
  return { type: "cached-download", version, downloadDir: downloadDirectory };
}
