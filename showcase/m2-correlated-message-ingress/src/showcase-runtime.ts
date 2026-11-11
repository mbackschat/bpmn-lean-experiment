import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  createPlatformServer,
  readPlatformServerConfig,
} from "@bpmn-lean/platform-server";
import type {
  PlatformServerRuntime,
} from "@bpmn-lean/platform-server";
import { engineDefinitionMessageStartWorkflowId } from "@bpmn-lean/engine-api";
import type { EngineBinding, EngineOpenWait, EngineStateObservation } from "@bpmn-lean/engine-api";
import { ProcessClient } from "@bpmn-lean/temporal-host/client";

import { showcaseEngineDeploymentEnvironment } from "../../engine-deployment.ts";
import {
  ShowcaseWorker,
  createCachedLocalEnvironment,
  environmentNamespace,
  noEffects,
  withDeadline,
} from "./host-worker.ts";

const operationDeadlineMs = 20_000;
const environmentStartupDeadlineMs = 40_000;
const stateDeadlineMs = 30_000;
const taskQueue = "bpmn-m2-correlated-message-ingress";
const directCatchEventId = "MessageCatch_InitialSettlement";
const correlatedCatchEventId = "MessageCatch_CorrelatedSettlement";
const reviewTaskId = "UserTask_ReviewSettlement";
const channel = {
  kind: "operationMessage",
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
} as const;
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);

type Environment = Awaited<ReturnType<typeof createCachedLocalEnvironment>>;

/**
 * The host Workflow ID engine-api gives a directly started instance: engine-api exports its instance-address rule only
 * under the Message Start name, and both starts derive the address from the population and the instance.
 */
const processWorkflowId = (processInstanceId: string): string =>
  engineDefinitionMessageStartWorkflowId(taskQueue, processInstanceId);

/**
 * What a Process waiting for the correlated Message publishes: the wait's channel and the correlation key it is
 * correlated by, and the instance variables that hold that key's value. The old adapter's candidate query, which
 * paired an address with the key value, has no host counterpart until correlation-key registration lands.
 */
export type CorrelatedWait = Readonly<{
  wait: EngineOpenWait;
  variables: readonly EngineBinding[];
}>;

/** Real Temporal and production-platform composition for the browser witness. */
export class CorrelatedMessageShowcaseRuntime {
  readonly #dataDirectory: string;
  #environment: Environment | undefined;
  #worker: ShowcaseWorker | undefined;
  #platform: PlatformServerRuntime | undefined;

  private constructor(dataDirectory: string) {
    this.#dataDirectory = dataDirectory;
  }

  static async create(): Promise<CorrelatedMessageShowcaseRuntime> {
    return new CorrelatedMessageShowcaseRuntime(
      await mkdtemp(join(tmpdir(), "bpmn-lean-m2-correlated-message-")),
    );
  }

