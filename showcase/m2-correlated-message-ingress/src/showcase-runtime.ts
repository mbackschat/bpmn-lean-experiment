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
import {
  CanonicalObservationKind,
  CommandOutcome,
  CorrelatedMessageInteractionKind,
  isCorrelatedMessageCandidate,
  ProcessStatus,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageCandidate,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  ExternalTemporalRuntime,
  ProcessCommandResultKind,
  createCachedLocalEnvironment,
  createHostEffectActivities,
  bpmnProcessCorrelationCandidateQueryName,
  processWorkflowId,
  readBpmnProcessTrace,
  submitMessageDelivery,
  withDeadline,
} from "@bpmn-lean/temporal-testkit";

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

/** Real Temporal and production-platform composition for the browser witness. */
export class CorrelatedMessageShowcaseRuntime {
  readonly #dataDirectory: string;
  #environment: Environment | undefined;
  #worker: ExternalTemporalRuntime | undefined;
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
      ExternalTemporalRuntime.connect({
        address: environment.address,
        namespace: environment.namespace ?? "default",
        taskQueue,
        identity: `bpmn-m2-correlated-message-worker-${process.pid}`,
      }, createHostEffectActivities([])),
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
  ): Promise<CorrelatedMessageCandidate> {
    await this.#waitForState(
      processInstanceId,
      (state) => state.openMessageSubscriptions.some(({ id }) =>
        id.elementId === directCatchEventId
      ),
      "direct Message wait",
    );
    const stimulus = {
      kind: StimulusKind.DeliverPayloadMessage,
      commandId,
      subscriptionId: {
        processInstanceId,
        elementId: directCatchEventId,
        activation: 1,
      },
      channel,
      payload: { kind: VariableValueKind.String, value },
    } as const;
    let result;
    try {
      result = await submitMessageDelivery(
        this.#requireEnvironment().client.workflow,
        processInstanceId,
        stimulus,
      );
    } catch {
      result = await submitMessageDelivery(
        this.#requireEnvironment().client.workflow,
        processInstanceId,
        stimulus,
      );
    }
    if (
      result.kind !== ProcessCommandResultKind.Semantic ||
      result.commandId !== commandId ||
      result.outcome !== CommandOutcome.Committed
    ) {
      throw new Error(
        `showcase actor did not commit direct Message ${commandId}`,
      );
    }
    const state = await this.#waitForState(
      processInstanceId,
      isAtCorrelatedWait,
      "correlated Message wait",
    );
    const interactions = state.enabledInteractions.filter((interaction) =>
      interaction.kind ===
        CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage
    );
    const interaction = interactions[0];
    if (
      interactions.length !== 1 ||
      interaction?.kind !==
        CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage
    ) {
      throw new Error("correlated Message wait did not publish one exact address");
    }
    const subscriptionId = state.openMessageSubscriptions[0]?.id;
    if (subscriptionId === undefined) {
      throw new Error("correlated Message wait lost its subscription identity");
    }
    const candidate = await this.#requireEnvironment().client.workflow.getHandle(
      processWorkflowId(processInstanceId),
    ).query(bpmnProcessCorrelationCandidateQueryName, {
      address: interaction.address,
      subscriptionId,
    });
    if (!isCorrelatedMessageCandidate(candidate)) {
      throw new Error("Process did not publish its exact correlation candidate");
    }
    return structuredClone(candidate);
  }

  async assertOnlyReviewTask(
    reviewProcessInstanceId: string,
    waitingProcessInstanceIds: readonly string[],
  ): Promise<void> {
    await this.#waitForState(
      reviewProcessInstanceId,
      (state) =>
        state.status === ProcessStatus.Running &&
        state.openUserTasks.length === 1 &&
        state.openUserTasks[0]?.id.elementId === reviewTaskId &&
        state.openMessageSubscriptions.length === 0,
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
    predicate: (state: StateObservation) => boolean,
    label: string,
  ): Promise<StateObservation> {
    const deadline = Date.now() + stateDeadlineMs;
    let latest: StateObservation | undefined;
    while (Date.now() < deadline) {
      const trace = await readBpmnProcessTrace(
        this.#requireEnvironment().client.workflow,
        processInstanceId,
      );
      latest = trace.findLast(
        (observation): observation is StateObservation =>
          observation.kind === CanonicalObservationKind.State,
      );
      if (latest !== undefined && predicate(latest)) return latest;
      await delay(25);
    }
    throw new Error(
      `Process ${processInstanceId} did not reach ${label}: ${JSON.stringify(latest)}`,
    );
  }

  #requireEnvironment(): Environment {
    if (this.#environment === undefined) {
      throw new Error("correlated Message Temporal environment is not running");
    }
    return this.#environment;
  }
}

function isAtCorrelatedWait(state: StateObservation): boolean {
  return state.status === ProcessStatus.Running &&
    state.openUserTasks.length === 0 &&
    state.openMessageSubscriptions.length === 1 &&
    state.openMessageSubscriptions[0]?.id.elementId === correlatedCatchEventId &&
    state.enabledInteractions.some((interaction) =>
      interaction.kind ===
        CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage
    );
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
