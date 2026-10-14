/**
 * Per-task Activity checks of the effect-data capacity envelope (`PBV-EFF-05`).
 *
 * A Service Task's handler result is external, so the envelope reserves the full per-value allowance for every
 * local its output parameters read. Each task must then fit the Activity request and result budgets the Workflow
 * enforces around the Activity, and its reserved patch must fit the content-bound identity limits the host's own
 * `CompleteEffect` command ID encodes. These are checks beside the aggregate Start budgets, not entries of that list:
 * an aggregate budget measures a whole journey artifact, while each of these bounds one Activity exchange.
 *
 * Result and identity checks depend only on the Program, so a Program failing one is unsupported for the profile.
 * The request check measures the actual exchange of the journey, whose arguments copy Start values and reserved
 * outputs as the arming of `PBV-EFF-03` does.
 */
import { fullAllowanceValue, effectOutputMappings, reservedEffectResult } from "./start-capacity-journey.js";
import type { StartCapacityJourney } from "./start-capacity-journey.js";
import {
  variableBindingIdentityByteLimit,
  variableBindingIdentityBytes,
  variablePatchIdentityByteLimit,
  variablePatchIdentityBytes,
} from "./command-identity.js";
import {
  WorkflowChainBudgetKind,
  workflowChainCanonicalUtf8ByteLength as measured,
  workflowChainProductionLimit,
} from "./workflow-chain.js";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";

export const StartCapacityEffectCheck = {
  ActivityResultBytes: WorkflowChainBudgetKind.EffectActivityResultBytes,
  BindingIdentityBytes: "completeEffectBindingIdentityBytes",
  PatchIdentityBytes: "completeEffectPatchIdentityBytes",
  ActivityRequestBytes: WorkflowChainBudgetKind.EffectActivityRequestBytes,
} as const;
export type StartCapacityEffectCheck = typeof StartCapacityEffectCheck[keyof typeof StartCapacityEffectCheck];

/** Declaration order is evaluation order: the Program-only checks precede the journey's request check. */
export const startCapacityEffectChecks = Object.values(StartCapacityEffectCheck);

export type StartCapacityEffectLimits = Readonly<Record<StartCapacityEffectCheck, number>>;

export type StartCapacityEffectFailure = Readonly<{
  budget: StartCapacityEffectCheck;
  elementId: string;
  configuredBound: number;
  estimatedValue: number;
}>;

export function productionStartCapacityEffectLimit(check: StartCapacityEffectCheck): number {
  switch (check) {
    case StartCapacityEffectCheck.ActivityResultBytes:
    case StartCapacityEffectCheck.ActivityRequestBytes:
      return workflowChainProductionLimit(check);
    case StartCapacityEffectCheck.BindingIdentityBytes:
      return variableBindingIdentityByteLimit;
    case StartCapacityEffectCheck.PatchIdentityBytes:
      return variablePatchIdentityByteLimit;
    default:
      return assertNever(check);
  }
}

/** The first Service Task whose reserved result or patch identity exceeds its limit, in Program operation order. */
export function exceededReservedEffectResult(
  program: SemanticProcessProgram,
  limits: StartCapacityEffectLimits,
): StartCapacityEffectFailure | null {
  const sentinel = fullAllowanceValue();
  for (const { elementId, outputMappings } of effectOutputMappings(program)) {
    const result = reservedEffectResult(outputMappings, sentinel);
    const failure = firstOver(elementId, limits, [
      [StartCapacityEffectCheck.ActivityResultBytes, measured(result)],
      [StartCapacityEffectCheck.BindingIdentityBytes,
        Math.max(0, ...result.localPatch.map(variableBindingIdentityBytes))],
      [StartCapacityEffectCheck.PatchIdentityBytes, variablePatchIdentityBytes(result.localPatch)],
    ]);
    if (failure !== null) return failure;
  }
  return null;
}

/** The first journey Activity request that exceeds its budget. */
export function exceededEffectRequest(
  journey: StartCapacityJourney,
  limits: StartCapacityEffectLimits,
): StartCapacityEffectFailure | null {
  for (const { effect } of journey.steps) {
    if (effect === null) continue;
    const failure = firstOver(effect.elementId, limits,
      [[StartCapacityEffectCheck.ActivityRequestBytes, measured(effect.request)]]);
    if (failure !== null) return failure;
  }
  return null;
}

/** The operator-facing evidence naming the task, the exceeded check, its bound and the reservation. */
export function startCapacityEffectEvidence(failure: StartCapacityEffectFailure): string {
  return `Service Task ${failure.elementId} reserves ${failure.estimatedValue} canonical UTF-8 bytes for ` +
    `${failure.budget}, above its ${failure.configuredBound}-byte bound; no Workflow was started.`;
}

export function requireStartCapacityEffectLimits(limits: StartCapacityEffectLimits): StartCapacityEffectLimits {
  for (const check of startCapacityEffectChecks) {
    const value = limits[check];
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`${check} limit must be a positive safe integer`);
    }
    if (value > productionStartCapacityEffectLimit(check)) {
      throw new RangeError(`${check} limit exceeds production`);
    }
  }
  return { ...limits };
}

function firstOver(
  elementId: string,
  limits: StartCapacityEffectLimits,
  measurements: ReadonlyArray<readonly [StartCapacityEffectCheck, number]>,
): StartCapacityEffectFailure | null {
  const over = measurements.find(([check, value]) => value > limits[check]);
  return over === undefined
    ? null
    : { budget: over[0], elementId, configuredBound: limits[over[0]], estimatedValue: over[1] };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported effect capacity check: ${String(value)}`);
}
