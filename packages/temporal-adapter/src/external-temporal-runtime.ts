/**
 * Owns one production BPMN Worker's connection to a caller-managed Temporal service.
 *
 * This boundary never creates a Temporal server or binds a server port. The caller supplies the
 * effect Activity implementation, so a Process with effect waits runs only when its product
 * configuration declared the matching handlers.
 */
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import type {
  DeepReadonly,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowClient,
} from "@temporalio/client";
import {
  NativeConnection,
  Worker,
} from "@temporalio/worker";

import {
  normalizeError,
  withDeadline,
} from "./async-boundary.js";
import type { EffectActivities } from "./effect-probe.js";

const workflowsPath = fileURLToPath(new URL("./workflows.js", import.meta.url));
const connectionDeadlineMs = 10_000;
const workerStartupDeadlineMs = 20_000;
const shutdownDeadlineMs = 10_000;

export type ExternalTemporalRuntimeOptions = DeepReadonly<{
  /** Existing Temporal frontend address in `host:port` form. */
  address: string;
  /** Existing Temporal Namespace. */
  namespace: string;
  /** Task Queue shared with Process Workflow starts. */
  taskQueue: string;
  /** Human-readable Worker and client identity. */
  identity: string;
}>;

/** One running Worker, its Workflow client, and their shared external-server connection. */
export class ExternalTemporalRuntime {
  private workerError: unknown;
  private shutdownPromise: Promise<void> | undefined;

  private constructor(
    private readonly connection: NativeConnection,
    readonly workflowClient: WorkflowClient,
    private readonly worker: Worker,
    private readonly workerRun: Promise<void>,
  ) {}

  /** Connects to a caller-managed server and starts polling the selected Task Queue. */
  static async connect(
    options: ExternalTemporalRuntimeOptions,
    activities: EffectActivities,
  ): Promise<ExternalTemporalRuntime> {
    requireOptions(options);
    const connection = await withDeadline(
      NativeConnection.connect({ address: options.address }),
      connectionDeadlineMs,
      `Temporal connection to ${options.address}`,
    );
    try {
      const workflowClient = new WorkflowClient({
        connection,
        namespace: options.namespace,
        identity: options.identity,
      });
      const worker = await withDeadline(
        Worker.create({
          connection,
          identity: options.identity,
          namespace: options.namespace,
          taskQueue: options.taskQueue,
          workflowsPath,
          activities,
        }),
        workerStartupDeadlineMs,
        `BPMN Worker startup on ${options.taskQueue}`,
      );
      let runtime: ExternalTemporalRuntime;
      const workerRun = worker.run().catch((error: unknown) => {
        runtime.workerError = normalizeError(
          error,
          "External BPMN Worker failed",
        );
      });
      runtime = new ExternalTemporalRuntime(
        connection,
        workflowClient,
        worker,
        workerRun,
      );
      await delay(0);
      runtime.assertHealthy();
      return runtime;
    } catch (error: unknown) {
      await connection.close();
      throw error;
    }
  }

  /** Fails immediately when the Worker run loop has stopped unexpectedly. */
  assertHealthy(): void {
    if (this.workerError !== undefined) {
      throw normalizeError(this.workerError, "External BPMN Worker failed");
    }
  }

  /** Gracefully stops polling and closes the owned client/Worker connection once. */
  shutdown(): Promise<void> {
    this.shutdownPromise ??= this.stop();
    return this.shutdownPromise;
  }

  private async stop(): Promise<void> {
    this.worker.shutdown();
    let failure: unknown;
    try {
      await withDeadline(
        this.workerRun,
        shutdownDeadlineMs,
        "external BPMN Worker shutdown",
      );
      this.assertHealthy();
    } catch (error: unknown) {
      failure = error;
    }
    try {
      await withDeadline(
        this.connection.close(),
        shutdownDeadlineMs,
        "external BPMN connection shutdown",
      );
    } catch (error: unknown) {
      failure ??= error;
    }
    if (failure !== undefined) {
      throw failure;
    }
  }
}

function requireOptions(options: ExternalTemporalRuntimeOptions): void {
  for (const [name, value] of [
    ["address", options.address],
    ["namespace", options.namespace],
    ["taskQueue", options.taskQueue],
    ["identity", options.identity],
  ] as const) {
    if (value.length === 0) {
      throw new TypeError(`External Temporal runtime ${name} must be nonempty`);
    }
  }
}
