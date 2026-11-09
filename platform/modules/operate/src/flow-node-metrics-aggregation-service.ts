import {
  decodeFlowNodeMetricsResult,
  FlowNodeMetricsResultKind,
  FlowNodeOccurrenceRole,
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
  get(
    reference: FlowNodeMetricsDefinitionReference,
  ): Promise<DeployedDefinitionVersion | null>;
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
    const resolved = await this.options.definitions.get(reference);
    if (resolved === null) return null;
    const definition = structuredClone(resolved);
    let population;
    try {
      population = await this.options.population.listExactDefinitionVersion(definition);
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
        projected.push(...occurrences.projection.occurrences
          .filter((value) => counted(value, registration.instance.processInstanceId))
          .map((value) => structuredClone(value)));
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
          flowNodes: aggregate(projected),
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
};

/**
 * Counts an occurrence of the hosting instance's own diagram: a called process's interior runs under its own instance
 * key and stays out, and a Multi-Instance body shares its Activity's element id, so only the instances count as that
 * element's executions.
 */
function counted(occurrence: ProjectedFlowNodeOccurrence, hostingProcessInstanceId: string): boolean {
  return occurrence.occurrence.processInstanceId === hostingProcessInstanceId &&
    occurrence.occurrence.role === FlowNodeOccurrenceRole.Element;
}

function aggregate(occurrences: readonly ProjectedFlowNodeOccurrence[]): FlowNodeMetric[] {
  const metrics = new Map<string, MutableMetric>();
  for (const occurrence of occurrences) {
    const elementId = occurrence.occurrence.elementId;
    const metric = metrics.get(elementId) ?? emptyMetric();
    switch (occurrence.terminal) {
      case null:
        metric.running += 1n;
        break;
      case FlowNodeOccurrenceTerminalKind.Completed:
        metric.completed += 1n;
        break;
      case FlowNodeOccurrenceTerminalKind.Cancelled:
        metric.cancelled += 1n;
        break;
    }
    metrics.set(elementId, metric);
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
  };
}

function toPublicMetric(elementId: string, metric: MutableMetric): FlowNodeMetric {
  const frequency = metric.running + metric.completed + metric.cancelled;
  return {
    elementId,
    frequency: safeNumber(frequency),
    running: safeNumber(metric.running),
    completed: safeNumber(metric.completed),
    cancelled: safeNumber(metric.cancelled),
    // Neither publication carries a timestamp, so no elapsed duration can be derived from the projection.
    completedDuration: null,
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
