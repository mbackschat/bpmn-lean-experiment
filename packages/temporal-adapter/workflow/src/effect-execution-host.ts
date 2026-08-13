/** Converts one validated host Activity outcome into exactly one semantic command. */
import {
  EffectExecutionResultKind,
  EffectActivityResultKind,
  completeEffectStimulus,
  isWellFormedEffectActivityResult,
  reportEffectFailureStimulus,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivityResult,
} from "@bpmn-lean/temporal-protocol";
import type {
  CompleteEffectStimulus,
  OpenEffect,
  RuntimeState,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";

import {
  EffectActivityPolicyKind,
} from "./effect-activity-policy.js";
import type { EffectActivityPolicy } from "./effect-activity-policy.js";

export enum EffectHostFailureKind {
  InvalidResult = "invalidResult",
  TechnicalFailureUnsupported = "technicalFailureUnsupported",
  TechnicalFailureAfterRetry = "technicalFailureAfterRetry",
}

export type EffectHostCommand =
  | Readonly<{ kind: "command"; stimulus: Stimulus }>
  | Readonly<{ kind: "failure"; failure: EffectHostFailureKind }>;

export function effectActivityResultCommand(
  policy: EffectActivityPolicy,
  state: RuntimeState,
  effect: OpenEffect,
  result: unknown,
): EffectHostCommand {
  if (!isWellFormedEffectActivityResult(result)) {
    return { kind: "failure", failure: EffectHostFailureKind.InvalidResult };
  }
  if (result.kind !== EffectActivityResultKind.TechnicalFailure) {
    return {
      kind: "command",
      stimulus: completeEffectStimulus(effect.id, result),
    };
  }
  switch (policy.kind) {
    case EffectActivityPolicyKind.Legacy:
      return {
        kind: "failure",
        failure: EffectHostFailureKind.TechnicalFailureUnsupported,
      };
    case EffectActivityPolicyKind.ServiceTaskIncident: {
      const waits = state.effectWaits.filter(({ id }) =>
        sameOccurrence(id, effect.id)
      );
      const wait = waits[0];
      if (wait === undefined || waits.length !== 1) {
        return { kind: "failure", failure: EffectHostFailureKind.InvalidResult };
      }
      if (wait.incidentAlreadyRetried) {
        return {
          kind: "failure",
          failure: EffectHostFailureKind.TechnicalFailureAfterRetry,
        };
      }
      return {
        kind: "command",
        stimulus: reportEffectFailureStimulus(effect.id),
      };
    }
    default:
      return assertNever(policy.kind);
  }
}

export function throwEffectHostFailure(failure: EffectHostFailureKind): never {
  switch (failure) {
    case EffectHostFailureKind.InvalidResult:
      throw ApplicationFailure.nonRetryable(
        "Effect Activity returned an invalid result",
        "BpmnEffectExecutionResultInvalid",
      );
    case EffectHostFailureKind.TechnicalFailureUnsupported:
      throw ApplicationFailure.nonRetryable(
        "Effect Activity returned technical failure outside its selected profile",
        "BPMN_EFFECT_TECHNICAL_FAILURE_UNSUPPORTED",
      );
    case EffectHostFailureKind.TechnicalFailureAfterRetry:
      throw ApplicationFailure.nonRetryable(
        "Effect Activity failed after the incident retry was consumed",
        "BPMN_EFFECT_INCIDENT_RETRY_EXHAUSTED",
      );
    default:
      return assertNever(failure);
  }
}

export function failRejectedHostEffectResult(
  state: RuntimeState,
  stimulus: CompleteEffectStimulus,
): never {
  const wait = state.effectWaits.find(
    ({ id }) => sameOccurrence(id, stimulus.effectId),
  );
  if (
    stimulus.result.kind === EffectExecutionResultKind.BpmnError &&
    wait !== undefined &&
    (
      wait.bpmnErrorRoute === null ||
      wait.bpmnErrorRoute.code !== stimulus.result.code
    )
  ) {
    throw ApplicationFailure.nonRetryable(
      "Effect Activity returned a BPMN Error with no admitted matching route",
      "BPMN_UNHANDLED_BPMN_ERROR",
    );
  }
  throw ApplicationFailure.nonRetryable(
    "Effect Activity returned a result refused by the committed semantic intent",
    "BpmnEffectExecutionResultRejected",
  );
}

function sameOccurrence(
  left: { processInstanceId: string; elementId: string; activation: number },
  right: { processInstanceId: string; elementId: string; activation: number },
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported effect host policy: ${String(value)}`);
}
