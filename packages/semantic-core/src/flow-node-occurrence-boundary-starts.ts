/**
 * Candidate lifecycle starts derived independently at one evaluator transition boundary.
 *
 * The selected Program operation, its runtime owner, and the exact successor record must agree.
 * Current-open projection is a later oracle and is deliberately absent from this owner.
 */
import type { OccurrenceId } from "./contract.js";
import { sameMessageChannel } from "./message-channel.js";
import { evaluateInputMappings } from "./semantic-process-data.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import type {
  SemanticFlowNodeOccurrenceAnchorKind,
  UnnumberedFlowNodeOccurrenceStart,
} from "./flow-node-occurrence-lifecycle.js";
import {
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import {
  sequentialMultiInstanceEntryStarts,
} from "./flow-node-occurrence-sequential-multi-instance.js";
import {
  parallelMultiInstanceEntryStarts,
} from "./flow-node-occurrence-parallel-multi-instance-lifecycle.js";

const WaitAnchorKind = "wait" as SemanticFlowNodeOccurrenceAnchorKind.Wait;
const ScopeAnchorKind = "scope" as SemanticFlowNodeOccurrenceAnchorKind.Scope;
const CallAnchorKind = "callActivity" as SemanticFlowNodeOccurrenceAnchorKind.CallActivity;

/** Constructs every long-lived start created by one selected internal operation. */
export function candidateLongLivedStarts(
  program: SemanticProcessProgram,
  after: RuntimeState,
  operation: SemanticOperation,
  owner: ScopeOccurrenceId,
): UnnumberedFlowNodeOccurrenceStart[] | null {
  if (!operationIsSelectedFromProgram(program, operation, owner)) return null;
  const processId = candidateProcessId(program, after, owner);
  if (processId === null) return null;
  switch (operation.kind) {
    case SemanticOperationKind.AwaitUserTask: {
      const wait = only(after.userTaskWaits.filter((candidate) =>
        candidate.id.elementId === operation.task.elementId &&
        candidate.output === operation.output &&
        candidate.name === operation.task.name &&
        sameJson(candidate.metadata, operation.task.metadata) &&
        sameScopeOccurrence(candidate.owner, owner)
      ));
      return oneWaitStart(processId, operation.task.elementId, owner, wait?.id);
    }
    case SemanticOperationKind.AwaitDataInputUserTask: {
      const wait = only(after.userTaskWaits.filter((candidate) =>
        candidate.id.elementId === operation.task.elementId &&
        candidate.output === operation.output &&
        candidate.name === operation.task.name &&
        candidate.metadata === undefined &&
        sameScopeOccurrence(candidate.owner, owner)
      ));
      return oneWaitStart(processId, operation.task.elementId, owner, wait?.id);
    }
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask: {
      const wait = only(after.userTaskWaits.filter((candidate) =>
        candidate.id.elementId === operation.task.elementId &&
        candidate.output === operation.task.output &&
        candidate.name === operation.task.name &&
        candidate.metadata === undefined &&
        sameScopeOccurrence(candidate.owner, owner)
      ));
      return oneWaitStart(processId, operation.task.elementId, owner, wait?.id);
    }
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
      return sequentialMultiInstanceEntryStarts(after, operation, owner, processId);
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return parallelMultiInstanceEntryStarts(after, operation, owner, processId);
    case SemanticOperationKind.AwaitMessage: {
      const wait = only(after.messageWaits.filter((candidate) =>
        candidate.id.elementId === operation.message.elementId &&
        candidate.output === operation.output &&
        sameMessageChannel(candidate.channel, operation.message.channel) &&
        sameScopeOccurrence(candidate.owner, owner)
      ));
      return oneWaitStart(processId, operation.message.elementId, owner, wait?.id);
    }
    case SemanticOperationKind.AwaitTimer: {
      const deadlineMs = after.logicalTimeMs + operation.timer.durationMs;
      const wait = Number.isSafeInteger(deadlineMs)
        ? only(after.timerWaits.filter((candidate) =>
          candidate.id.elementId === operation.timer.elementId &&
          candidate.output === operation.output &&
          candidate.deadlineMs === deadlineMs &&
          sameScopeOccurrence(candidate.owner, owner)
        ))
        : undefined;
      return oneWaitStart(processId, operation.timer.elementId, owner, wait?.id);
    }
    case SemanticOperationKind.AwaitEffect: {
      const wait = only(after.effectWaits.filter((candidate) =>
        candidate.id.elementId === operation.effect.elementId &&
        candidate.output === operation.output &&
        sameJson(candidate.descriptor, operation.effect.descriptor) &&
        sameJson(candidate.arguments, evaluateInputMappings(operation.effect.inputMappings)) &&
        sameJson(candidate.outputMappings, operation.effect.outputMappings) &&
        sameJson(candidate.bpmnErrorRoute, operation.bpmnErrorRoute) &&
        sameScopeOccurrence(candidate.owner, owner)
      ));
      return oneWaitStart(processId, operation.effect.elementId, owner, wait?.id);
    }
    case SemanticOperationKind.AwaitEventRace:
      return eventRaceStarts(program, after, operation, owner, processId);
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.EnterBoundedScope: {
      const definition = only(program.definitionScopes.filter(({ id, originElementId }) =>
        id === operation.childScopeId && originElementId === operation.origin.elementId
      ));
      const child = only(after.scopeOccurrences.filter(({ id, parent }) =>
        id.definitionScopeId === operation.childScopeId &&
        parent !== null &&
        sameScopeOccurrence(parent, owner)
      ));
      return definition === undefined || child === undefined ||
          child.id.processInstanceId !== owner.processInstanceId || !validScopeId(child.id) ? null : [{
        anchor: { kind: ScopeAnchorKind, id: child.id },
        processId,
        elementId: operation.origin.elementId,
        owner,
      }];
    }
    case SemanticOperationKind.InvokeProcess: {
      const record = only(after.calledProcessOccurrences.filter((candidate) =>
        candidate.id.elementId === operation.origin.elementId &&
        candidate.calledProcessId === operation.calledProcessId &&
        candidate.calledRoot.definitionScopeId === operation.calledRootScopeId &&
        candidate.returnOperationId === operation.returnOperationId &&
        sameScopeOccurrence(candidate.caller, owner)
      ));
      return record === undefined || record.id.processInstanceId !== owner.processInstanceId ||
          !validOccurrence(record.id) ? null : [{
        anchor: { kind: CallAnchorKind, id: record.id },
        processId,
        elementId: operation.origin.elementId,
        owner,
      }];
    }
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.InitiateMessage:
    case SemanticOperationKind.InitiateTimer:
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
    case SemanticOperationKind.ReturnProcess:
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

function eventRaceStarts(
  program: SemanticProcessProgram,
  after: RuntimeState,
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitEventRace }>,
  owner: ScopeOccurrenceId,
  processId: string,
): UnnumberedFlowNodeOccurrenceStart[] | null {
  const race = only(after.eventRaces.filter((candidate) =>
    candidate.id.elementId === operation.origin.elementId &&
    sameScopeOccurrence(candidate.owner, owner)
  ));
  if (race === undefined) return null;
  const message = only(after.messageWaits.filter((candidate) =>
    sameOccurrence(candidate.id, race.messageSubscriptionId) &&
    candidate.id.elementId === operation.message.elementId &&
    candidate.output === operation.message.output &&
    sameMessageChannel(candidate.channel, operation.message.channel) &&
    sameScopeOccurrence(candidate.owner, owner)
  ));
  const deadlineMs = after.logicalTimeMs + operation.timer.durationMs;
  const timer = Number.isSafeInteger(deadlineMs)
    ? only(after.timerWaits.filter((candidate) =>
      sameOccurrence(candidate.id, race.timerOccurrenceId) &&
      candidate.id.elementId === operation.timer.elementId &&
      candidate.output === operation.timer.output &&
      candidate.deadlineMs === deadlineMs &&
      sameScopeOccurrence(candidate.owner, owner)
    ))
    : undefined;
  const messageStart = message === undefined
    ? null
    : waitStart(processId, operation.message.elementId, owner, message.id);
  const timerStart = timer === undefined
    ? null
    : waitStart(processId, operation.timer.elementId, owner, timer.id);
  return messageStart === null || timerStart === null ? null : [messageStart, timerStart];
}

function waitStart(
  processId: string,
  elementId: string,
  owner: ScopeOccurrenceId,
  id: OccurrenceId,
): UnnumberedFlowNodeOccurrenceStart | null {
  return id.processInstanceId === owner.processInstanceId && id.elementId === elementId && validOccurrence(id)
    ? { anchor: { kind: WaitAnchorKind, id }, processId, elementId, owner }
    : null;
}

function oneWaitStart(
  processId: string,
  elementId: string,
  owner: ScopeOccurrenceId,
  id: OccurrenceId | undefined,
): UnnumberedFlowNodeOccurrenceStart[] | null {
  const start = id === undefined ? null : waitStart(processId, elementId, owner, id);
  return start === null ? null : [start];
}

function validOccurrence(id: OccurrenceId): boolean {
  return id.processInstanceId.length > 0 && id.elementId.length > 0 &&
    Number.isSafeInteger(id.activation) && id.activation > 0;
}

function validScopeId(id: ScopeOccurrenceId): boolean {
  return id.processInstanceId.length > 0 && id.definitionScopeId.length > 0 &&
    Number.isSafeInteger(id.activation) && id.activation > 0;
}

function only<T>(values: ReadonlyArray<T>): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported lifecycle candidate operation: ${JSON.stringify(value)}`);
}
