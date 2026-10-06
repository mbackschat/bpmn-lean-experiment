import { CommandOutcome } from "./contract.js";
import type {
  StateObservation,
  Stimulus,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import {
  projectFlowNodeOccurrenceLifecycleDelta,
} from "./flow-node-occurrence-lifecycle.js";
import type {
  UnnumberedFlowNodeOccurrenceDelta,
} from "./flow-node-occurrence-lifecycle.js";
import type { InternalChoiceSchedule, ScheduledStimulusResult } from "./internal-choice-schedule.js";
import { instantiateInternalPublicationBatch } from "./internal-publication-template.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import { InternalBatchPreparationKind } from "./internal-transition-preparation.js";
import type { InternalBatchPreparation } from "./internal-transition-preparation.js";
import { applyInternalOccurrenceBatch } from "./internal-occurrence-batch.js";
import { applyInternalOperationOccurrence } from "./internal-operation-occurrence.js";
import { PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";
import { InternalAlternativeKind } from "./internal-transition-alternative.js";
import { isWellFormedSemanticProcessProgram } from "./semantic-process-admission.js";
import { applyPreparedInternalExclusiveMerge, deriveInternalExclusiveMergePreparations } from "./internal-transition-merge-preparation.js";
import {
  projectControlPositionDelta,
  projectCurrentControlPositions,
} from "./control-position-projection.js";
import type {
  CurrentControlPositions,
  PublicControlPositionDelta,
  PublicControlTokenPosition,
  PublicScopePosition,
} from "./control-position-projection.js";
import { admit } from "./semantic-command-admission.js";
import type {
  BpmnElementOrigin,
  MergeExclusiveOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import {
  applyInternalOperationStep,
  evaluateStimulusWithSelectedSteps,
  evaluateScheduledStimulusWithSelectedSteps,
  isStableStateSound,
} from "./semantic-process-runtime.js";
import type {
  AppliedInternalOperationStep,
  CommandResult,
  StimulusEvaluationResult,
} from "./semantic-process-runtime.js";
import {
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export enum SemanticTransitionKind {
  ExternalStimulus = "externalStimulus",
  InternalOperation = "internalOperation",
}

export type UnnumberedCommittedTransition = DeepReadonly<
  | {
      kind: SemanticTransitionKind.ExternalStimulus;
      stimulus: Stimulus;
    }
  | {
      kind: SemanticTransitionKind.InternalOperation;
      operationId: string;
      operationKind: SemanticOperationKind;
      origin: BpmnElementOrigin;
      owner: ScopeOccurrenceId;
    }
>;

export type UnnumberedCommittedTransitionRecord = DeepReadonly<{
  logicalTimeMs: number;
  transition: UnnumberedCommittedTransition;
  positionDelta: PublicControlPositionDelta;
}>;

export type TracedCommandResult = DeepReadonly<{
  result: CommandResult;
  committedTransitions: UnnumberedCommittedTransitionRecord[];
  flowNodeOccurrenceLifecycles: UnnumberedFlowNodeOccurrenceDelta[];
  currentPositions: CurrentControlPositions | null;
}>;

export type TracedScheduledStimulusResult = Omit<TracedCommandResult, "result"> & Readonly<{
  result: ScheduledStimulusResult;
}>;

export type UnnumberedCurrentCommittedExecution = DeepReadonly<{
  state: StateObservation;
  controlTokens: PublicControlTokenPosition[];
  scopes: PublicScopePosition[];
}>;

export type UnnumberedCommittedExecutionPublication = DeepReadonly<{
  transitions: [
    UnnumberedCommittedTransitionRecord,
    ...UnnumberedCommittedTransitionRecord[],
  ];
  current: UnnumberedCurrentCommittedExecution;
}>;

/**
 * Projects the one evaluator result into public facts only after stable closure
 * and an independent current-position projection both succeed.
 */
export function applyStimulusWithTrace(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  closureLimit?: number,
): TracedCommandResult {
  const evaluation = evaluateStimulusWithSelectedSteps(
    program,
    state,
    stimulus,
    closureLimit,
  );
  return projectStimulusEvaluation(program, state, stimulus, evaluation);
}

export function applyStimulusWithScheduleAndTrace(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  schedule: InternalChoiceSchedule,
  closureLimit?: number,
): TracedScheduledStimulusResult {
  const evaluation = evaluateScheduledStimulusWithSelectedSteps(program, state, stimulus, schedule, closureLimit);
  return { ...projectStimulusEvaluation(program, state, stimulus, evaluation), result: evaluation.result };
}

function projectStimulusEvaluation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  evaluation: StimulusEvaluationResult,
): TracedCommandResult {
  const result = evaluation.result;
  const currentPositions = projectCurrentControlPositions(program, result.state);
  if (
    result.outcome !== CommandOutcome.Committed ||
    result.internalStepBoundExceeded ||
    evaluation.ambiguousInternalChoice ||
    evaluation.admittedState === null ||
    !isStableStateSound(result.state) ||
    currentPositions === null
  ) {
    return noTrace(result);
  }

  const records: UnnumberedCommittedTransitionRecord[] = [];
  const lifecycles: UnnumberedFlowNodeOccurrenceDelta[] = [];
  const externalTransition = {
    kind: SemanticTransitionKind.ExternalStimulus,
    stimulus,
  } as const;
  const external = transitionRecord(
    program,
    state,
    evaluation.admittedState,
    externalTransition,
  );
  const externalLifecycle = projectFlowNodeOccurrenceLifecycleDelta(
    program,
    state,
    evaluation.admittedState,
    { kind: "external", stimulus },
    stimulus.commandId,
    0,
  );
  if (external === null || externalLifecycle === null) {
    return noTrace(result);
  }
  records.push(external);
  lifecycles.push(externalLifecycle);

  let before = evaluation.admittedState;
  for (const [batchIndex, batch] of evaluation.selectedInternalBatches.entries()) {
    const preparation = evaluation.selectedInternalPreparations[batchIndex];
    if (preparation === undefined) return noTrace(result);
    const published = projectInternalExecutionBatch(program, before, batch, preparation,
      stimulus.commandId, records.length);
    if (published === null) return noTrace(result);
    records.push(...published.records);
    lifecycles.push(...published.lifecycles);
    before = published.state;
  }

  return sameJson(before, result.state)
    ? {
        result,
        committedTransitions: records,
        flowNodeOccurrenceLifecycles: lifecycles,
        currentPositions,
      }
    : noTrace(result);
}

/** Preserves the retained batch plan while checking every publication against its actual predecessor/successor. */
export function projectInternalExecutionBatch(
  program: SemanticProcessProgram, before: RuntimeState, batch: readonly AppliedInternalOperationStep[],
  preparation: InternalBatchPreparation | null, commandId: string, first: number,
): Readonly<{ state: RuntimeState; records: readonly UnnumberedCommittedTransitionRecord[];
  lifecycles: readonly UnnumberedFlowNodeOccurrenceDelta[] }> | null {
  if (batch.length === 0) return null;
  if (preparation === null) {
    if (batch.length !== 1) return null;
    const step = batch[0]!;
    const unit = internalPublicationUnit(program, before, step);
    // PMIS-SELECT-01 binds unpublished controller/data state as well as the visible lifecycle.
    if (program.identity.semanticProfile === PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID &&
        (unit === null || !isWellFormedSemanticProcessProgram(program) ||
          !sameJson(replayInternalTransitionRecord(program, before, unit.record), step.successor))) return null;
    const lifecycle = unit?.lifecycleAt(commandId, first);
    return unit === null || lifecycle === undefined || lifecycle === null ? null
      : { state: step.successor, records: [unit.record], lifecycles: [lifecycle] };
  }
  let templates: readonly InternalPublicationTemplate[];
  switch (preparation.kind) {
    case InternalBatchPreparationKind.Prepared:
      if (preparation.members.length !== batch.length) return null;
      templates = preparation.members.map(member => member.publicationTemplate);
      break;
    case InternalBatchPreparationKind.ReservedOccurrences: {
      if (!isWellFormedSemanticProcessProgram(program)) return null;
      const applied = applyInternalOccurrenceBatch(program, before, preparation.certificate);
      if (applied === null || !sameJson(applied, batch)) return null;
      templates = preparation.certificate.members.map(member => member.publicationTemplate);
      break;
    }
  }
  const publications = instantiateInternalPublicationBatch(commandId, first, templates);
  if (publications === null) return null;
  let state = before;
  for (const step of batch) {
    const publication = publications.find(({ alternative }) => alternative.operationId === step.operation.id &&
      (preparation.kind !== InternalBatchPreparationKind.ReservedOccurrences ||
        (alternative.kind === InternalAlternativeKind.OperationOccurrence && step.owner !== null &&
          sameScopeOccurrence(alternative.owner, step.owner))));
    const unit = internalPublicationUnit(program, state, step);
    if (publication === undefined || unit === null) return null;
    const lifecycle = unit.lifecycleAt(commandId, publication.transitionIndex);
    if (lifecycle === null || !sameJson(unit.record, publication.record) || !sameJson(lifecycle, publication.lifecycle)) return null;
    if (preparation.kind === InternalBatchPreparationKind.ReservedOccurrences &&
        !sameJson(replayInternalTransitionRecord(program, state, publication.record), step.successor)) return null;
    state = step.successor;
  }
  return { state, records: publications.map(publication => publication.record),
    lifecycles: publications.map(publication => publication.lifecycle) };
}

type InternalPublicationUnit = Readonly<{
  record: UnnumberedCommittedTransitionRecord;
  lifecycleAt: (
    commandId: string,
    transitionIndex: number,
  ) => UnnumberedFlowNodeOccurrenceDelta | null;
}>;

function internalPublicationUnit(
  program: SemanticProcessProgram,
  before: RuntimeState,
  step: AppliedInternalOperationStep,
): InternalPublicationUnit | null {
  const owner = step.owner;
  if (owner === null) {
    return null;
  }
  const transition = {
    kind: SemanticTransitionKind.InternalOperation,
    operationId: step.operation.id,
    operationKind: step.operation.kind,
    origin: step.operation.origin,
    owner,
  } as const;
  const record = transitionRecord(program, before, step.successor, transition);
  return record === null
    ? null
    : {
        record,
        lifecycleAt: (commandId, transitionIndex) =>
          projectFlowNodeOccurrenceLifecycleDelta(
            program,
            before,
            step.successor,
            {
              kind: "internal",
              operation: step.operation,
              owner,
            },
            commandId,
            transitionIndex,
          ),
      };
}

function transitionRecord(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  transition: UnnumberedCommittedTransition,
): UnnumberedCommittedTransitionRecord | null {
  const positionDelta = projectControlPositionDelta(program, before, after);
  return positionDelta === null ||
      !Number.isSafeInteger(after.logicalTimeMs) ||
      after.logicalTimeMs < 0
    ? null
    : { logicalTimeMs: after.logicalTimeMs, transition, positionDelta };
}

function noTrace(result: CommandResult): TracedCommandResult {
  return {
    result,
    committedTransitions: [],
    flowNodeOccurrenceLifecycles: [],
    currentPositions: null,
  };
}

/**
 * Replays a complete unnumbered record sequence under the exact Program.
 * Redundant operation facts and public deltas are validated before advancing.
 */
export function replayCommittedTransitions(
  program: SemanticProcessProgram,
  initial: RuntimeState,
  records: ReadonlyArray<UnnumberedCommittedTransitionRecord>,
): RuntimeState | null {
  const first = records[0];
  if (
    first === undefined ||
    first.transition.kind !== SemanticTransitionKind.ExternalStimulus
  ) {
    return null;
  }

  const admission = admit(program, initial, first.transition.stimulus);
  if (
    admission.outcome !== CommandOutcome.Committed ||
    !recordBoundaryMatches(program, initial, admission.state, first)
  ) {
    return null;
  }
  let current = admission.state;

  for (const record of records.slice(1)) {
    const next = replayInternalTransitionRecord(program, current, record);
    if (next === null) return null;
    current = next;
  }
  return current;
}

/** Replays one internal boundary while retaining its exact metadata and consumed-position checks. */
export function replayInternalTransitionRecord(
  program: SemanticProcessProgram, current: RuntimeState,
  record: UnnumberedCommittedTransitionRecord,
): RuntimeState | null {
  if (record.transition.kind !== SemanticTransitionKind.InternalOperation) {
    return null;
  }
  const transition = record.transition;
  const operations = program.operations.filter(
    ({ id }) => id === transition.operationId,
  );
  const operation = operations[0];
  if (operations.length !== 1 || operation === undefined) {
    return null;
  }
  if (operation.kind !== transition.operationKind || !sameOrigin(operation.origin, transition.origin)) return null;
  if (program.identity.semanticProfile === PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID) {
    const next = applyInternalOperationOccurrence(program, current,
      { operationId: operation.id, owner: transition.owner });
    return next !== null && recordBoundaryMatches(program, current, next, record) ? next : null;
  }
  // A record identifies its consumed bucket through its exact public delta; replay must not use the unique-offer selector.
  const step = operation.kind === SemanticOperationKind.MergeExclusive
    ? replayMergeStep(program, current, operation, record)
    : applyInternalOperationStep(program, operation, current);
  if (
    step === null ||
    step.owner === null ||
    !sameScopeOccurrence(step.owner, transition.owner) ||
    !recordBoundaryMatches(program, current, step.successor, record)
  ) {
    return null;
  }
  return step.successor;
}

function replayMergeStep(
  program: SemanticProcessProgram,
  before: RuntimeState,
  operation: MergeExclusiveOperation,
  record: UnnumberedCommittedTransitionRecord,
): AppliedInternalOperationStep | null {
  const preparations = deriveInternalExclusiveMergePreparations(program, before, operation);
  if (preparations === null) return applyInternalOperationStep(program, operation, before);
  const matches = preparations.flatMap((prepared) => {
    const successor = applyPreparedInternalExclusiveMerge(program, before, prepared);
    return successor !== null && recordBoundaryMatches(program, before, successor, record)
      ? [{ operation, owner: prepared.owner, successor }] : [];
  });
  return matches.length === 1 ? matches[0]! : null;
}

function recordBoundaryMatches(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  record: UnnumberedCommittedTransitionRecord,
): boolean {
  const delta = projectControlPositionDelta(program, before, after);
  return delta !== null &&
    Number.isSafeInteger(record.logicalTimeMs) &&
    record.logicalTimeMs >= 0 &&
    record.logicalTimeMs === after.logicalTimeMs &&
    sameJson(delta, record.positionDelta);
}

function sameOrigin(
  left: BpmnElementOrigin,
  right: BpmnElementOrigin,
): boolean {
  return left.kind === right.kind && left.elementId === right.elementId;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
