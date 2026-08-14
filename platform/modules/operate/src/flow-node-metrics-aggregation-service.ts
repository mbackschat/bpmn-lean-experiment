import {
  decodeFlowNodeMetricsResult,
  FlowNodeMetricsResultKind,
  FlowNodeOccurrenceTerminalKind,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  FlowNodeMetric,
  FlowNodeMetricsResult,
} from "@bpmn-lean/platform-contracts";

import type { ProcessInstanceRepository } from "./contracts.js";
import {
  ExecutionPublicationReconciliationKind,
} from "./execution-publication-reconciliation-service.js";
import type {
  ExecutionPublicationReconciliationService,
} from "./execution-publication-reconciliation-service.js";
import {
  FlowNodeOccurrenceReconciliationKind,
} from "./flow-node-occurrence-reconciliation-service.js";
import type {
  FlowNodeOccurrenceReconciliationService,
} from "./flow-node-occurrence-reconciliation-service.js";
import type { ProjectedFlowNodeOccurrence } from "./flow-node-occurrence-projection.js";

export type FlowNodeMetricsDefinitionReference = Readonly<{
  processId: string;
  version: number;
}>;

export interface FlowNodeMetricsDefinitionResolver {
  get(reference: FlowNodeMetricsDefinitionReference): DeployedDefinitionVersion | null;
}

export type FlowNodeMetricsAggregationServiceOptions = Readonly<{
  definitions: FlowNodeMetricsDefinitionResolver;
  population: Pick<ProcessInstanceRepository, "listExactDefinitionVersion">;
  executions: Pick<ExecutionPublicationReconciliationService, "reconcile">;
  occurrences: Pick<FlowNodeOccurrenceReconciliationService, "reconcile">;
}>;

/** Produces one all-or-unavailable exact-version aggregate from the request-start cut. */
export class FlowNodeMetricsAggregationService {
  constructor(private readonly options: FlowNodeMetricsAggregationServiceOptions) {}

  async get(
    reference: FlowNodeMetricsDefinitionReference,
  ): Promise<FlowNodeMetricsResult | null> {
    const resolved = this.options.definitions.get(reference);
    if (resolved === null) return null;
    const definition = structuredClone(resolved);
    let population;
    try {
      population = this.options.population.listExactDefinitionVersion(definition);
    } catch {
      return unavailable();
    }
    if (population.length > 100) return unavailable();

    const projected: ProjectedFlowNodeOccurrence[] = [];
    for (const registration of population) {
      try {
        const execution = await this.options.executions.reconcile(
          registration.instance.processInstanceId,
        );
        if (execution.kind !== ExecutionPublicationReconciliationKind.Available) {
          return unavailable();
        }
        const occurrences = await this.options.occurrences.reconcile(registration);
        if (occurrences.kind !== FlowNodeOccurrenceReconciliationKind.Available) {
          return unavailable();
        }
        projected.push(...occurrences.projection.occurrences.map((value) =>
          structuredClone(value)
        ));
      } catch {
        return unavailable();
      }
    }
    try {
      const result: FlowNodeMetricsResult = {
        kind: FlowNodeMetricsResultKind.Available,
        snapshot: {
          definition: structuredClone(definition),
          population: {
            processInstances: population.length,
            label: "allRetainedEvidence",
          },
          flowNodes: aggregate(projected, definition.processId),
        },
      };
      return decodeFlowNodeMetricsResult(result, definition);
    } catch {
      return unavailable();
    }
  }
}

type MutableMetric = {
  running: bigint;
  completed: bigint;
  cancelled: bigint;
  totalDuration: bigint;
  minimumDuration: bigint | null;
  maximumDuration: bigint | null;
};

function aggregate(
  occurrences: readonly ProjectedFlowNodeOccurrence[],
  processId: string,
): FlowNodeMetric[] {
  const metrics = new Map<string, MutableMetric>();
  for (const occurrence of occurrences) {
    if (occurrence.processId !== processId) continue;
    const metric = metrics.get(occurrence.elementId) ?? emptyMetric();
    switch (occurrence.terminal) {
      case null:
        metric.running += 1n;
        break;
      case FlowNodeOccurrenceTerminalKind.Completed: {
        if (occurrence.terminalAtEpochMs === null) {
          throw new TypeError("completed occurrence has no terminal time");
        }
        const duration = BigInt(occurrence.terminalAtEpochMs) -
          BigInt(occurrence.startedAtEpochMs);
        if (duration < 0n) throw new RangeError("completed occurrence time regressed");
        metric.completed += 1n;
        metric.totalDuration += duration;
        metric.minimumDuration = metric.minimumDuration === null ||
            duration < metric.minimumDuration
          ? duration
          : metric.minimumDuration;
        metric.maximumDuration = metric.maximumDuration === null ||
            duration > metric.maximumDuration
          ? duration
          : metric.maximumDuration;
        break;
      }
      case FlowNodeOccurrenceTerminalKind.Cancelled:
        if (occurrence.terminalAtEpochMs === null) {
          throw new TypeError("cancelled occurrence has no terminal time");
        }
        metric.cancelled += 1n;
        break;
    }
    metrics.set(occurrence.elementId, metric);
  }
  return [...metrics.entries()]
    .sort(([left], [right]) => compareCanonicalStrings(left, right))
    .map(([elementId, metric]) => toPublicMetric(elementId, metric));
}

function emptyMetric(): MutableMetric {
  return {
    running: 0n,
    completed: 0n,
    cancelled: 0n,
    totalDuration: 0n,
    minimumDuration: null,
    maximumDuration: null,
  };
}

function toPublicMetric(elementId: string, metric: MutableMetric): FlowNodeMetric {
  const frequency = metric.running + metric.completed + metric.cancelled;
  const running = safeNumber(metric.running);
  const completed = safeNumber(metric.completed);
  const cancelled = safeNumber(metric.cancelled);
  const completedDuration = metric.completed === 0n
    ? null
    : {
        sampleCount: completed,
        minimumMs: safeNumber(metric.minimumDuration!),
        maximumMs: safeNumber(metric.maximumDuration!),
        averageMs: safeNumber(metric.totalDuration / metric.completed),
      };
  safeNumber(metric.totalDuration);
  return {
    elementId,
    frequency: safeNumber(frequency),
    running,
    completed,
    cancelled,
    completedDuration,
  };
}

function safeNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("flow-node metric exhausted the safe integer domain");
  }
  return Number(value);
}

function compareCanonicalStrings(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index]! - rightPoints[index]!;
    }
  }
  return leftPoints.length - rightPoints.length;
}

function unavailable(): FlowNodeMetricsResult {
  return {
    kind: FlowNodeMetricsResultKind.Unavailable,
    reason: "flowNodeMetricsUnavailable",
  };
}
