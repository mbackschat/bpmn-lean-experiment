import type { Server } from "node:http";
import { createServer } from "node:http";
import { rm } from "node:fs/promises";

import {
  createPlatformServer,
  readPlatformServerConfig,
} from "@bpmn-lean/platform-server";
import type { PlatformServerRuntime } from "@bpmn-lean/platform-server";
import { configuredEffectHandler } from "@bpmn-lean/temporal-host/worker";

import { showcaseEngineDeploymentEnvironment } from "../../engine-deployment.ts";
import {
  verifyIncidentTerminalEvidence,
} from "../test/temporal-evidence.ts";
import type { ShowcaseEvidence } from "../test/temporal-evidence.ts";
import {
  ShowcaseWorker,
  createCachedLocalEnvironment,
  environmentNamespace,
  withDeadline,
} from "./host-worker.ts";

const operationDeadlineMs = 10_000;
const environmentStartupDeadlineMs = 40_000;

type Environment = Awaited<ReturnType<typeof createCachedLocalEnvironment>>;

type VerificationRequest = Readonly<{
  retryProcessInstanceId: string;
  cancelledProcessInstanceId: string;
}>;

/** Owns real production servers while exposing only lifecycle controls to the harness. */
export class IncidentOperationsShowcaseRuntime {
  readonly #dataDirectory: string;
  readonly #temporalCacheDirectory: string;
  #environment: Environment | undefined;
  #worker: ShowcaseWorker | undefined;
  #platform: PlatformServerRuntime | undefined;
  #controlServer: Server | undefined;

  constructor(
    dataDirectory: string,
    temporalCacheDirectory: string,
  ) {
    this.#dataDirectory = dataDirectory;
    this.#temporalCacheDirectory = temporalCacheDirectory;
  }

  async start(): Promise<void> {
    this.#environment = await withDeadline(
      createCachedLocalEnvironment({
        identity: `bpmn-m4-incident-operations-server-${process.pid}`,
        downloadDirectory: this.#temporalCacheDirectory,
      }),
      environmentStartupDeadlineMs,
      "M4 incident operations Temporal environment startup",
    );
    await this.startWorker();
    await this.#startPlatform();
    await this.#startControlServer();
  }

  async restartPlatform(): Promise<void> {
    await this.#platform?.close();
    this.#platform = undefined;
    await this.#startPlatform();
  }

  async stopWorker(): Promise<void> {
    await this.#worker?.shutdown();
    this.#worker = undefined;
  }

  async startWorker(): Promise<void> {
    if (this.#worker !== undefined) return;
    const environment = this.#requireEnvironment();
    this.#worker = await withDeadline(
      ShowcaseWorker.start(environment, {
        taskQueue: engineTaskQueue(),
        identity: `bpmn-m4-incident-operations-worker-${process.pid}`,
        effects: incidentEffects,
      }),
      operationDeadlineMs,
      "M4 incident operations Worker startup",
    );
  }

  async verifyAndReplay(request: VerificationRequest): Promise<ShowcaseEvidence> {
    if (this.#worker === undefined) throw new Error("M4 Worker must be running for evidence inspection");
    return verifyIncidentTerminalEvidence({
      client: this.#requireEnvironment().client,
      population: engineTaskQueue(),
      retryProcessInstanceId: request.retryProcessInstanceId,
      cancelledProcessInstanceId: request.cancelledProcessInstanceId,
    });
  }

  async close(): Promise<void> {
    const failures: unknown[] = [];
    for (const close of [
      this.#controlServer === undefined
        ? undefined
        : () => closeServer(this.#controlServer!),
      this.#platform === undefined ? undefined : () => this.#platform!.close(),
      this.#worker === undefined ? undefined : () => this.#worker!.shutdown(),
      this.#environment === undefined
        ? undefined
        : () => this.#environment!.teardown(),
      () => rm(this.#dataDirectory, { recursive: true, force: true }),
    ]) {
      try {
        await close?.();
      } catch (error: unknown) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "M4 incident operations cleanup failed");
    }
  }

  async #startPlatform(): Promise<void> {
    const environment = this.#requireEnvironment();
    const configured = readPlatformServerConfig({ ...process.env, ...showcaseEngineDeploymentEnvironment() });
    this.#platform = await createPlatformServer({
      ...configured,
      dataDirectory: this.#dataDirectory,
      temporalAddress: environment.address,
      temporalNamespace: environmentNamespace(environment),
    });
    try {
      await withDeadline(
        this.#platform.listen(),
        operationDeadlineMs,
        "M4 incident operations platform listen",
      );
    } catch (error: unknown) {
      await this.#platform.close();
      this.#platform = undefined;
      throw error;
    }
  }

  async #startControlServer(): Promise<void> {
    const port = controlPort();
    this.#controlServer = createServer(async (request, response) => {
      try {
        if (request.method === "GET" && request.url === "/health") {
          return sendJson(response, 200, { status: "ready" });
        }
        if (request.method !== "POST") {
          return sendJson(response, 405, { error: "methodNotAllowed" });
        }
        switch (request.url) {
          case "/platform/restart":
            await this.restartPlatform();
            return sendJson(response, 200, { status: "restarted" });
          case "/worker/stop":
            await this.stopWorker();
            return sendJson(response, 200, { status: "stopped" });
          case "/worker/start":
            await this.startWorker();
            return sendJson(response, 200, { status: "started" });
          case "/verify":
            return sendJson(
              response,
              200,
              await this.verifyAndReplay(await readVerificationRequest(request)),
            );
          default:
            return sendJson(response, 404, { error: "notFound" });
        }
      } catch (error: unknown) {
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : "unknown control failure",
        });
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.#controlServer!.once("error", reject);
      this.#controlServer!.listen(port, "127.0.0.1", () => {
        this.#controlServer!.off("error", reject);
        resolve();
      });
    });
  }

  #requireEnvironment(): Environment {
    if (this.#environment === undefined) {
      throw new Error("M4 Temporal environment is not running");
    }
    return this.#environment;
  }

}

