/** Host-only Activity outcome. Semantic result arms retain their existing wire shape. */
import {
  isWellFormedEffectExecutionResult,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  EffectExecutionResult,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  workflowChainProductionLimit,
} from "./workflow-chain.js";

export const EffectActivityResultKind = Object.freeze({
  TechnicalFailure: "technicalFailure",
  CapacityExceeded: "capacityExceeded",
} as const);

export type EffectTechnicalFailure = DeepReadonly<{
  kind: typeof EffectActivityResultKind.TechnicalFailure;
}>;

export type EffectActivityCapacityExceeded = DeepReadonly<{
  kind: typeof EffectActivityResultKind.CapacityExceeded;
  budget:
    | WorkflowChainBudgetKind.EffectActivityRequestBytes
    | WorkflowChainBudgetKind.EffectActivityResultBytes;
  configuredBound: number;
  observedValue: number;
}>;

export type EffectActivityImplementationResult =
  | EffectExecutionResult
  | EffectTechnicalFailure;

export type EffectActivityResult =
  | EffectActivityImplementationResult
  | EffectActivityCapacityExceeded;

export function isWellFormedEffectActivityResult(
  value: unknown,
): value is EffectActivityResult {
  return isWellFormedEffectActivityImplementationResult(value) ||
    isWellFormedEffectActivityCapacityExceeded(value);
}

export function isWellFormedEffectActivityImplementationResult(
  value: unknown,
): value is EffectActivityImplementationResult {
  return isWellFormedEffectExecutionResult(value) ||
    (
      isRecord(value) &&
      Object.keys(value).length === 1 &&
      value.kind === EffectActivityResultKind.TechnicalFailure
    );
}

export function isEffectTechnicalFailure(
  value: EffectActivityResult,
): value is EffectTechnicalFailure {
  return value.kind === EffectActivityResultKind.TechnicalFailure;
}

export function isEffectActivityCapacityExceeded(
  value: unknown,
): value is EffectActivityCapacityExceeded {
  return isWellFormedEffectActivityCapacityExceeded(value);
}

function isWellFormedEffectActivityCapacityExceeded(
  value: unknown,
): value is EffectActivityCapacityExceeded {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "kind",
      "budget",
      "configuredBound",
      "observedValue",
    ]) ||
    value.kind !== EffectActivityResultKind.CapacityExceeded ||
    !isCapacityBudget(value.budget) ||
    !Number.isSafeInteger(value.configuredBound) ||
    !Number.isSafeInteger(value.observedValue)
  ) {
    return false;
  }
  const configuredBound = value.configuredBound as number;
  const observedValue = value.observedValue as number;
  return configuredBound > 0 &&
    configuredBound <= workflowChainProductionLimit(value.budget) &&
    observedValue > configuredBound;
}

function isCapacityBudget(
  value: unknown,
): value is EffectActivityCapacityExceeded["budget"] {
  switch (value) {
    case WorkflowChainBudgetKind.EffectActivityRequestBytes:
    case WorkflowChainBudgetKind.EffectActivityResultBytes:
      return true;
    default:
      return false;
  }
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    actual.every((key) => keys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
