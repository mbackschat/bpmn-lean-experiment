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
  Activity = "activity",
  Call = "call",
  Effect = "effect",
  EventRace = "eventRace",
  Message = "message",
  Scope = "scope",
  Timer = "timer",
  UserTask = "userTask",
}

type WaitDeclaration = Readonly<{
  family: InternalOccurrenceKind;
  elementId: string;
}>;

/** Requires every family-tagged wait identity in the Program to have one declaring operation. */
export function programWaitDeclarersAreUnique(
  operations: ReadonlyArray<SemanticOperation>,
): boolean {
  return operations.every((operation) =>
    operationWaitDeclarations(operation).every(({ family, elementId }) =>
      operations.filter((candidate) =>
        operationDeclaresWait(candidate, family, elementId)
      ).length === 1
    )
  );
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
  return operationWaitDeclarations(operation).some((declaration) =>
    declaration.family === family && declaration.elementId === elementId
  );
}

function operationWaitDeclarations(
  operation: SemanticOperation,
): ReadonlyArray<WaitDeclaration> {
  switch (operation.kind) {
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitDataInputUserTask:
    case SemanticOperationKind.AwaitDataOutputUserTask:
      return [{
        family: InternalOccurrenceKind.UserTask,
        elementId: operation.task.elementId,
      }];
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitPayloadMessage:
      return [{
        family: InternalOccurrenceKind.Message,
        elementId: operation.message.elementId,
      }];
    case SemanticOperationKind.AwaitTimer:
      return [{
        family: InternalOccurrenceKind.Timer,
        elementId: operation.timer.elementId,
      }];
    case SemanticOperationKind.AwaitEffect:
      return [{
        family: InternalOccurrenceKind.Effect,
        elementId: operation.effect.elementId,
      }];
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return [
        {
          family: InternalOccurrenceKind.UserTask,
          elementId: operation.task.elementId,
        },
        {
          family: InternalOccurrenceKind.Timer,
          elementId: operation.boundaryTimer.elementId,
        },
      ];
    case SemanticOperationKind.AwaitMessageBoundedUserTask:
      return [
        {
          family: InternalOccurrenceKind.UserTask,
          elementId: operation.task.elementId,
        },
        {
          family: InternalOccurrenceKind.Message,
          elementId: operation.boundaryMessage.elementId,
        },
      ];
    case SemanticOperationKind.EnterBoundedScope:
      return [{
        family: InternalOccurrenceKind.Timer,
        elementId: operation.boundaryTimer.elementId,
      }];
    case SemanticOperationKind.AwaitEventRace:
      return [
        {
          family: InternalOccurrenceKind.Message,
          elementId: operation.message.elementId,
        },
        {
          family: InternalOccurrenceKind.Timer,
          elementId: operation.timer.elementId,
        },
      ];
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
      return [];
    default:
      return assertNever(operation);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported wait declarer: ${JSON.stringify(value)}`);
}
