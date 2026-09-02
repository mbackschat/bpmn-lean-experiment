/**
 * Independent E1-to-occurrence completeness relation for semantic publication.
 *
 * The relation reconstructs the lifecycle owned by each committed Program transition. It uses the
 * private retained anchor relation for pairing, never Temporal Event History or state differences.
 *
 * "Independent" is narrower than it was. Pairing a boundary deadline to its host now reads the handler
 * list the producer's accumulator retained from the Activity occurrence record, so for that one
 * derivation this relation and its producer share a mechanism and cannot fail apart. The exchange was
 * deliberate: the activation-ordinal reconstruction it replaced was independent and became wrong under
 * body turnover, refusing a correct publication. Reconstruction of the lifecycle itself is unchanged.
 */
import type { DeepReadonly } from "./deep-readonly.js";
import { ActivityHandlerKind } from "./activity-occurrence.js";
import type { ActivityHandlerOccurrence } from "./activity-occurrence.js";
import {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
} from "./flow-node-occurrence-lifecycle.js";
import type {
  SemanticFlowNodeOccurrenceAnchor,
  UnnumberedFlowNodeOccurrenceDelta,
  UnnumberedFlowNodeOccurrenceStart,
} from "./flow-node-occurrence-lifecycle.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";
import { stimulusCommandId } from "./stimulus.js";
import { SemanticTransitionKind } from "./semantic-transition-trace.js";
import type {
  UnnumberedCommittedTransitionRecord,
} from "./semantic-transition-trace.js";

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

export type RetainedFlowNodeOccurrence = DeepReadonly<{
  anchor: SemanticFlowNodeOccurrenceAnchor;
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
  /** The handler occurrences the Activity occurrence record listed when this body opened. */
  attachedHandlers: ActivityHandlerOccurrence[];
}>;