  async start(): Promise<void> {
    if (this.#environment !== undefined || this.#platform !== undefined) {
      throw new Error("correlated Message showcase runtime is already started");
    }
    this.#environment = await withDeadline(
      createCachedLocalEnvironment({
        identity: `bpmn-m2-correlated-message-server-${process.pid}`,
        downloadDirectory: temporalCacheDirectory,
      }),
      environmentStartupDeadlineMs,
      "M2 correlated Message Temporal environment startup",
    );
    const environment = this.#requireEnvironment();
    this.#worker = await withDeadline(
      ShowcaseWorker.start(environment, {
        taskQueue,
        identity: `bpmn-m2-correlated-message-worker-${process.pid}`,
        effects: noEffects,
      }),
      operationDeadlineMs,
      "M2 correlated Message Worker startup",
    );
    await this.#startPlatform();
  }

  /** Explicit showcase actor for the prerequisite direct payload Message. */
  async initializeCandidate(
    processInstanceId: string,
    commandId: string,
    value: string,
  ): Promise<CorrelatedWait> {
    await this.#waitForState(
      processInstanceId,
      (state) => messageWaits(state).some(({ id }) => id.elementId === directCatchEventId),
      "direct Message wait",
    );
    const stimulus = {
      kind: "deliver",
      commandId,
      occurrence: { processInstanceId, elementId: directCatchEventId, activation: 1 },
      trigger: { kind: "message", channel },
      payload: { kind: "string", value },
    } as const;
    const workflowId = processWorkflowId(processInstanceId);
    let result;
    try {
      result = await this.#processes().deliver(workflowId, stimulus);
    } catch {
      result = await this.#processes().deliver(workflowId, stimulus);
    }
    if (result.outcome !== "committed") {
      throw new Error(`showcase actor did not commit direct Message ${commandId}: ${result.outcome} ${result.code}`);
    }
    const state = await this.#waitForState(
      processInstanceId,
      isAtCorrelatedWait,
      "correlated Message wait",
    );
    const [wait] = messageWaits(state);
    if (wait === undefined) {
      throw new Error("correlated Message wait lost its occurrence identity");
    }
    return structuredClone({ wait, variables: state.variables });
  }

  async assertOnlyReviewTask(
    reviewProcessInstanceId: string,
    waitingProcessInstanceIds: readonly string[],
  ): Promise<void> {
    await this.#waitForState(
      reviewProcessInstanceId,
      (state) =>
        state.status === "running" &&
        state.openWaits.length === 1 &&
        state.openWaits[0]?.detail.kind === "userTask" &&
        state.openWaits[0]?.id.elementId === reviewTaskId,
      "unique Process review task",
    );
    for (const processInstanceId of waitingProcessInstanceIds) {
      await this.#waitForState(
        processInstanceId,
        isAtCorrelatedWait,
        "unchanged correlated Message wait",
      );
    }
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
      throw new AggregateError(
        failures,
        "correlated Message showcase cleanup failed",
      );
    }
  }

  async #startPlatform(): Promise<void> {
    const environment = this.#requireEnvironment();
    const api = requireApiOrigin();
    const configured = readPlatformServerConfig(showcaseEngineDeploymentEnvironment());
    this.#platform = await createPlatformServer({
      ...configured,
      host: api.hostname,
      port: requirePort(api),
      publicOrigin: api.origin,
      dataDirectory: this.#dataDirectory,
      maxSourceBytes: 1024 * 1024,
      parserDeadlineMs: 5_000,
      temporalAddress: environment.address,
      temporalNamespace: environmentNamespace(environment),
      temporalTaskQueue: taskQueue,
      temporalConnectTimeoutMs: 5_000,
    });
    try {
      const listened = await withDeadline(
        this.#platform.listen(),
        operationDeadlineMs,
        "M2 correlated Message platform listen",
      );
      if (listened !== api.origin) {
        throw new Error(
          `correlated Message platform listened at ${listened}, expected ${api.origin}`,
        );
      }
    } catch (error: unknown) {
      await this.#platform.close();
      this.#platform = undefined;
      throw error;
    }
  }

  async #waitForState(
    processInstanceId: string,
    predicate: (state: EngineStateObservation) => boolean,
    label: string,
  ): Promise<EngineStateObservation> {
    const deadline = Date.now() + stateDeadlineMs;
    let latest: EngineStateObservation | undefined;
    while (Date.now() < deadline) {
      try {
        const observed = await this.#processes().observation(processWorkflowId(processInstanceId));
        latest = observed === null ? undefined : observed as unknown as EngineStateObservation;
      } catch {
        // The start can be visible before its first Workflow task answers a Query.
        latest = undefined;
      }
      if (latest !== undefined && predicate(latest)) return latest;
      await delay(25);
    }
    throw new Error(
      `Process ${processInstanceId} did not reach ${label}: ${JSON.stringify(latest)}`,
    );
  }

  #processes(): ProcessClient {
    if (this.#worker === undefined) {
      throw new Error("correlated Message showcase Worker is not running");
    }
    return new ProcessClient(this.#requireEnvironment().client, taskQueue);
  }

  #requireEnvironment(): Environment {
    if (this.#environment === undefined) {
      throw new Error("correlated Message Temporal environment is not running");
    }
    return this.#environment;
  }
}

function messageWaits(state: EngineStateObservation): readonly EngineOpenWait[] {
  return state.openWaits.filter(({ detail }) => detail.kind === "message");
}

/** One open wait, the correlated Message catch, correlated by exactly one key. */
function isAtCorrelatedWait(state: EngineStateObservation): boolean {
  const [wait] = state.openWaits;
  const criteria = wait?.detail.criteria;
  return state.status === "running" &&
    state.openWaits.length === 1 &&
    wait?.detail.kind === "message" &&
    wait.id.elementId === correlatedCatchEventId &&
    Array.isArray(criteria) && criteria.length === 1;
}

function requireApiOrigin(): URL {
  const value = process.env.PLATFORM_API_ORIGIN;
  if (value === undefined) {
    throw new Error("Playwright config must provide PLATFORM_API_ORIGIN");
  }
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new Error("correlated Message API must use loopback HTTP");
  }
  return url;
}

function requirePort(url: URL): number {
  const value = Number(url.port);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 65_535) {
    throw new Error("correlated Message API origin must contain a valid port");
  }
  return value;
}
