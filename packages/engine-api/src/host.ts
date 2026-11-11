/**
 * The deployment an engine operation runs against, and the private addresses it derives. Product 2 holds only opaque
 * locators; Workflow and Schedule IDs, Task Queues and Run IDs stay inside Product 1.
 */
import {
  Scheduling,
  canonicalJson,
  createHostClientRuntime,
  type HostConfig,
  type ProcessHost,
  type ScheduleHost,
} from "@bpmn-lean/temporal-host/host";

import { requireWireString, sha256Hex, type EngineDefinitionIdentity } from "./common.js";
import type { EngineServedRequirements } from "./definition.js";

export type EngineHost = Readonly<{
  processes: ProcessHost;
  schedules: ScheduleHost;
  /** The Task Queue the deployment's Workers poll; retained by Temporal and compared on recovery. */
  taskQueue: string;
  served: EngineServedRequirements;
  /** Activity start-to-close bound, a transport limit that never reaches the kernel. */
  effectStartToCloseMs: number;
}>;

/** Every process an engine operation starts runs under durable scheduling: the host owns timers, effects and time. */
export function engineHostConfig(host: EngineHost): HostConfig {
  return { scheduling: Scheduling.Durable, effectStartToCloseMs: host.effectStartToCloseMs, historyEventBudget: null };
}

/**
 * The correlation scope of a deployed definition version, which every instance it starts registers its correlated
 * waits under and every correlated publication to it addresses: a digest of its identity, so instances of one version,
 * source, profile and overlay share it and no other definition's instance is ever a candidate.
 */
export function engineCorrelationScope(definition: EngineDefinitionIdentity): string {
  return `bpmn-definition-sha256:${sha256Hex(canonicalJson(["definitionCorrelation", definition]))}`;
}

/** The Workflow ID of a semantic process instance: a digest, so no instance identifier shapes a host address. */
export function engineProcessWorkflowId(processInstanceId: string): string {
  const encoded = canonicalJson(["semanticProcessInstance", requireWireString(processInstanceId, "processInstanceId")]);
  return `bpmn-process-sha256:${sha256Hex(encoded)}`;
}

export type EngineScheduleReference = Readonly<{ processId: string; version: number; scheduleId: string }>;

/** The Schedule ID of one platform Schedule, from its complete public tuple. */
export function engineDefinitionScheduleId(reference: EngineScheduleReference): string {
  if (!Number.isSafeInteger(reference.version) || reference.version <= 0) {
    throw new RangeError("version must be a positive safe integer");
  }
  const encoded = canonicalJson([
    "definitionSchedule",
    requireWireString(reference.processId, "processId"),
    reference.version,
    requireWireString(reference.scheduleId, "scheduleId"),
  ]);
  return `bpmn-definition-schedule-sha256:${sha256Hex(encoded)}`;
}

export type EngineHostRuntimeOptions = Readonly<{
  address: string;
  namespace: string;
  taskQueue: string;
  connectTimeoutMs: number;
  served: EngineServedRequirements;
  effectStartToCloseMs: number;
}>;

/** One deployment's host over a lazily opened Temporal connection. */
export type EngineHostRuntime = Readonly<{
  host: EngineHost;
  ensureConnected(): Promise<void>;
  close(): Promise<void>;
}>;

export function createEngineHostRuntime(options: EngineHostRuntimeOptions): EngineHostRuntime {
  const runtime = createHostClientRuntime({
    address: options.address,
    namespace: options.namespace,
    taskQueue: requireWireString(options.taskQueue, "taskQueue"),
    connectTimeoutMs: options.connectTimeoutMs,
  });
  return {
    host: {
      processes: runtime.processes,
      schedules: runtime.schedules,
      taskQueue: options.taskQueue,
      served: { ...options.served },
      effectStartToCloseMs: options.effectStartToCloseMs,
    },
    ensureConnected: () => runtime.ensureConnected(),
    close: () => runtime.close(),
  };
}
