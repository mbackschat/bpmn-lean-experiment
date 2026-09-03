import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import type { StateObservation } from "@bpmn-lean/semantic-core";
import {
  createPlatformServer,
  readPlatformServerConfig,
} from "@bpmn-lean/platform-server";
import type {
  PlatformServerRuntime,
} from "@bpmn-lean/platform-server";
import type {
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import {
  ExternalTemporalRuntime,
  createCachedLocalEnvironment,
  createHostEffectActivities,
  readBpmnProcessTrace,
  readUserTaskDetail,
  submitUserTaskCompletion,
  withDeadline,
} from "@bpmn-lean/temporal-testkit";
import type {
  HostInteractionPort,
} from "@bpmn-lean/temporal-testkit";

import {
  MuePreviewAlphaActor,
} from "./automated-actor.ts";
import type {
  AlphaInterruptionGate,
  AlphaJourneyResult,
} from "./automated-actor.ts";
import {
  verifyMuePreviewAlphaEvidence,
} from "../test/temporal-evidence.ts";
import type {
  MuePreviewAlphaEvidence,
} from "../test/temporal-evidence.ts";

const operationDeadlineMs = 20_000;
const environmentStartupDeadlineMs = 40_000;
const taskQueue = "bpmn-mue-preview-alpha";
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);

type Environment = Awaited<ReturnType<typeof createCachedLocalEnvironment>>;

/** Owns the real Alpha platform and Temporal processes inside the Playwright worker. */
export class MuePreviewAlphaShowcaseRuntime {
  readonly #dataDirectory: string;
  readonly #actor = new MuePreviewAlphaActor();
  #environment: Environment | undefined;
  #worker: ExternalTemporalRuntime | undefined;
  #platform: PlatformServerRuntime | undefined;

  private constructor(dataDirectory: string) {
    this.#dataDirectory = dataDirectory;
  }

  static async create(): Promise<MuePreviewAlphaShowcaseRuntime> {
    return new MuePreviewAlphaShowcaseRuntime(
      await mkdtemp(join(tmpdir(), "bpmn-lean-mue-preview-alpha-")),
    );
  }

  async start(): Promise<void> {
    if (this.#environment !== undefined || this.#platform !== undefined) {
      throw new Error("MUE Preview Alpha runtime is already started");
    }
    this.#environment = await withDeadline(
      createCachedLocalEnvironment({
        identity: `bpmn-mue-preview-alpha-server-${process.pid}`,
        downloadDirectory: temporalCacheDirectory,
      }),
      environmentStartupDeadlineMs,
      "MUE Preview Alpha Temporal environment startup",
    );
    await this.#startPlatform();
  }

  async startWorker(): Promise<void> {
    if (this.#worker !== undefined) return;
    const environment = this.#requireEnvironment();
    this.#worker = await withDeadline(
      ExternalTemporalRuntime.connect({
        address: environment.address,
        namespace: environment.namespace ?? "default",
        taskQueue,
        identity: `bpmn-mue-preview-alpha-worker-${process.pid}`,
      }, createHostEffectActivities([])),
      operationDeadlineMs,
      "MUE Preview Alpha Worker startup",
    );
  }

  async stopWorker(): Promise<void> {
    await this.#worker?.shutdown();
    this.#worker = undefined;
  }

  runNatural(
    instance: PublicProcessInstanceIdentity,
  ): Promise<AlphaJourneyResult> {
    return this.#actor.runNatural(instance, this.#interactionPort(instance));
  }

  runInterrupted(
    instance: PublicProcessInstanceIdentity,
    gate: AlphaInterruptionGate,
  ): Promise<AlphaJourneyResult> {
    return this.#actor.runInterrupted(instance, this.#interactionPort(instance), gate);
  }

  verifyAndReplay(
    naturalProcessInstanceId: string,
    interruptedProcessInstanceId: string,
  ): Promise<MuePreviewAlphaEvidence> {
    return verifyMuePreviewAlphaEvidence({
      client: this.#requireEnvironment().client,
      naturalProcessInstanceId,
      interruptedProcessInstanceId,
      temporalCacheDirectory,
    });
  }

  async close(): Promise<void> {
    const failures: unknown[] = [];
    for (const close of [
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
    this.#platform = undefined;
    this.#worker = undefined;
    this.#environment = undefined;
    if (failures.length > 0) {
      throw new AggregateError(failures, "MUE Preview Alpha cleanup failed");
    }
  }

  async #startPlatform(): Promise<void> {
    const environment = this.#requireEnvironment();
    const api = requireApiOrigin();
    const configured = readPlatformServerConfig({});
    this.#platform = await createPlatformServer({
      ...configured,
      host: api.hostname,
      port: requirePort(api),
      publicOrigin: api.origin,
      dataDirectory: this.#dataDirectory,
      maxSourceBytes: 1024 * 1024,
      parserDeadlineMs: 5_000,
      temporalAddress: environment.address,
      temporalNamespace: environment.namespace ?? "default",
      temporalTaskQueue: taskQueue,
      temporalConnectTimeoutMs: 5_000,
      fakeActorId: "alpha-preview-actor",
      fakeActorGroups: configured.fakeActorGroups,
      maxWorkProcesses: 10,
      maxWorkTasks: 20,
    });
    try {
      const listened = await withDeadline(
        this.#platform.listen(),
        operationDeadlineMs,
        "MUE Preview Alpha platform listen",
      );
      if (listened !== api.origin) {
        throw new Error(`Alpha platform listened at ${listened}, expected ${api.origin}`);
      }
    } catch (error: unknown) {
      await this.#platform.close();
      this.#platform = undefined;
      throw error;
    }
  }

  #interactionPort(instance: PublicProcessInstanceIdentity): HostInteractionPort {
    const client = this.#requireEnvironment().client.workflow;
    const processInstanceId = instance.processInstanceId;
    return {
      readState: async () => latestState(
        await readBpmnProcessTrace(client, processInstanceId),
      ),
      readUserTaskDetail: async (request) =>
        readUserTaskDetail(client, processInstanceId, request),
      submitCompletion: async (stimulus) =>
        submitUserTaskCompletion(client, processInstanceId, stimulus),
      submitMessage: async () => {
        throw new Error("MUE Preview Alpha actor must not submit Message stimuli");
      },
      publishCorrelated: async () => {
        throw new Error("MUE Preview Alpha actor must not publish correlated Message stimuli");
      },
      submitCancellation: async () => {
        throw new Error("MUE Preview Alpha actor must not submit cancellation stimuli");
      },
    };
  }

  #requireEnvironment(): Environment {
    if (this.#environment === undefined) {
      throw new Error("MUE Preview Alpha Temporal environment is not running");
    }
    return this.#environment;
  }
}

function latestState(
  trace: Awaited<ReturnType<typeof readBpmnProcessTrace>>,
): StateObservation {
  const observation = trace.findLast(
    (candidate) => candidate.kind === CanonicalObservationKind.State,
  );
  if (observation?.kind !== CanonicalObservationKind.State) {
    throw new Error("MUE Preview Alpha trace contains no committed state");
  }
  return observation;
}

function requireApiOrigin(): URL {
  const value = process.env.PLATFORM_API_ORIGIN;
  if (value === undefined) {
    throw new Error("Playwright config must provide PLATFORM_API_ORIGIN");
  }
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new Error("MUE Preview Alpha API must use loopback HTTP");
  }
  return url;
}

function requirePort(url: URL): number {
  const value = Number(url.port);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 65_535) {
    throw new Error("MUE Preview Alpha API origin must contain a valid port");
  }
  return value;
}
