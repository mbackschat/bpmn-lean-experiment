import type { OccurrenceId } from "./contract.js";
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { sameOccurrence } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

export enum InternalOccurrenceKind {
  Effect = "effect",
  Message = "message",
  Timer = "timer",
  UserTask = "userTask",
}

/** Requires the selected operation to be the sole declarer across ordinary and composite families. */
export function operationIsUniqueWaitDeclarer(
  program: SemanticProcessProgram,
  selected: SemanticOperation,
  family: InternalOccurrenceKind,
  elementId: string,
): boolean {
  const declarers = program.operations.filter((operation) =>
    operationDeclaresWait(operation, family, elementId)
  );
  return declarers.length === 1 && declarers[0]?.id === selected.id;
}

/** Checks the actual untagged public wait-anchor domain, including incident-held effects. */
export function openWaitAnchorIsAbsent(
  state: RuntimeState,
  occurrence: OccurrenceId,
): boolean {
  const open = [
    ...state.userTaskWaits.map(({ id }) => id),
    ...state.messageWaits.map(({ id }) => id),
    ...state.timerWaits.map(({ id }) => id),
    ...state.effectWaits.map(({ id }) => id),
    ...state.effectIncidents.map(({ wait }) => wait.id),
  ];
  return !open.some((candidate) => sameOccurrence(candidate, occurrence));
}

function operationDeclaresWait(
  operation: SemanticOperation,
  family: InternalOccurrenceKind,
  elementId: string,
): boolean {
  switch (operation.kind) {
    case SemanticOperationKind.AwaitUserTask:
      return family === InternalOccurrenceKind.UserTask &&
        operation.task.elementId === elementId;
    case SemanticOperationKind.AwaitMessage:
      return family === InternalOccurrenceKind.Message &&
        operation.message.elementId === elementId;
    case SemanticOperationKind.AwaitTimer:
      return family === InternalOccurrenceKind.Timer &&
        operation.timer.elementId === elementId;
    case SemanticOperationKind.AwaitEffect:
      return family === InternalOccurrenceKind.Effect &&
        operation.effect.elementId === elementId;
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return (family === InternalOccurrenceKind.UserTask &&
          operation.task.elementId === elementId) ||
        (family === InternalOccurrenceKind.Timer &&
          operation.boundaryTimer.elementId === elementId);
    case SemanticOperationKind.EnterBoundedScope:
      return family === InternalOccurrenceKind.Timer &&
        operation.boundaryTimer.elementId === elementId;
    case SemanticOperationKind.AwaitEventRace:
      return (family === InternalOccurrenceKind.Message &&
          operation.message.elementId === elementId) ||
        (family === InternalOccurrenceKind.Timer &&
          operation.timer.elementId === elementId);
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.InitiateMessage:
    case SemanticOperationKind.InitiateTimer:
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.InvokeProcess:
    case SemanticOperationKind.ReturnProcess:
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.MergeExclusive:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.SelectMany:
    case SemanticOperationKind.SynchronizeSelected:
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.TerminateScope:
    case SemanticOperationKind.ReachNoneEnd:
    case SemanticOperationKind.CompleteScope:
      return false;
    default:
      return assertNever(operation);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported wait declarer: ${JSON.stringify(value)}`);
}
