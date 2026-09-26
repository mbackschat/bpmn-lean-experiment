import {
  compensationRetentionStateDefects,
} from "./compensation-activity-retention-state-validation.js";
import { compensationExecutionMatchesProgram } from "./compensation-trigger-handler-program-admission.js";
import {
  compensationExecutionStateDefects,
} from "./compensation-trigger-handler-runtime-state-validation.js";
import {
  CompensationTriggerAttemptKind,
  CompensationTriggerRefusalReason,
  constructCompensationTriggerFrontier,
  executionFits,
  selectedCompensationSubjects,
  type CompensationTriggerAttempt,
} from "./compensation-trigger-handler-transition.js";
import type {
  CancelTransactionOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { removeScopeOccurrenceContents } from "./semantic-process-scope-cancellation.js";
import { isScopeOccurrenceQuiescent } from "./semantic-process-scope-runtime.js";
import {
  ControlStateKind,
  addToken,
  sameScopeOccurrence,
  type RuntimeState,
  type ScopeOccurrenceId,
} from "./semantic-process-state.js";

export function attemptTransactionCancellation(
  program: SemanticProcessProgram,
  operation: CancelTransactionOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId | undefined,
): CompensationTriggerAttempt {
  if (state.control.kind !== ControlStateKind.Running || owner === undefined) {
    return { kind: CompensationTriggerAttemptKind.Disabled, state };
  }
  if (
    program.compensationExecution?.triggerOperationId !== operation.id ||
    !compensationExecutionMatchesProgram(program)
  ) return refused(state, CompensationTriggerRefusalReason.InvalidProgram);
  const occurrences = state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, owner));
  const occurrence = occurrences[0];
  if (
    occurrences.length !== 1 || occurrence === undefined || occurrence.parent === null ||
    owner.definitionScopeId !== operation.definitionScopeId ||
    owner.processInstanceId !== state.control.instanceId ||
    compensationRetentionStateDefects(program, state).length > 0 ||
    compensationExecutionStateDefects(program, state).length > 0
  ) return refused(state, CompensationTriggerRefusalReason.InvalidState);
  if (state.compensationTriggers?.some((trigger) =>
    trigger.lifecycle === "active" && sameScopeOccurrence(trigger.owner, owner)
  )) return refused(state, CompensationTriggerRefusalReason.ActiveTriggerExists);

  const selected = selectedCompensationSubjects(program, owner, state);
  if (selected === null) return refused(state, CompensationTriggerRefusalReason.InvalidSources);
  if (selected.length === 0) {
    const completed = finishTransactionCancellation(
      operation,
      removeScopeOccurrenceContents(state, occurrence),
      owner,
    );
    return completed === null
      ? refused(state, CompensationTriggerRefusalReason.InvalidState)
      : checkedSuccess(program, state, completed);
  }

  const activated = constructCompensationTriggerFrontier(program, state, operation, owner, selected);
  const register = state.compensationActivityRetentions?.find((candidate) =>
    sameScopeOccurrence(candidate.owner, owner)
  );
  if (activated === null || register === undefined) {
    return refused(state, CompensationTriggerRefusalReason.InvalidSources);
  }
  const triggers = [...(state.compensationTriggers ?? []), activated.trigger];
  const waits = [...(state.compensationHandlerEffectWaits ?? []), ...activated.waits];
  if (!executionFits(program, triggers, waits)) {
    return refused(state, CompensationTriggerRefusalReason.CapacityExceeded);
  }
  const cleared = removeScopeOccurrenceContents(state, occurrence);
  return checkedSuccess(program, state, {
    ...cleared,
    compensationActivityRetentions: [{ ...register, records: [] }],
    compensationTriggers: triggers,
    compensationHandlerEffectWaits: waits,
    effectActivations: activated.effectActivations,
  });
}

export function finishTransactionCancellation(
  operation: CancelTransactionOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  const occurrences = state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, owner));
  const occurrence = occurrences[0];
  if (
    occurrences.length !== 1 || occurrence === undefined || occurrence.parent === null ||
    owner.definitionScopeId !== operation.definitionScopeId ||
    !isScopeOccurrenceQuiescent(state, occurrence)
  ) return null;
  return {
    ...state,
    scopeOccurrences: state.scopeOccurrences.filter((candidate) => candidate !== occurrence),
    controlTokens: addToken(state.controlTokens, operation.output, occurrence.parent),
    ...(state.compensationActivityRetentions === undefined ? {} : {
      compensationActivityRetentions: state.compensationActivityRetentions.filter(
        (register) => !sameScopeOccurrence(register.owner, owner),
      ),
    }),
  };
}

function checkedSuccess(
  program: SemanticProcessProgram,
  before: RuntimeState,
  state: RuntimeState,
): CompensationTriggerAttempt {
  return compensationRetentionStateDefects(program, state).length === 0 &&
      compensationExecutionStateDefects(program, state).length === 0
    ? { kind: CompensationTriggerAttemptKind.Applied, state }
    : refused(before, CompensationTriggerRefusalReason.InvalidState);
}

function refused(
  state: RuntimeState,
  reason: CompensationTriggerRefusalReason,
): CompensationTriggerAttempt {
  return { kind: CompensationTriggerAttemptKind.Refused, state, reason };
}
