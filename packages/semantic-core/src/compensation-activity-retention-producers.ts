import {
  CompensationCompletionFactKind,
  CompensationRetentionResultKind,
  MultiInstanceCompensationCompletionOutcome,
  type CompensationCompletionFacts,
} from "./compensation-activity-retention-contract.js";
import { retainCompletedCompensableActivity } from "./compensation-activity-retention.js";
import type { ActivityOccurrenceId } from "./activity-occurrence.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  nextActivation,
  setActivationCount,
  type RuntimeState,
  type ScopeOccurrenceId,
} from "./semantic-process-state.js";

export enum ZeroItemCompensationRetentionStageKind {
  Unchanged = "unchanged",
  Staged = "staged",
}

export type ZeroItemCompensationRetentionStage = Readonly<
  | {
      kind: ZeroItemCompensationRetentionStageKind.Unchanged;
      state: RuntimeState;
    }
  | {
      kind: ZeroItemCompensationRetentionStageKind.Staged;
      state: RuntimeState;
      activity: ActivityOccurrenceId;
      retentionOwner: ScopeOccurrenceId;
    }
>;

export function isCompensationRetentionTarget(
  program: SemanticProcessProgram,
  activityElementId: string,
): boolean {
  return program.compensationActivityRetention?.targets.some((target) =>
    target.activityElementId === activityElementId
  ) ?? false;
}

export function stageCompensationActivityRetention(
  program: SemanticProcessProgram,
  state: RuntimeState,
  facts: CompensationCompletionFacts,
): RuntimeState | null {
  if (!isCompensationRetentionTarget(program, facts.activity.activityElementId)) {
    return state;
  }
  const result = retainCompletedCompensableActivity(program, state, facts);
  switch (result.kind) {
    case CompensationRetentionResultKind.Retained:
    case CompensationRetentionResultKind.NotEligible:
      return result.state;
    case CompensationRetentionResultKind.Refused:
      return null;
  }
}

export function stageZeroItemCompensationRetention(
  program: SemanticProcessProgram,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
  activityElementId: string,
): ZeroItemCompensationRetentionStage | null {
  if (!isCompensationRetentionTarget(program, activityElementId)) {
    return {
      kind: ZeroItemCompensationRetentionStageKind.Unchanged,
      state,
    };
  }
  const activation = nextActivation(state.activityActivations, activityElementId);
  const activity = {
    processInstanceId: owner.processInstanceId,
    activityElementId,
    activation,
  } as const;
  const staged = stageCompensationActivityRetention(
    program,
    {
      ...state,
      activityActivations: setActivationCount(
        state.activityActivations,
        activityElementId,
        activation,
      ),
    },
    {
      kind: CompensationCompletionFactKind.MultiInstanceUserTask,
      activity,
      plannedInstances: 0,
      successfullyCompletedInstances: 0,
      outcome: MultiInstanceCompensationCompletionOutcome.AllSuccessfulCompletion,
    },
  );
  const retentionOwner = staged?.compensationActivityRetentions?.[0]?.owner;
  return staged === null || retentionOwner === undefined
    ? null
    : {
        kind: ZeroItemCompensationRetentionStageKind.Staged,
        state: staged,
        activity,
        retentionOwner,
      };
}
