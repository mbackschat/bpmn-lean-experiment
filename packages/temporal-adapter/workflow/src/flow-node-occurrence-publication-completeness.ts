/**
 * Independent E1-to-occurrence completeness relation for Workflow publication.
 *
 * The relation reconstructs the lifecycle owned by each committed Program transition. It uses the
 * private retained anchor relation for pairing, never Temporal Event History or state differences.
 */
import {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  SemanticTransitionKind,
} from "@bpmn-lean/semantic-core";
import type {
  ScopeOccurrenceId,
  SemanticFlowNodeOccurrenceAnchor,
  SemanticOperation,
  SemanticProcessProgram,
  UnnumberedFlowNodeOccurrenceDelta,
  UnnumberedFlowNodeOccurrenceStart,
} from "@bpmn-lean/semantic-core";
import type {
  CommittedTransitionRecord,
  OpenFlowNodeOccurrence,
} from "@bpmn-lean/temporal-protocol";

import {
  calledInstanceId,
  cancelledRegion,
  expectedExternalLifecycle,
  failCompleteness,
  instantOccurrence,
  lifecycleDelta,
  lifecycleEnd,
  operationOwnedBy,
  requireProcessId,
  requireUnique,
  sameAnchor,
  sameScope,
  uniqueDefinition,
} from "./flow-node-occurrence-publication-external-completeness.js";
import type {
  OpenOccurrence,
} from "./flow-node-occurrence-publication-external-completeness.js";

export type RetainedFlowNodeOccurrence = Readonly<{
  anchor: SemanticFlowNodeOccurrenceAnchor;
  occurrence: OpenFlowNodeOccurrence;
}>;

/** Requires every supplied delta to be the complete lifecycle of its exact E1 transition. */
export function requireCompleteFlowNodeOccurrenceLifecycles(
  program: SemanticProcessProgram,
  retained: readonly RetainedFlowNodeOccurrence[],
  commandId: string,
  transitions: readonly CommittedTransitionRecord[],
  supplied: readonly UnnumberedFlowNodeOccurrenceDelta[],
): void {
  const open = retained.map(({ anchor, occurrence }) => ({
    anchor,
    processId: occurrence.processId,
    elementId: occurrence.elementId,
    owner: occurrence.owner,
  }));
  if (transitions.length !== supplied.length) failCompleteness();
  for (let index = 0; index < transitions.length; index += 1) {
    const record = transitions[index];
    const candidate = supplied[index];
    if (record === undefined || candidate === undefined) failCompleteness();
    const expected = expectedDelta(
      program,
      open,
      record,
      candidate,
      commandId,
      index,
    );
    if (!sameJson(expected, candidate)) failCompleteness();
    applyCompleteDelta(open, expected);
  }
}

function expectedDelta(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  record: CommittedTransitionRecord,
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  commandId: string,
  transitionIndex: number,
): UnnumberedFlowNodeOccurrenceDelta {
  switch (record.transition.kind) {
    case SemanticTransitionKind.ExternalStimulus:
      return expectedExternalLifecycle(
        program,
        open,
        record.transition.stimulus,
        commandId,
        transitionIndex,
      );
    case SemanticTransitionKind.InternalOperation: {
      const operation = requireOperation(program, record.transition);
      return internalDelta(
        program,
        open,
        operation,
        record.transition.owner,
        supplied,
        commandId,
        transitionIndex,
      );
    }
    default:
      return failCompleteness();
  }
}

function internalDelta(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  operation: SemanticOperation,
  owner: ScopeOccurrenceId,
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  commandId: string,
  transitionIndex: number,
): UnnumberedFlowNodeOccurrenceDelta {
  const processId = requireProcessId(program, owner);
  const operationInstant = instantOccurrence(
    processId,
    operation.origin.elementId,
    owner,
  );
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
      return lifecycleDelta([], [], [operationInstant], commandId, transitionIndex);
    case SemanticOperationKind.AwaitUserTask:
      return lifecycleDelta([
        requireWaitStart(supplied, processId, operation.task.elementId, owner),
      ]);
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
      return lifecycleDelta([
        requireWaitStart(supplied, processId, operation.task.elementId, owner),
      ]);
    case SemanticOperationKind.AwaitMessage:
      return lifecycleDelta([
        requireWaitStart(supplied, processId, operation.message.elementId, owner),
      ]);
    case SemanticOperationKind.AwaitTimer:
      return lifecycleDelta([
        requireWaitStart(supplied, processId, operation.timer.elementId, owner),
      ]);
    case SemanticOperationKind.AwaitEffect:
      return lifecycleDelta([
        requireWaitStart(supplied, processId, operation.effect.elementId, owner),
      ]);
    case SemanticOperationKind.AwaitEventRace:
      return lifecycleDelta([
        requireWaitStart(supplied, processId, operation.message.elementId, owner),
        requireWaitStart(supplied, processId, operation.timer.elementId, owner),
      ], [], [operationInstant], commandId, transitionIndex);
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.EnterBoundedScope:
      return lifecycleDelta([
        requireScopeStart(
          supplied,
          processId,
          operation.origin.elementId,
          owner,
          operation.childScopeId,
        ),
      ]);
    case SemanticOperationKind.InvokeProcess:
      return lifecycleDelta([
        requireCallStart(supplied, processId, operation.origin.elementId, owner),
      ]);
    case SemanticOperationKind.ReturnProcess: {
      const call = requireReturningCall(program, open, operation, owner);
      return lifecycleDelta([], [
        lifecycleEnd(call, FlowNodeOccurrenceTerminalKind.Completed),
      ]);
    }
    case SemanticOperationKind.CompleteScope: {
      const definition = uniqueDefinition(program, operation.scopeId);
      if (definition === null) failCompleteness();
      if (definition.parentScopeId === null) return lifecycleDelta();
      const scope = requireAnchor(open, {
        kind: SemanticFlowNodeOccurrenceAnchorKind.Scope,
        id: owner,
      });
      return lifecycleDelta([], [
        lifecycleEnd(scope, FlowNodeOccurrenceTerminalKind.Completed),
      ]);
    }
    case SemanticOperationKind.ThrowError: {
      const scope = requireAnchor(open, {
        kind: SemanticFlowNodeOccurrenceAnchorKind.Scope,
        id: owner,
      });
      return lifecycleDelta(
        [],
        cancelledRegion(open, owner, false),
        [
          operationInstant,
          instantOccurrence(
            requireProcessId(program, scope.owner),
            operation.handler.origin.boundaryEventId,
            scope.owner,
          ),
        ],
        commandId,
        transitionIndex,
      );
    }
    case SemanticOperationKind.TerminateScope:
      return lifecycleDelta(
        [],
        cancelledRegion(open, owner, true),
        [operationInstant],
        commandId,
        transitionIndex,
      );
    default:
      return assertNever(operation);
  }
}

