#!/usr/bin/env node

import { createServer } from "node:http";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { EffectActivityImplementations } from "@bpmn-lean/temporal-protocol";
import {
  ExternalTemporalRuntime,
} from "@bpmn-lean/temporal-worker";
import type {
  ExternalTemporalRuntimeOptions,
} from "@bpmn-lean/temporal-worker";

import { createEvaluationEffectActivities } from "./evaluation-effect-activities.js";
import { loadEvaluationWorkerConfig } from "./evaluation-worker-config.js";

const defaultHealthPollIntervalMs = 500;

export interface EvaluationWorkerRuntime {
  assertHealthy(): void;
  shutdown(): Promise<void>;
}

export interface EvaluationWorkerHealthServer {
  close(): Promise<void>;
}

export type EvaluationWorkerDependencies = Readonly<{
  connect(
    options: ExternalTemporalRuntimeOptions,
    activities: EffectActivityImplementations,
  ): Promise<EvaluationWorkerRuntime>;
  startHealthServer(
    port: number,
    runtime: EvaluationWorkerRuntime,
  ): Promise<EvaluationWorkerHealthServer>;
  terminationSignal: AbortSignal;
  healthPollIntervalMs: number;
}>;

/** Runs one evaluation Worker until the Host asks it to stop or its Temporal poller fails. */
export async function runEvaluationWorker(
  environment: NodeJS.ProcessEnv,
  dependencies: EvaluationWorkerDependencies,
): Promise<void> {
  const config = loadEvaluationWorkerConfig(environment);
  const runtime = await dependencies.connect(
    config.temporal,
    createEvaluationEffectActivities(),
  );
  let healthServer: EvaluationWorkerHealthServer | undefined;
  let failure: unknown;
  try {
    healthServer = await dependencies.startHealthServer(config.healthPort, runtime);
    await waitForStop(
      runtime,
      dependencies.terminationSignal,
      dependencies.healthPollIntervalMs,
    );
  } catch (error: unknown) {
    failure = error;
  } finally {
    try {
      await healthServer?.close();
    } catch (error: unknown) {
      failure ??= error;
    }
    try {
      await runtime.shutdown();
    } catch (error: unknown) {
      failure ??= error;
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
}

/** Starts the internal liveness endpoint after the Worker has connected. */
export async function startEvaluationWorkerHealthServer(
  port: number,
  runtime: EvaluationWorkerRuntime,
): Promise<EvaluationWorkerHealthServer> {
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/healthz") {
      response.writeHead(404).end();
      return;
    }
    try {
      runtime.assertHealthy();
      response.writeHead(204).end();
    } catch {
      response.writeHead(503).end();
    }
  });
  await listen(server, port);
  let closePromise: Promise<void> | undefined;
  return {
    close() {
      closePromise ??= close(server);
      return closePromise;
    },
  };
}

export async function runEvaluationWorkerCommand(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const termination = new AbortController();
  const stop = (): void => termination.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await runEvaluationWorker(environment, {
      connect: (options, activities) => ExternalTemporalRuntime.connect(
        options,
        activities,
      ),
      startHealthServer: startEvaluationWorkerHealthServer,
      terminationSignal: termination.signal,
      healthPollIntervalMs: defaultHealthPollIntervalMs,
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

function waitForStop(
  runtime: EvaluationWorkerRuntime,
  signal: AbortSignal,
  pollIntervalMs: number,
): Promise<void> {
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) {
    return Promise.reject(
      new RangeError("Worker health poll interval must be a positive safe integer"),
    );
  }
  return new Promise<void>((resolvePromise, rejectPromise) => {
    let settled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const finish = (failure?: unknown): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearInterval(timer);
      signal.removeEventListener("abort", stop);
      if (failure === undefined) resolvePromise();
      else rejectPromise(failure);
    };
    const check = (): void => {
      try {
        runtime.assertHealthy();
      } catch (error: unknown) {
        finish(error);
      }
    };
    const stop = (): void => finish();
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) {
      finish();
      return;
    }
    check();
    if (!settled) timer = setInterval(check, pollIntervalMs);
  });
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      rejectPromise(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolvePromise();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "0.0.0.0");
  });
}

function close(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => error === undefined
      ? resolvePromise()
      : rejectPromise(error));
  });
}

function isEntryPoint(moduleUrl: string, argvEntry: string | undefined): boolean {
  return argvEntry !== undefined && pathToFileURL(resolve(argvEntry)).href === moduleUrl;
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  void runEvaluationWorkerCommand().catch(() => {
    process.stderr.write("Evaluation BPMN Worker failed.\n");
    process.exitCode = 1;
  });
}
