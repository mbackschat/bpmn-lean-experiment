import {
  EffectExecutionResultKind,
  SemanticOperationKind,
  SemanticTransitionKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  ScopeOccurrenceId,
  SemanticOperation,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import type {
  CommittedTransitionRecord,
} from "./semantic-publication.js";

type OccurrenceFact = Record<"processId" | "elementId" | "owner", unknown>;

/** Checks only exact Program-owned facts available without semantic runtime state. */
export function programOccurrenceFactIsValid(
  value: OccurrenceFact,
  program: SemanticProcessProgram,
): boolean {
  const owner = value.owner as ScopeOccurrenceId;
  const scope = program.definitionScopes.find(({ id }) =>
    id === owner.definitionScopeId);
  if (scope === undefined || !elementBelongsToProgram(
    String(value.elementId),
    owner.definitionScopeId,
    program,
  )) {
    return false;
  }
  let root = scope;
  const visited = new Set<string>();
  while (root.parentScopeId !== null) {
    if (visited.has(root.id)) {
      return false;
    }
    visited.add(root.id);
    const parent = program.definitionScopes.find(({ id }) =>
      id === root.parentScopeId);
    if (parent === undefined) {
      return false;
    }
    root = parent;
  }
  return root.originElementId === value.processId;
}

/** Binds a new occurrence to the exact E1 transition that created it. */
export function programOccurrenceStartMatchesTransition(
  value: OccurrenceFact,
  program: SemanticProcessProgram,
  record: CommittedTransitionRecord,
): boolean {
  if (!programOccurrenceFactIsValid(value, program)) {
    return false;
  }
  switch (record.transition.kind) {
    case SemanticTransitionKind.InternalOperation: {
      const operation = uniqueOperation(
        program,
        record.transition.operationId,
      );
      return operation !== null && internalOperationStarts(
        operation,
        record.transition.owner,
        value,
        program,
      );
    }
    case SemanticTransitionKind.ExternalStimulus:
      return externalStimulusStarts(
        record.transition.stimulus,
        value,
        program,
      );
    default:
      return assertNever(record.transition);
  }
}

function internalOperationStarts(
  operation: SemanticOperation,
  transitionOwner: ScopeOccurrenceId,
  value: OccurrenceFact,
  program: SemanticProcessProgram,
): boolean {
  const owner = value.owner as ScopeOccurrenceId;
  const exactOrigin = operation.origin.elementId === value.elementId &&
    sameScope(owner, transitionOwner);
  switch (operation.kind) {
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.InitiateMessage:
    case SemanticOperationKind.InitiateTimer:
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.MergeExclusive:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.SelectMany:
    case SemanticOperationKind.SynchronizeSelected:
    case SemanticOperationKind.ReachNoneEnd:
    case SemanticOperationKind.TerminateScope:
      return exactOrigin;
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
      return sameScope(owner, transitionOwner) &&
        operation.task.elementId === value.elementId;
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return sameScope(owner, transitionOwner) &&
        operation.task.elementId === value.elementId;
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      return false;
    case SemanticOperationKind.AwaitMessage:
      return sameScope(owner, transitionOwner) &&
        operation.message.elementId === value.elementId;
    case SemanticOperationKind.AwaitTimer:
      return sameScope(owner, transitionOwner) &&
        operation.timer.elementId === value.elementId;
    case SemanticOperationKind.AwaitEffect:
      return sameScope(owner, transitionOwner) &&
        operation.effect.elementId === value.elementId;
    case SemanticOperationKind.AwaitEventRace:
      return exactOrigin || (sameScope(owner, transitionOwner) && (
        operation.message.elementId === value.elementId ||
        operation.timer.elementId === value.elementId
      ));
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.EnterBoundedScope:
    case SemanticOperationKind.InvokeProcess:
      return exactOrigin;
    case SemanticOperationKind.ThrowError:
      return exactOrigin || (
        operation.handler.origin.boundaryEventId === value.elementId &&
        parentOwnerCanMatch(transitionOwner, owner, program)
      );
    case SemanticOperationKind.ReturnProcess:
    case SemanticOperationKind.CompleteScope:
      return false;
    default:
      return assertNever(operation);
  }
}

function externalStimulusStarts(
  stimulus: Stimulus,
  value: OccurrenceFact,
  program: SemanticProcessProgram,
): boolean {
  const owner = value.owner as ScopeOccurrenceId;
  switch (stimulus.kind) {
    case StimulusKind.FireTimer:
      return stimulus.timerId.processInstanceId === owner.processInstanceId &&
        stimulus.timerId.elementId === value.elementId &&
        program.operations.some((operation) =>
          operationOwnsScope(operation, owner.definitionScopeId, program) &&
          boundaryTimerElement(operation) === value.elementId);
    case StimulusKind.CompleteEffect:
      return stimulus.result.kind === EffectExecutionResultKind.BpmnError &&
        stimulus.effectId.processInstanceId === owner.processInstanceId &&
        program.operations.some((operation) =>
          operation.kind === SemanticOperationKind.AwaitEffect &&
          operation.effect.elementId === stimulus.effectId.elementId &&
          operation.bpmnErrorRoute?.origin.boundaryEventId === value.elementId &&
          operationOwnsScope(operation, owner.definitionScopeId, program));
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
    case StimulusKind.DeliverMessage:
    case StimulusKind.ReportEffectFailure:
    case StimulusKind.RetryIncident:
    case StimulusKind.CancelIncidentProcess:
      return false;
    case StimulusKind.CompleteUserTaskInstance: {
      if (stimulus.taskId.processInstanceId !== owner.processInstanceId) {
        return false;
      }
      const operation = uniqueMultiInstanceOperationForTask(
        program,
        stimulus.taskId.elementId,
        owner.definitionScopeId,
      );
      return operation !== null &&
        operation.task.elementId === value.elementId;
    }
    default:
      return assertNever(stimulus);
  }
}

function uniqueMultiInstanceOperationForTask(
  program: SemanticProcessProgram,
  taskElementId: string,
  ownerScopeId: string,
): Extract<
  SemanticOperation,
  {
    kind:
      | SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
      | SemanticOperationKind.AwaitParallelMultiInstanceUserTask;
  }
> | null {
  const matches = program.operations.filter((operation): operation is Extract<
    SemanticOperation,
    {
      kind:
        | SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
        | SemanticOperationKind.AwaitParallelMultiInstanceUserTask;
    }
  > => (operation.kind ===
      SemanticOperationKind.AwaitSequentialMultiInstanceUserTask ||
      operation.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask) &&
    operation.task.elementId === taskElementId &&
    operationOwnsScope(operation, ownerScopeId, program));
  return matches.length === 1 ? matches[0] ?? null : null;
}

function uniqueOperation(
  program: SemanticProcessProgram,
  operationId: string,
): SemanticOperation | null {
  const matches = program.operations.filter(({ id }) => id === operationId);
  return matches.length === 1 ? matches[0] ?? null : null;
}

function operationOwnsScope(
  operation: SemanticOperation,
  scopeId: string,
  program: SemanticProcessProgram,
): boolean {
  const matches = program.operationScopes.filter(({ operationId }) =>
    operationId === operation.id);
  return matches.length === 1 && matches[0]?.scopeId === scopeId;
}

function boundaryTimerElement(
  operation: SemanticOperation,
): string | null {
  switch (operation.kind) {
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
    case SemanticOperationKind.EnterBoundedScope:
      return operation.boundaryTimer.elementId;
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return operation.boundaryTimer.elementId;
    default:
      return null;
  }
}

function parentOwnerCanMatch(
  child: ScopeOccurrenceId,
  parent: ScopeOccurrenceId,
  program: SemanticProcessProgram,
): boolean {
  const childDefinition = program.definitionScopes.find(({ id }) =>
    id === child.definitionScopeId);
  return child.processInstanceId === parent.processInstanceId &&
    childDefinition?.parentScopeId === parent.definitionScopeId;
}

function sameScope(
  left: ScopeOccurrenceId,
  right: ScopeOccurrenceId,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.definitionScopeId === right.definitionScopeId &&
    left.activation === right.activation;
}

function elementBelongsToProgram(
  elementId: string,
  ownerScopeId: string,
  program: SemanticProcessProgram,
): boolean {
  if (program.definitionScopes.some(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === elementId)) {
    return false;
  }
  return program.operations.some((operation) => {
    const ownership = program.operationScopes.find(({ operationId }) =>
      operationId === operation.id);
    return ownership !== undefined && (
      (ownership.scopeId === ownerScopeId &&
        operation.kind !==
          SemanticOperationKind.AwaitSequentialMultiInstanceUserTask &&
        operation.origin.elementId === elementId) ||
      operationPublishesNestedElement(
        operation,
        elementId,
        ownership.scopeId,
        ownerScopeId,
        program,
      )
    );
  });
}

function operationPublishesNestedElement(
  operation: SemanticProcessProgram["operations"][number],
  elementId: string,
  operationScopeId: string,
  ownerScopeId: string,
  program: SemanticProcessProgram,
): boolean {
  const directlyOwned = operationScopeId === ownerScopeId;
  switch (operation.kind) {
    case SemanticOperationKind.AwaitUserTask:
      return directlyOwned && operation.task.elementId === elementId;
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
      return directlyOwned && (
        operation.task.elementId === elementId ||
        operation.boundaryTimer.elementId === elementId
      );
    // Only generated inner tasks and the lifetime boundary Event are BPMN flow-node occurrences;
    // the operation origin must not create a second synthetic outer/controller occurrence.
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return directlyOwned && (
        operation.task.elementId === elementId ||
        operation.boundaryTimer.elementId === elementId
      );
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      return false;
    case SemanticOperationKind.EnterBoundedScope:
      return directlyOwned && operation.boundaryTimer.elementId === elementId;
    case SemanticOperationKind.AwaitMessage:
      return directlyOwned && operation.message.elementId === elementId;
    case SemanticOperationKind.AwaitTimer:
      return directlyOwned && operation.timer.elementId === elementId;
    case SemanticOperationKind.AwaitEffect:
      return directlyOwned && (
        operation.effect.elementId === elementId ||
        operation.bpmnErrorRoute?.origin.boundaryEventId === elementId
      );
    case SemanticOperationKind.AwaitEventRace:
      return directlyOwned && (
        operation.message.elementId === elementId ||
        operation.timer.elementId === elementId
      );
    case SemanticOperationKind.ThrowError: {
      const attached = program.definitionScopes.find(({ id }) =>
        id === operation.handler.attachedScopeId);
      return operation.handler.origin.boundaryEventId === elementId &&
        attached?.id === operationScopeId &&
        attached.parentScopeId === ownerScopeId;
    }
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.InitiateMessage:
    case SemanticOperationKind.InitiateTimer:
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.InvokeProcess:
    case SemanticOperationKind.ReturnProcess:
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.MergeExclusive:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.SelectMany:
    case SemanticOperationKind.SynchronizeSelected:
    case SemanticOperationKind.TerminateScope:
    case SemanticOperationKind.ReachNoneEnd:
    case SemanticOperationKind.CompleteScope:
      return false;
    default:
      return assertNever(operation);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic operation: ${String(value)}`);
}
