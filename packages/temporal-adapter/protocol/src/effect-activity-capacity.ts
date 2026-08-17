import {
  WorkflowChainBudgetKind,
  requireWorkflowChainCanonicalByteBudget,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "./workflow-chain.js";
import {
  EffectActivityResultKind,
} from "./effect-activity-result.js";
import type {
  EffectActivityCapacityExceeded,
  EffectActivityResult,
} from "./effect-activity-result.js";
import type { EffectRequest } from "./effect-contract.js";

export const bpmnEffectExecutionExhaustedFailureType =
  "BPMN_EFFECT_EXECUTION_EXHAUSTED";

export type EffectActivityCapacityLimits = Readonly<{
  requestBytes: number;
  resultBytes: number;
}>;

export type EffectActivityCapacityBound = Readonly<{
  budget:
    | WorkflowChainBudgetKind.EffectActivityRequestBytes
    | WorkflowChainBudgetKind.EffectActivityResultBytes;
  configuredBound: number;
  observedValue: number;
}>;

export enum EffectActivityCapacityPreflightKind {
  WithinCapacity = "withinCapacity",
  CapacityExceeded = "capacityExceeded",
}

export type EffectActivityCapacityPreflight =
  | Readonly<{
      kind: EffectActivityCapacityPreflightKind.WithinCapacity;
      observedValue: number;
    }>
  | Readonly<{
      kind: EffectActivityCapacityPreflightKind.CapacityExceeded;
      failure: EffectActivityCapacityBound;
    }>;

export type EffectActivityFailureProjection = Readonly<{
  failureType: typeof bpmnEffectExecutionExhaustedFailureType;
  message: "Effect Activity exhausted its bounded execution policy";
}>;

/** Measures the exact request before the Workflow schedules its Activity command. */
export function preflightEffectActivityRequest(
  request: EffectRequest,
  limits: EffectActivityCapacityLimits = productionLimits(),
): EffectActivityCapacityPreflight {
  const configured = requireLimits(limits);
  return preflight(
    WorkflowChainBudgetKind.EffectActivityRequestBytes,
    request,
    configured.requestBytes,
  );
}

/** Revalidates the exact result after Temporal records the Activity completion. */
export function preflightEffectActivityResult(
  result: EffectActivityResult,
  limits: EffectActivityCapacityLimits = productionLimits(),
): EffectActivityCapacityPreflight {
  const configured = requireLimits(limits);
  return preflight(
    WorkflowChainBudgetKind.EffectActivityResultBytes,
    result,
    configured.resultBytes,
  );
}

/** Replaces an over-budget implementation result with one small host-only outcome. */
export function boundEffectActivityResult(
  result: EffectActivityResult,
  limits: EffectActivityCapacityLimits = productionLimits(),
): EffectActivityResult {
  const measured = preflightEffectActivityResult(result, limits);
  switch (measured.kind) {
    case EffectActivityCapacityPreflightKind.WithinCapacity:
      return result;
    case EffectActivityCapacityPreflightKind.CapacityExceeded:
      return effectActivityCapacityExceeded(measured.failure);
    default:
      return assertNever(measured);
  }
}

export function effectActivityCapacityExceeded(
  failure: EffectActivityCapacityBound,
): EffectActivityCapacityExceeded {
  return {
    kind: EffectActivityResultKind.CapacityExceeded,
    ...failure,
  };
}

/** The projection is intentionally constant and never traverses the supplied cause graph. */
export function projectEffectActivityFailure(
  _failure: unknown,
): EffectActivityFailureProjection {
  const projection = {
    failureType: bpmnEffectExecutionExhaustedFailureType,
    message: "Effect Activity exhausted its bounded execution policy",
  } as const;
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.EffectActivityFailureProjectionBytes,
    projection,
  );
  return projection;
}

function preflight(
  budget: EffectActivityCapacityBound["budget"],
  value: unknown,
  configuredBound: number,
): EffectActivityCapacityPreflight {
  const observedValue = workflowChainCanonicalUtf8ByteLength(value);
  return observedValue <= configuredBound
    ? {
        kind: EffectActivityCapacityPreflightKind.WithinCapacity,
        observedValue,
      }
    : {
        kind: EffectActivityCapacityPreflightKind.CapacityExceeded,
        failure: { budget, configuredBound, observedValue },
      };
}

function productionLimits(): EffectActivityCapacityLimits {
  return {
    requestBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.EffectActivityRequestBytes,
    ),
    resultBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.EffectActivityResultBytes,
    ),
  };
}

function requireLimits(
  limits: EffectActivityCapacityLimits,
): EffectActivityCapacityLimits {
  requireLimit(
    limits.requestBytes,
    WorkflowChainBudgetKind.EffectActivityRequestBytes,
  );
  requireLimit(
    limits.resultBytes,
    WorkflowChainBudgetKind.EffectActivityResultBytes,
  );
  return { ...limits };
}

function requireLimit(
  value: number,
  budget: EffectActivityCapacityBound["budget"],
): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${budget} limit must be a positive safe integer`);
  }
  if (value > workflowChainProductionLimit(budget)) {
    throw new RangeError(`${budget} limit exceeds production`);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported effect-capacity variant: ${String(value)}`);
}
