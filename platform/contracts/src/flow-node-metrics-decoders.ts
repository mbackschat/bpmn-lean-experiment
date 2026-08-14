import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import { decodeDeployedDefinitionVersion } from "./deployed-definition-decoder.js";
import type { DeployedDefinitionVersion } from "./definitions.js";
import { FlowNodeMetricsResultKind } from "./flow-node-metrics.js";
import type {
  CompletedFlowNodeDuration,
  FlowNodeMetric,
  FlowNodeMetricsResult,
  FlowNodeMetricsSnapshot,
} from "./flow-node-metrics.js";
import {
  compareFlowNodeCanonicalStrings,
  isDenseFlowNodeArray,
} from "./flow-node-publication-decoder-primitives.js";

export function decodeFlowNodeMetricsResult(
  value: unknown,
  expectedDefinition: DeployedDefinitionVersion,
): FlowNodeMetricsResult {
  const expected = decodeExactDefinition(expectedDefinition, "expected definition");
  requireObject(value, "flow-node metrics result");
  switch (readOwn(value, "kind")) {
    case FlowNodeMetricsResultKind.Available:
      requireExactKeys(value, "available flow-node metrics result", ["kind", "snapshot"]);
      requireSnapshot(readOwn(value, "snapshot"), expected);
      return value as FlowNodeMetricsResult;
    case FlowNodeMetricsResultKind.Unavailable:
      requireExactKeys(value, "unavailable flow-node metrics result", ["kind", "reason"]);
      if (readOwn(value, "reason") !== "flowNodeMetricsUnavailable") {
        throw new TypeError("unavailable flow-node metrics result has an unknown reason");
      }
      return value as FlowNodeMetricsResult;
    default:
      throw new TypeError("flow-node metrics result has an unknown kind");
  }
}

export function decodeFlowNodeMetricsSnapshot(
  value: unknown,
  expectedDefinition: DeployedDefinitionVersion,
): FlowNodeMetricsSnapshot {
  const expected = decodeExactDefinition(expectedDefinition, "expected definition");
  requireSnapshot(value, expected);
  return value as FlowNodeMetricsSnapshot;
}

function requireSnapshot(
  value: unknown,
  expectedDefinition: DeployedDefinitionVersion,
): void {
  requireObject(value, "flow-node metrics snapshot");
  requireExactKeys(value, "flow-node metrics snapshot", [
    "definition",
    "population",
    "flowNodes",
  ]);
  const definition = decodeExactDefinition(
    readOwn(value, "definition"),
    "flow-node metrics snapshot.definition",
  );
  if (JSON.stringify(definition) !== JSON.stringify(expectedDefinition)) {
    throw new TypeError("flow-node metrics snapshot does not match the expected definition");
  }
  const population = readOwn(value, "population");
  requireObject(population, "flow-node metrics snapshot.population");
  requireExactKeys(population, "flow-node metrics snapshot.population", [
    "processInstances",
    "label",
  ]);
  const processInstances = requireNonnegativeSafeInteger(
    readOwn(population, "processInstances"),
    "flow-node metrics snapshot.population.processInstances",
  );
  if (processInstances > 100) {
    throw new TypeError("flow-node metrics snapshot.population.processInstances must not exceed 100");
  }
  if (readOwn(population, "label") !== "allRetainedEvidence") {
    throw new TypeError("flow-node metrics snapshot.population.label must be allRetainedEvidence");
  }
  const flowNodes = readOwn(value, "flowNodes");
  if (!isDenseFlowNodeArray(flowNodes)) {
    throw new TypeError("flow-node metrics snapshot.flowNodes must be a dense array");
  }
  const decoded = flowNodes.map((metric, index) => requireMetric(
    metric,
    `flow-node metrics snapshot.flowNodes[${index}]`,
  ));
  if (!decoded.every((metric, index) =>
    index === 0 || compareFlowNodeCanonicalStrings(decoded[index - 1]!.elementId, metric.elementId) < 0)) {
    throw new TypeError("flow-node metrics snapshot.flowNodes must use canonical elementId order");
  }
}

function requireMetric(value: unknown, label: string): FlowNodeMetric {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "elementId",
    "frequency",
    "running",
    "completed",
    "cancelled",
    "completedDuration",
  ]);
  const elementId = requireNonemptyString(readOwn(value, "elementId"), `${label}.elementId`);
  const frequency = requirePositiveSafeInteger(readOwn(value, "frequency"), `${label}.frequency`);
  const running = requireNonnegativeSafeInteger(readOwn(value, "running"), `${label}.running`);
  const completed = requireNonnegativeSafeInteger(readOwn(value, "completed"), `${label}.completed`);
  const cancelled = requireNonnegativeSafeInteger(readOwn(value, "cancelled"), `${label}.cancelled`);
  if (frequency !== running + completed + cancelled ||
    !Number.isSafeInteger(running + completed + cancelled)) {
    throw new TypeError(`${label}.frequency must equal its safe status-count sum`);
  }
  const durationValue = readOwn(value, "completedDuration");
  if (completed === 0) {
    if (durationValue !== null) {
      throw new TypeError(`${label}.completedDuration must be null when completed is zero`);
    }
  } else {
    if (durationValue === null) {
      throw new TypeError(`${label}.completedDuration is required when completed is positive`);
    }
    const duration = requireDuration(durationValue, `${label}.completedDuration`);
    if (duration.sampleCount !== completed) {
      throw new TypeError(`${label}.completedDuration.sampleCount must equal completed`);
    }
  }
  return {
    elementId,
    frequency,
    running,
    completed,
    cancelled,
    completedDuration: durationValue as CompletedFlowNodeDuration | null,
  };
}

function requireDuration(value: unknown, label: string): CompletedFlowNodeDuration {
  requireObject(value, label);
  requireExactKeys(value, label, ["sampleCount", "minimumMs", "maximumMs", "averageMs"]);
  const sampleCount = requirePositiveSafeInteger(readOwn(value, "sampleCount"), `${label}.sampleCount`);
  const minimumMs = requireNonnegativeSafeInteger(readOwn(value, "minimumMs"), `${label}.minimumMs`);
  const maximumMs = requireNonnegativeSafeInteger(readOwn(value, "maximumMs"), `${label}.maximumMs`);
  const averageMs = requireNonnegativeSafeInteger(readOwn(value, "averageMs"), `${label}.averageMs`);
  if (minimumMs > averageMs || averageMs > maximumMs) {
    throw new TypeError(`${label} must satisfy minimum <= average <= maximum`);
  }
  return { sampleCount, minimumMs, maximumMs, averageMs };
}

function decodeExactDefinition(
  value: unknown,
  label: string,
): DeployedDefinitionVersion {
  requireDefinitionArraysDense(value, label);
  return decodeDeployedDefinitionVersion(value, label);
}

function requireDefinitionArraysDense(value: unknown, label: string): void {
  requireObject(value, label);
  const startCapabilities = readOwn(value, "startCapabilities");
  requireObject(startCapabilities, `${label}.startCapabilities`);
  for (const field of ["messageStarts", "timerStarts"] as const) {
    if (!isDenseFlowNodeArray(readOwn(startCapabilities, field))) {
      throw new TypeError(`${label}.startCapabilities.${field} must be a dense array`);
    }
  }
}
