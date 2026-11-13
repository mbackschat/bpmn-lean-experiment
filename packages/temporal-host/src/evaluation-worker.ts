/**
 * The evaluation Worker: the generic host Worker (`worker.ts`) on the configured Namespace and Task Queue, serving the
 * handlers its configuration declares, with a liveness and readiness endpoint for the container runtime.
 *
 * Starting never creates a Namespace and never serves a Process the configuration cannot answer: a missing or unknown
 * variable, an absent Namespace or an unreachable server stops the process before it polls. Creating the Namespace is
 * the separate `initialize-fresh-namespace` command, which refuses one that exists.
 */
import { createServer, type Server } from "node:http";

import { isGrpcServiceError } from "@temporalio/client";
import { NativeConnection } from "@temporalio/worker";

import { configuredEffectHandler } from "./configured-effects.js";
import { loadEvaluationWorkerConfig, type EvaluationWorkerConfig } from "./evaluation-worker-config.js";
import { createHostWorker } from "./worker.js";

/** gRPC status codes of the Temporal frontend's answers (https://grpc.github.io/grpc/core/md_doc_statuscodes.html). */
const grpcNotFound = 5;
const grpcAlreadyExists = 6;

const usage = "usage: node dist/evaluation-worker-main.js [initialize-fresh-namespace --retention-seconds SECONDS]";

export interface EvaluationWorkerRuntime {
  /** Settles when the Worker has stopped; rejects when its pollers fail. */
  readonly finished: Promise<void>;
  /** Throws unless the Worker is polling. */
  assertHealthy(): void;
  /** Rejects unless the configured Namespace answers. */
  assertNamespace(): Promise<void>;
  /** Stops polling, waits until the Worker has drained and closes its connection; idempotent. */
  shutdown(): Promise<void>;
}

export interface EvaluationWorkerHealthServer {
  close(): Promise<void>;
}

export interface EvaluationWorkerDependencies {
  connect(config: EvaluationWorkerConfig): Promise<EvaluationWorkerRuntime>;
  initializeFreshNamespace(config: EvaluationWorkerConfig, retentionSeconds: number): Promise<void>;
  startHealthServer(port: number, runtime: EvaluationWorkerRuntime): Promise<EvaluationWorkerHealthServer>;
}

/** The command line: no argument runs the Worker, `initialize-fresh-namespace` registers its Namespace once. */
export async function runEvaluationWorkerCommand(
  environment: NodeJS.ProcessEnv,
  args: readonly string[],
  dependencies: EvaluationWorkerDependencies = temporalDependencies,
): Promise<void> {
  switch (args[0]) {
    case undefined:
      return runEvaluationWorker(loadEvaluationWorkerConfig(environment), dependencies);
    case "initialize-fresh-namespace": {
      const retention = args[2];
      if (args.length !== 3 || args[1] !== "--retention-seconds" || retention === undefined
        || !/^[1-9][0-9]*$/u.test(retention) || !Number.isSafeInteger(Number(retention))) {
        throw new TypeError(`initialize-fresh-namespace requires --retention-seconds with a positive safe decimal integer; ${usage}`);
      }
      return dependencies.initializeFreshNamespace(loadEvaluationWorkerConfig(environment), Number(retention));
    }
    default:
      throw new TypeError(usage);
  }
}

/** Runs until the Worker stops or its pollers fail; the Worker itself stops on SIGINT and SIGTERM. */
async function runEvaluationWorker(config: EvaluationWorkerConfig, dependencies: EvaluationWorkerDependencies): Promise<void> {
  const runtime = await dependencies.connect(config);
  let health: EvaluationWorkerHealthServer | undefined;
  const failures: unknown[] = [];
  const record = (error: unknown): void => {
    failures.push(error);
  };
  try {
    health = await dependencies.startHealthServer(config.healthPort, runtime);
    await runtime.finished;
  } catch (error) {
    record(error);
  } finally {
    await health?.close().catch(record);
    await runtime.shutdown().catch(record);
  }
  // The first failure is the cause; one raised while closing down is usually a consequence of it.
  if (failures.length > 0) throw failures[0];
}

