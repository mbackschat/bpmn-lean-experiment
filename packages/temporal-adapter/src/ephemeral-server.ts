import { mkdir } from "node:fs/promises";

import { TestWorkflowEnvironment } from "@temporalio/testing";

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
  await mkdir(options.downloadDirectory, { recursive: true });
  return TestWorkflowEnvironment.createLocal({
    server: {
      executable: {
        type: "cached-download",
        version: options.cliVersion ?? temporalCliVersion,
        downloadDir: options.downloadDirectory,
      },
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
  await mkdir(options.downloadDirectory, { recursive: true });
  return TestWorkflowEnvironment.createTimeSkipping({
    server: {
      executable: {
        type: "cached-download",
        version: "default",
        downloadDir: options.downloadDirectory,
      },
    },
    client: {
      identity: options.identity,
    },
  });
}