/**
 * The probe operation of `scenarios/service-task-effect`, the Process this showcase starts: each occurrence's first
 * execution fails technically, opening an incident, and every later one succeeds. The host's failure count in the
 * request decides it, so an operator's Retry, a replaced Worker and a transport retry all see the same answer.
 */
const incidentEffects = configuredEffectHandler([{
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
  operation: "urn:bpmn-lean:effect-operation:probe-v1",
  technicalFailures: 1,
  result: { kind: "success", localPatch: [] },
}]);

/** The platform's configured Task Queue, which its Worker serves and which names its engine population. */
function engineTaskQueue(): string {
  return readPlatformServerConfig({ ...process.env, ...showcaseEngineDeploymentEnvironment() }).temporalTaskQueue;
}

function controlPort(): number {
  const value = Number(process.env.M4_SHOWCASE_CONTROL_PORT ?? "3205");
  if (!Number.isSafeInteger(value) || value <= 0 || value > 65_535) {
    throw new RangeError("M4_SHOWCASE_CONTROL_PORT must be a valid TCP port");
  }
  return value;
}

async function readVerificationRequest(
  request: import("node:http").IncomingMessage,
): Promise<VerificationRequest> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunkValue of request) {
    const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue);
    length += chunk.byteLength;
    if (length > 4_096) throw new RangeError("control request is too large");
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (
    typeof value !== "object" ||
    value === null ||
    Object.keys(value).sort().join("|") !==
      "cancelledProcessInstanceId|retryProcessInstanceId"
  ) {
    throw new TypeError("verification request has invalid fields");
  }
  const exact = value as Record<string, unknown>;
  if (
    typeof exact.retryProcessInstanceId !== "string" ||
    exact.retryProcessInstanceId.length === 0 ||
    typeof exact.cancelledProcessInstanceId !== "string" ||
    exact.cancelledProcessInstanceId.length === 0
  ) {
    throw new TypeError("verification Process identities must be nonempty strings");
  }
  return {
    retryProcessInstanceId: exact.retryProcessInstanceId,
    cancelledProcessInstanceId: exact.cancelledProcessInstanceId,
  };
}

function sendJson(
  response: import("node:http").ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
}
