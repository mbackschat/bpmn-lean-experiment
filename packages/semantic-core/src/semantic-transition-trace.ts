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
import {
  compareInternalTransitionPublicationSortKeys,
  deriveInternalTransitionFootprint,
  internalOperationPairIsIndependent,
} from "./internal-transition-footprint.js";
import type {
  InternalTransitionPublicationSortKey,
} from "./internal-transition-footprint.js";
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
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import {
  applyInternalOperationStep,
  evaluateStimulusWithSelectedSteps,
  isStableStateResumable,
} from "./semantic-process-runtime.js";
import type {
  AppliedInternalOperationStep,
  CommandResult,
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
  const result = evaluation.result;
  const currentPositions = projectCurrentControlPositions(program, result.state);
  if (
    result.outcome !== CommandOutcome.Committed ||
    result.internalStepBoundExceeded ||
    evaluation.ambiguousInternalChoice ||
    evaluation.admittedState === null ||
    !isStableStateResumable(result.state) ||
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
  for (
    let stepIndex = 0;
    stepIndex < evaluation.selectedInternalSteps.length;
  ) {
    const step = evaluation.selectedInternalSteps[stepIndex];
    if (step === undefined) {
      return noTrace(result);
    }
    const next = evaluation.selectedInternalSteps[stepIndex + 1];
    if (
      next !== undefined &&
      internalOperationPairIsIndependent(program, before, [step, next])
    ) {
      const leftFootprint = deriveInternalTransitionFootprint(
        program,
        before,
        step,
      );
      const rightFootprint = deriveInternalTransitionFootprint(
        program,
        before,
        next,
      );
      if (leftFootprint === null || rightFootprint === null) {
        return noTrace(result);
      }
      const leftUnit = internalPublicationUnit(
        program,
        before,
        step,
        leftFootprint.publicationSortKey,
      );
      const rightUnit = internalPublicationUnit(
        program,
        step.successor,
        next,
        rightFootprint.publicationSortKey,
      );
      if (leftUnit === null || rightUnit === null) {
        return noTrace(result);
      }
      const units = [
        { ...leftUnit, sortKey: leftFootprint.publicationSortKey },
        { ...rightUnit, sortKey: rightFootprint.publicationSortKey },
      ].sort((left, right) =>
        compareInternalTransitionPublicationSortKeys(
          left.sortKey,
          right.sortKey,
        )
      );
      if (
        !appendInternalPublicationUnits(
          stimulus.commandId,
          records,
          lifecycles,
          units,
        )
      ) {
        return noTrace(result);
      }
      before = next.successor;
      stepIndex += 2;
      continue;
    }

    const unit = internalPublicationUnit(program, before, step, null);
    if (
      unit === null ||
      !appendInternalPublicationUnits(
        stimulus.commandId,
        records,
        lifecycles,
        [unit],
      )
    ) {
      return noTrace(result);
    }
    before = step.successor;
    stepIndex += 1;
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

type InternalPublicationUnit = Readonly<{
  record: UnnumberedCommittedTransitionRecord;
  lifecycleAt: (
    commandId: string,
    transitionIndex: number,
  ) => UnnumberedFlowNodeOccurrenceDelta | null;
  sortKey: InternalTransitionPublicationSortKey | null;
}>;

function internalPublicationUnit(
  program: SemanticProcessProgram,
  before: RuntimeState,
  step: AppliedInternalOperationStep,
  sortKey: InternalTransitionPublicationSortKey | null,
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
        sortKey,
      };
}

function appendInternalPublicationUnits(
  commandId: string,
  records: UnnumberedCommittedTransitionRecord[],
  lifecycles: UnnumberedFlowNodeOccurrenceDelta[],
  units: ReadonlyArray<InternalPublicationUnit>,
): boolean {
  for (const unit of units) {
    const lifecycle = unit.lifecycleAt(commandId, records.length);
    if (lifecycle === null) {
      return false;
    }
    records.push(unit.record);
    lifecycles.push(lifecycle);
  }
  return true;
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
    const step = applyInternalOperationStep(program, operation, current);
    if (
      step === null ||
      step.owner === null ||
      operation.kind !== transition.operationKind ||
      !sameOrigin(operation.origin, transition.origin) ||
      !sameScopeOccurrence(step.owner, transition.owner) ||
      !recordBoundaryMatches(program, current, step.successor, record)
    ) {
      return null;
    }
    current = step.successor;
  }
  return current;
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
