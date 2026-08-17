import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPlatformServer } from "./composition.js";
import { readPlatformServerConfig } from "./config.js";
import type { PlatformServerRuntime } from "./runtime.js";

export type PlatformServerLifecycle = Readonly<{
  once(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}>;

export type PlatformServerMainOverrides = Readonly<{
  createServer?: typeof createPlatformServer;
  lifecycle?: PlatformServerLifecycle;
  writeOrigin?: (origin: string) => void;
}>;

/** Runs one server until a termination signal or fatal lifecycle failure. */
export async function runPlatformServer(
  environment: NodeJS.ProcessEnv = process.env,
  overrides: PlatformServerMainOverrides = {},
): Promise<void> {
  const runtime = await (overrides.createServer ?? createPlatformServer)(
    readPlatformServerConfig(environment),
  );
  const lifecycle = overrides.lifecycle ?? process;
  let shutdown: Promise<void> | null = null;
  let resolveStopped: (() => void) | null = null;
  let rejectStopped: ((error: unknown) => void) | null = null;
  const stopped = new Promise<void>((resolve, reject) => {
    resolveStopped = resolve;
    rejectStopped = reject;
  });
  const stop = (): void => {
    shutdown ??= runtime.close();
    void shutdown.then(resolveStopped!, rejectStopped!);
  };
  lifecycle.once("SIGINT", stop);
  lifecycle.once("SIGTERM", stop);
  try {
    let origin: string;
    try {
      origin = await runtime.listen();
    } catch (error: unknown) {
      return await closeAfterFailure(runtime, error);
    }
    try {
      (overrides.writeOrigin ?? writeOrigin)(origin);
      await stopped;
    } catch (error: unknown) {
      if (shutdown !== null) throw error;
      return await closeAfterFailure(runtime, error);
    }
  } finally {
    lifecycle.off("SIGINT", stop);
    lifecycle.off("SIGTERM", stop);
  }
}

async function closeAfterFailure(
  runtime: PlatformServerRuntime,
  error: unknown,
): Promise<never> {
  try {
    await runtime.close();
  } catch (cleanupError: unknown) {
    throw new AggregateError(
      [error, cleanupError],
      "Platform server and cleanup both failed",
    );
  }
  throw error;
}

function writeOrigin(origin: string): void {
  process.stdout.write(`${origin}\n`);
}

function isEntryPoint(moduleUrl: string, argvEntry: string | undefined): boolean {
  return argvEntry !== undefined
    && pathToFileURL(resolve(argvEntry)).href === moduleUrl;
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  void runPlatformServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