function requireOperation(
  program: SemanticProcessProgram,
  transition: Extract<
    CommittedTransitionRecord["transition"],
    { kind: SemanticTransitionKind.InternalOperation }
  >,
): SemanticOperation {
  const selected = program.operations.filter((operation) =>
    operation.id === transition.operationId &&
    operation.kind === transition.operationKind &&
    sameJson(operation.origin, transition.origin) &&
    operationOwnedBy(program, operation, transition.owner));
  return requireUnique(selected);
}

function requireWaitStart(
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  processId: string,
  elementId: string,
  owner: ScopeOccurrenceId,
): UnnumberedFlowNodeOccurrenceStart {
  return requireUnique(supplied.started.filter((start) =>
    start.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
    start.anchor.id.processInstanceId === owner.processInstanceId &&
    start.anchor.id.elementId === elementId &&
    safePositive(start.anchor.id.activation) &&
    start.processId === processId &&
    start.elementId === elementId &&
    sameScope(start.owner, owner)));
}

function requireScopeStart(
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  processId: string,
  elementId: string,
  owner: ScopeOccurrenceId,
  childScopeId: string,
): UnnumberedFlowNodeOccurrenceStart {
  return requireUnique(supplied.started.filter((start) =>
    start.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope &&
    start.anchor.id.processInstanceId === owner.processInstanceId &&
    start.anchor.id.definitionScopeId === childScopeId &&
    safePositive(start.anchor.id.activation) &&
    start.processId === processId &&
    start.elementId === elementId &&
    sameScope(start.owner, owner)));
}

function requireCallStart(
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  processId: string,
  elementId: string,
  owner: ScopeOccurrenceId,
): UnnumberedFlowNodeOccurrenceStart {
  return requireUnique(supplied.started.filter((start) =>
    start.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CallActivity &&
    start.anchor.id.processInstanceId === owner.processInstanceId &&
    start.anchor.id.elementId === elementId &&
    safePositive(start.anchor.id.activation) &&
    start.processId === processId &&
    start.elementId === elementId &&
    sameScope(start.owner, owner)));
}

function requireReturningCall(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.ReturnProcess }>,
  calledOwner: ScopeOccurrenceId,
): OpenOccurrence {
  const invokes = program.operations.filter((candidate): candidate is Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.InvokeProcess }
  > => candidate.kind === SemanticOperationKind.InvokeProcess &&
    candidate.returnOperationId === operation.id &&
    candidate.calledProcessId === operation.calledProcessId &&
    candidate.calledRootScopeId === operation.calledRootScopeId);
  if (invokes.length !== 1) failCompleteness();
  const invoke = invokes[0]!;
  return requireUnique(open.filter((entry) =>
    entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CallActivity &&
    entry.elementId === invoke.origin.elementId &&
    calledOwner.definitionScopeId === invoke.calledRootScopeId &&
    calledOwner.activation === 1 &&
    calledOwner.processInstanceId === calledInstanceId(entry.anchor.id)));
}

function applyCompleteDelta(
  open: OpenOccurrence[],
  lifecycle: UnnumberedFlowNodeOccurrenceDelta,
): void {
  for (const start of lifecycle.started) {
    if (open.some(({ anchor }) => sameAnchor(anchor, start.anchor))) {
      failCompleteness();
    }
    open.push(start);
  }
  for (const terminal of lifecycle.ended) {
    const matches = open.flatMap((entry, index) =>
      sameAnchor(entry.anchor, terminal.anchor) ? [index] : []);
    if (matches.length !== 1) failCompleteness();
    open.splice(matches[0]!, 1);
  }
}

function requireAnchor(
  open: readonly OpenOccurrence[],
  anchor: SemanticFlowNodeOccurrenceAnchor,
): OpenOccurrence {
  return requireUnique(open.filter((entry) => sameAnchor(entry.anchor, anchor)));
}

function safePositive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported internal occurrence completeness variant: ${String(value)}`);
}
