import type { DeepReadonly } from "@bpmn-lean/contract-types";
import type { DeployedDefinitionVersion } from "./definitions.js";

export type CompletedFlowNodeDuration = DeepReadonly<{
  sampleCount: number;
  minimumMs: number;
  maximumMs: number;
  averageMs: number;
}>;

/**
 * `completedDuration` is `null` when nothing completed, and also when completions are counted but the evidence carries
 * no completion times: the engine's publications are untimed, so a duration is never derived from them.
 */
export type FlowNodeMetric = DeepReadonly<{
  elementId: string;
  frequency: number;
  running: number;
  completed: number;
  cancelled: number;
  completedDuration: CompletedFlowNodeDuration | null;
}>;

export type FlowNodeMetricsSnapshot = DeepReadonly<{
  definition: DeployedDefinitionVersion;
  population: {
    processInstances: number;
    label: "allRetainedEvidence";
  };
  flowNodes: FlowNodeMetric[];
}>;

export const FlowNodeMetricsResultKind = {
  Available: "available",
  Unavailable: "unavailable",
} as const;

export type FlowNodeMetricsResultKind =
  typeof FlowNodeMetricsResultKind[keyof typeof FlowNodeMetricsResultKind];

export type FlowNodeMetricsResult = DeepReadonly<
  | {
      kind: typeof FlowNodeMetricsResultKind.Available;
      snapshot: FlowNodeMetricsSnapshot;
    }
  | {
      kind: typeof FlowNodeMetricsResultKind.Unavailable;
      reason: "flowNodeMetricsUnavailable";
    }
>;