/**
 * The status of one health request. Liveness is a polling Worker; readiness adds the configured Namespace, which a
 * Worker polling a deleted one would otherwise hide until its next poll failed.
 */
export async function evaluationHealthStatus(
  method: string | undefined,
  url: string | undefined,
  runtime: Pick<EvaluationWorkerRuntime, "assertHealthy" | "assertNamespace">,
): Promise<204 | 404 | 503> {
  if (method !== "GET" || (url !== "/healthz" && url !== "/readyz")) return 404;
  try {
    runtime.assertHealthy();
    if (url === "/readyz") await runtime.assertNamespace();
    runtime.assertHealthy();
    return 204;
  } catch {
    return 503;
  }
}

/**
 * Serves {@link evaluationHealthStatus} on the container's loopback only: its one reader is the container's own
 * health check, so nothing else on the network sees the Worker's state.
 */
async function startHealthServer(port: number, runtime: EvaluationWorkerRuntime): Promise<EvaluationWorkerHealthServer> {
  const server = createServer((request, response) => {
    void evaluationHealthStatus(request.method, request.url, runtime).then((status) => response.writeHead(status).end());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return { close: () => closeServer(server) };
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

async function connectTemporal(address: string): Promise<NativeConnection> {
  try {
    return await NativeConnection.connect({ address });
  } catch (error) {
    throw new Error(`Temporal at ${address} is unreachable: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

async function describeNamespace(connection: NativeConnection, namespace: string): Promise<void> {
  try {
    await connection.workflowService.describeNamespace({ namespace });
  } catch (error) {
    const absent = isGrpcServiceError(error) && error.code === grpcNotFound;
    throw new Error(
      `Temporal Namespace ${namespace} is not available${absent ? "; a fresh deployment registers it once with initialize-fresh-namespace" : ""}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function connectWorker(config: EvaluationWorkerConfig): Promise<EvaluationWorkerRuntime> {
  const connection = await connectTemporal(config.address);
  try {
    await describeNamespace(connection, config.namespace);
    const worker = await createHostWorker({
      connection,
      namespace: config.namespace,
      taskQueue: config.taskQueue,
      identity: config.identity,
      effects: configuredEffectHandler(config.effects),
      scriptTimeoutMs: config.scriptTimeoutMs,
    });
    const finished = worker.run();
    // The runtime's consumer awaits `finished` after starting its health server; without this a poller failure in
    // between would be an unhandled rejection that ends the process before the failure is reported.
    finished.catch(() => undefined);
    let closing: Promise<void> | undefined;
    return {
      finished,
      assertHealthy: () => {
        const state = worker.getState();
        if (state !== "RUNNING") throw new Error(`the Worker is ${state}`);
      },
      assertNamespace: () => describeNamespace(connection, config.namespace),
      shutdown: () => (closing ??= (async () => {
        if (worker.getState() === "RUNNING") worker.shutdown();
        await finished.catch(() => undefined);
        await connection.close();
      })()),
    };
  } catch (error) {
    await connection.close().catch(() => undefined);
    throw error;
  }
}

async function registerNamespace(config: EvaluationWorkerConfig, retentionSeconds: number): Promise<void> {
  const connection = await connectTemporal(config.address);
  try {
    await connection.workflowService.registerNamespace({
      namespace: config.namespace,
      // The SDK 1.21.0 typings name `Long` for this int64, which protobufjs's encoder also takes as a number (checked
      // by encoding and decoding the request); `long` and `@temporalio/common`'s `msToTs` are not host dependencies.
      workflowExecutionRetentionPeriod: { seconds: retentionSeconds as never },
    });
  } catch (error) {
    if (isGrpcServiceError(error) && error.code === grpcAlreadyExists) {
      throw new Error(`Temporal Namespace ${config.namespace} already exists; fresh initialization refuses an existing Namespace`, { cause: error });
    }
    throw error;
  } finally {
    await connection.close();
  }
}

const temporalDependencies: EvaluationWorkerDependencies = {
  connect: connectWorker,
  initializeFreshNamespace: registerNamespace,
  startHealthServer,
};
