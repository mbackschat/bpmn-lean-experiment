import {
  sameActivityOccurrence,
  type ActivityOccurrenceId,
} from "./activity-occurrence.js";
import {
  CompensationCompletionFactKind,
  CompensationRetentionCapacityMeasure,
  CompensationRetentionRefusalKind,
  CompensationRetentionResultKind,
  MultiInstanceCompensationCompletionOutcome,
  type CompensationCompletionFacts,
  type CompensationRetentionResult,
} from "./compensation-activity-retention-contract.js";
import {
  canonicalCompensationRecordsUtf8Bytes,
  compensationRetentionProgramDefects,
  compensationRetentionStateDefects,
} from "./compensation-activity-retention-state-validation.js";
import {
  SemanticOperationKind,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  sameScopeOccurrence,
  type RuntimeState,
  type ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { isWellFormedWireString } from "./wire.js";

export function initializeCompensationActivityRetention(
  program: SemanticProcessProgram,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  return program.compensationActivityRetention === undefined
    ? state
    : {
        ...state,
        compensationActivityRetentions: [{
          owner,
          nextCompletionOrdinal: 1,
          records: [],
        }],
      };
}

export function retainCompletedCompensableActivity(
  program: SemanticProcessProgram,
  state: RuntimeState,
  facts: CompensationCompletionFacts,
): CompensationRetentionResult {
  const declaration = program.compensationActivityRetention;
  if (declaration === undefined) {
    return refused(state, CompensationRetentionRefusalKind.DeclarationAbsent);
  }
  if (compensationRetentionProgramDefects(program).length > 0) {
    return refused(state, CompensationRetentionRefusalKind.InvalidProgram);
  }
  const retentions = state.compensationActivityRetentions;
  const retention = retentions?.[0];
  if (
    compensationRetentionStateDefects(program, state).length > 0 ||
    retentions === undefined ||
    retentions.length !== 1 ||
    retention === undefined ||
    retention.owner.definitionScopeId !== declaration.definitionScopeId ||
    !state.scopeOccurrences.some(({ id, parent }) =>
      parent === null && sameScopeOccurrence(id, retention.owner)
    )
  ) {
    return refused(state, CompensationRetentionRefusalKind.RetentionStateMismatch);
  }
  if (!validCompletionFacts(facts)) {
    return refused(state, CompensationRetentionRefusalKind.InvalidCompletionFacts);
  }
  if (retention.owner.processInstanceId !== facts.activity.processInstanceId) {
    return refused(state, CompensationRetentionRefusalKind.RetentionStateMismatch);
  }
  const target = declaration.targets.find(
    ({ activityElementId }) => activityElementId === facts.activity.activityElementId,
  );
  if (target === undefined) {
    return refused(state, CompensationRetentionRefusalKind.TargetAbsent);
  }
  if (!factsMatchTargetOperation(program, facts)) {
    return refused(state, CompensationRetentionRefusalKind.InvalidCompletionFacts);
  }
  if (
    facts.kind === CompensationCompletionFactKind.MultiInstanceUserTask &&
    facts.outcome !== MultiInstanceCompensationCompletionOutcome.AllSuccessfulCompletion
  ) {
    return { kind: CompensationRetentionResultKind.NotEligible, state };
  }

  if (retention.records.some(({ id }) => sameActivityOccurrence(id, facts.activity))) {
    return refused(state, CompensationRetentionRefusalKind.DuplicateActivity);
  }

  const prospectiveRecords = [
    ...retention.records,
    { id: facts.activity, completionOrdinal: retention.nextCompletionOrdinal },
  ];
  if (prospectiveRecords.length > declaration.limits.maxRecords) {
    return capacityRefused(
      state,
      CompensationRetentionCapacityMeasure.Records,
      declaration.limits.maxRecords,
      prospectiveRecords.length,
    );
  }
  const canonicalBytes = canonicalCompensationRecordsUtf8Bytes(prospectiveRecords);
  if (canonicalBytes > declaration.limits.maxCanonicalBytes) {
    return capacityRefused(
      state,
      CompensationRetentionCapacityMeasure.CanonicalBytes,
      declaration.limits.maxCanonicalBytes,
      canonicalBytes,
    );
  }
  return {
    kind: CompensationRetentionResultKind.Retained,
    state: {
      ...state,
      compensationActivityRetentions: [{
        ...retention,
        nextCompletionOrdinal: retention.nextCompletionOrdinal + 1,
        records: prospectiveRecords,
      }],
    },
  };
}

function validCompletionFacts(facts: CompensationCompletionFacts): boolean {
  if (!validActivityOccurrence(facts.activity)) {
    return false;
  }
  switch (facts.kind) {
    case CompensationCompletionFactKind.OrdinaryUserTask:
      return true;
    case CompensationCompletionFactKind.MultiInstanceUserTask: {
      const { plannedInstances, successfullyCompletedInstances, outcome } = facts;
      if (
        !Number.isSafeInteger(plannedInstances) ||
        plannedInstances < 0 ||
        !Number.isSafeInteger(successfullyCompletedInstances) ||
        successfullyCompletedInstances < 0
      ) {
        return false;
      }
      switch (outcome) {
        case MultiInstanceCompensationCompletionOutcome.AllSuccessfulCompletion:
          return successfullyCompletedInstances === plannedInstances;
        case MultiInstanceCompensationCompletionOutcome.EarlyCompletion:
        case MultiInstanceCompensationCompletionOutcome.Interrupted:
          return successfullyCompletedInstances < plannedInstances;
      }
    }
  }
}

function factsMatchTargetOperation(
  program: SemanticProcessProgram,
  facts: CompensationCompletionFacts,
): boolean {
  const declaration = program.compensationActivityRetention;
  if (declaration === undefined) return false;
  const matchingOperations = program.operations.filter((operation) =>
    operation.origin.elementId === facts.activity.activityElementId &&
    "task" in operation &&
    operation.task.elementId === facts.activity.activityElementId &&
    operationInDeclarationScope(program, operation.id, declaration.definitionScopeId)
  );
  if (matchingOperations.length !== 1) return false;
  const operation = matchingOperations[0];
  if (operation === undefined) return false;
  switch (facts.kind) {
    case CompensationCompletionFactKind.OrdinaryUserTask:
      return operation.kind === SemanticOperationKind.AwaitUserTask;
    case CompensationCompletionFactKind.MultiInstanceUserTask:
      return operation.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask ||
        operation.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask;
  }
}

function operationInDeclarationScope(
  program: SemanticProcessProgram,
  operationId: string,
  definitionScopeId: string,
): boolean {
  const ownership = program.operationScopes.filter(
    (candidate) => candidate.operationId === operationId,
  );
  return ownership.length === 1 && ownership[0]?.scopeId === definitionScopeId;
}

function validActivityOccurrence(id: ActivityOccurrenceId): boolean {
  return isWellFormedWireString(id.processInstanceId) &&
    id.processInstanceId.length > 0 &&
    isWellFormedWireString(id.activityElementId) &&
    id.activityElementId.length > 0 &&
    Number.isSafeInteger(id.activation) &&
    id.activation > 0;
}

function refused(
  state: RuntimeState,
  kind:
    | CompensationRetentionRefusalKind.DeclarationAbsent
    | CompensationRetentionRefusalKind.InvalidProgram
    | CompensationRetentionRefusalKind.InvalidCompletionFacts
    | CompensationRetentionRefusalKind.TargetAbsent
    | CompensationRetentionRefusalKind.RetentionStateMismatch
    | CompensationRetentionRefusalKind.DuplicateActivity,
): CompensationRetentionResult {
  return {
    kind: CompensationRetentionResultKind.Refused,
    state,
    refusal: { kind },
  };
}

function capacityRefused(
  state: RuntimeState,
  measure: CompensationRetentionCapacityMeasure,
  configuredBound: number,
  observedValue: number,
): CompensationRetentionResult {
  return {
    kind: CompensationRetentionResultKind.Refused,
    state,
    refusal: {
      kind: CompensationRetentionRefusalKind.CapacityExceeded,
      measure,
      configuredBound,
      observedValue,
    },
  };
}
