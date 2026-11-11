/**
 * The deployment an engine operation runs against, and the private addresses it derives. Product 2 holds only opaque
 * locators; Workflow and Schedule IDs, Task Queues and Run IDs stay inside Product 1.
 */
import {
  Scheduling,
  canonicalJson,
  createHostClientRuntime,
  processInstanceWorkflowId,
  type HostConfig,
  type PopulationHost,
  type ProcessHost,
  type ScheduleHost,
} from "@bpmn-lean/temporal-host/host";

import { requireWireString, sha256Hex, type EngineDefinitionIdentity } from "./common.js";
import type { EngineServedRequirements } from "./definition.js";

export type EngineHost = Readonly<{
  processes: ProcessHost;
  schedules: ScheduleHost;
  /**
   * The deployment's population ingress, which every definition version registers with and every engine start runs
   * under: one engine deployment, one population, named by its Task Queue.
   */
  population: PopulationHost;
  /** The Task Queue the deployment's Workers poll; retained by Temporal and compared on recovery. */
  taskQueue: string;
  served: EngineServedRequirements;
  /** Activity start-to-close bound, a transport limit that never reaches the kernel. */
  effectStartToCloseMs: number;
}>;

/** Every process an engine operation starts runs under durable scheduling: the host owns timers, effects and time. */
export function engineHostConfig(host: Pick<EngineHost, "effectStartToCloseMs">): HostConfig {
  return { scheduling: Scheduling.Durable, effectStartToCloseMs: host.effectStartToCloseMs, historyEventBudget: null };
}

/**
 * The population registration request of a definition version: a digest of its identity, so a version, source, profile
 * and overlay register once and a repeated registration answers as the first.
 */
export function engineDeploymentRequestId(definition: EngineDefinitionIdentity): string {
  return `bpmn-definition-deployment-sha256:${sha256Hex(canonicalJson(["definitionDeployment", definition]))}`;
}

/**
 * The Workflow ID of a semantic process instance of `population` (an engine host's `population.population`): a digest,
 * so no instance identifier shapes a host address.
 */
export function engineProcessWorkflowId(population: string, processInstanceId: string): string {
  return processInstanceWorkflowId(requireWireString(population, "population"), requireWireString(processInstanceId, "processInstanceId"));
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
  const config = engineHostConfig(options);
  return {
    host: {
      processes: runtime.processes,
      schedules: runtime.schedules,
      population: runtime.population(options.taskQueue, config),
      taskQueue: options.taskQueue,
      served: { ...options.served },
      effectStartToCloseMs: options.effectStartToCloseMs,
    },
    ensureConnected: () => runtime.ensureConnected(),
    close: () => runtime.close(),
  };
}