/** Requires every supplied delta to be the complete lifecycle of its exact E1 transition. */
export function requireCompleteFlowNodeOccurrenceLifecycles(
  program: SemanticProcessProgram,
  retained: readonly RetainedFlowNodeOccurrence[],
  commandId: string,
  transitions: readonly UnnumberedCommittedTransitionRecord[],
  supplied: readonly UnnumberedFlowNodeOccurrenceDelta[],
): void {
  const open = retained.map(({ anchor, processId, elementId, owner, attachedHandlers }) => ({
    anchor,
    processId,
    elementId,
    owner,
    attachedHandlers,
  }));
  const first = transitions[0];
  if (!retainedOpenSetIsExact(program, open)) {
    throw new TypeError("flow-node occurrence accumulator continuity drifted");
  }
  if (
    first === undefined ||
    first.transition.kind !== SemanticTransitionKind.ExternalStimulus ||
    stimulusCommandId(first.transition.stimulus) !== commandId ||
    transitions.slice(1).some(({ transition }) =>
      transition.kind !== SemanticTransitionKind.InternalOperation) ||
    transitions.length !== supplied.length
  ) failCompleteness();
  for (let index = 0; index < transitions.length; index += 1) {
    const record = transitions[index];
    const candidate = supplied[index];
    if (record === undefined || candidate === undefined) failCompleteness();
    if (candidate.ended.some(({ anchor }) =>
      !open.some((entry) => sameAnchor(entry.anchor, anchor)) &&
      !candidate.started.some((start) => sameAnchor(start.anchor, anchor)))) {
      throw new TypeError("semantic flow-node lifecycle ended an unknown anchor");
    }
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
  record: UnnumberedCommittedTransitionRecord,
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
        supplied,
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
    case SemanticOperationKind.AwaitDataInputUserTask:
    case SemanticOperationKind.AwaitDataOutputUserTask:
      return lifecycleDelta([
        requireWaitStart(supplied, processId, operation.task.elementId, owner),
      ]);
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
      return lifecycleDelta(optionalWaitStart(
        supplied,
        processId,
        operation.task.elementId,
        owner,
      ));
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return lifecycleDelta(parallelWaitStarts(
        supplied,
        processId,
        operation.task.elementId,
        owner,
      ));
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      return failCompleteness();
    case SemanticOperationKind.TriggerCompensation:
      return failCompleteness();
    case SemanticOperationKind.AwaitMessageBoundedUserTask:
      return lifecycleDelta([
        requireWaitStart(supplied, processId, operation.task.elementId, owner),
        requireWaitStart(
          supplied,
          processId,
          operation.boundaryMessage.elementId,
          owner,
        ),
      ]);
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
      return lifecycleDelta([
        requireWaitStart(supplied, processId, operation.task.elementId, owner),
      ]);
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitPayloadMessage:
    case SemanticOperationKind.AwaitCorrelatedPayloadMessage:
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
    UnnumberedCommittedTransitionRecord["transition"],
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
  return requireUnique(matchingWaitStarts(
    supplied,
    processId,
    elementId,
    owner,
  ));
}

/** The zero-or-one generated inner wait the SMI entry producer may publish. */
function optionalWaitStart(
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  processId: string,
  elementId: string,
  owner: ScopeOccurrenceId,
): UnnumberedFlowNodeOccurrenceStart[] {
  const starts = matchingWaitStarts(supplied, processId, elementId, owner);
  if (starts.length > 1) failCompleteness();
  return starts;
}

/** Every inner wait from one atomic parallel entry, in minted activation order. */
function parallelWaitStarts(
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  processId: string,
  elementId: string,
  owner: ScopeOccurrenceId,
): UnnumberedFlowNodeOccurrenceStart[] {
  const starts = matchingWaitStarts(supplied, processId, elementId, owner);
  const activations = starts.map((start) =>
    start.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait
      ? start.anchor.id.activation
      : 0
  );
  if (
    starts.length !== supplied.started.length ||
    activations.some((activation, index) =>
      index > 0 && activation <= (activations[index - 1] ?? 0)
    )
  ) {
    failCompleteness();
  }
  return starts;
}

function matchingWaitStarts(
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  processId: string,
  elementId: string,
  owner: ScopeOccurrenceId,
): UnnumberedFlowNodeOccurrenceStart[] {
  return supplied.started.filter((start) =>
    start.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
    start.anchor.id.processInstanceId === owner.processInstanceId &&
    start.anchor.id.elementId === elementId &&
    safePositive(start.anchor.id.activation) &&
    start.processId === processId &&
    start.elementId === elementId &&
    sameScope(start.owner, owner));
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
    // No attached handlers on an occurrence this command opened. A boundary Timer firing is an
    // external stimulus and therefore the first transition of its own command, so an occurrence
    // opened here cannot be the host of a deadline that fires here. The retained set carries the
    // anchor for every host that can be.
    open.push({ ...start, attachedHandlers: [] });
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

function retainedOpenSetIsExact(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
): boolean {
  return open.every((entry, index) =>
    open.findIndex((candidate) => sameAnchor(candidate.anchor, entry.anchor)) === index &&
    retainedAnchorMatchesOccurrence(program, entry)
  ) && retainedMessageBoundaryPairsAreExact(program, open);
}

function retainedMessageBoundaryPairsAreExact(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
): boolean {
  const operations = program.operations.filter((operation) =>
    operation.kind === SemanticOperationKind.AwaitMessageBoundedUserTask
  );
  const pairs = operations.flatMap((operation) =>
    open.flatMap((host) => {
      if (
        host.anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Wait ||
        host.elementId !== operation.task.elementId ||
        !operationOwnedBy(program, operation, host.owner)
      ) return [];
      const handler = host.attachedHandlers.length === 1 &&
          host.attachedHandlers[0]?.kind === ActivityHandlerKind.Message
        ? host.attachedHandlers[0]
        : undefined;
      if (handler === undefined) return [];
      return open.filter((message) =>
        message.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
        sameAnchor(message.anchor, {
          kind: SemanticFlowNodeOccurrenceAnchorKind.Wait,
          id: handler.occurrence,
        }) &&
        message.elementId === operation.boundaryMessage.elementId &&
        message.processId === host.processId &&
        sameScope(message.owner, host.owner)
      ).map((message) => ({ host, message }));
    })
  );
  const bounded = open.filter((entry) => operations.some((operation) =>
    operationOwnedBy(program, operation, entry.owner) &&
    (entry.elementId === operation.task.elementId ||
      entry.elementId === operation.boundaryMessage.elementId)
  ));
  return bounded.every((entry) => pairs.filter(({ host, message }) =>
    host === entry || message === entry
  ).length === 1) && open.every((entry) =>
    !entry.attachedHandlers.some(({ kind }) =>
      kind === ActivityHandlerKind.Message
    ) ||
    pairs.filter(({ host }) => host === entry).length === 1
  );
}

function retainedAnchorMatchesOccurrence(
  program: SemanticProcessProgram,
  entry: OpenOccurrence,
): boolean {
  const { anchor, processId, elementId, owner } = entry;
  if (
    requireProcessId(program, owner) !== processId ||
    !safePositive(owner.activation)
  ) return false;
  switch (anchor.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
    case SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler:
      return anchor.id.processInstanceId === owner.processInstanceId &&
        anchor.id.elementId === elementId && safePositive(anchor.id.activation);
    case SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger: {
      const trigger = program.operations.filter((operation) =>
        operation.kind === SemanticOperationKind.TriggerCompensation &&
        operation.id === anchor.id.elementId &&
        operation.origin.elementId === elementId
      );
      return trigger.length === 1 &&
        anchor.id.processInstanceId === owner.processInstanceId &&
        safePositive(anchor.id.activation);
    }
    case SemanticFlowNodeOccurrenceAnchorKind.Scope: {
      const definition = uniqueDefinition(program, anchor.id.definitionScopeId);
      return definition !== null &&
        anchor.id.processInstanceId === owner.processInstanceId &&
        definition.originElementId === elementId &&
        definition.parentScopeId === owner.definitionScopeId &&
        safePositive(anchor.id.activation);
    }
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return false;
    default:
      return assertNever(anchor);
  }
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
