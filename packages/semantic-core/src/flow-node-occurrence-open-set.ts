/**
 * Independent current-open projection for semantic flow-node occurrences.
 *
 * This owner validates private runtime associations against the immutable Program and emits only
 * exact long-lived occurrence identities. Boundary Timer deadlines and Process roots are validated
 * but deliberately excluded because neither is an executing BPMN flow node.
 */
import type { OccurrenceId } from "./contract.js";
import {
  ActivityBodyKind,
  ActivityHandlerKind,
  activityBodyScope,
  activityBodyTask,
  activityOccurrenceForAttachedTimer,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import { sameMessageChannel } from "./message-channel.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  calledProcessAssociationsAreValid,
} from "./semantic-process-call-runtime.js";
import {
  eventRaceAssociationsAreValid,
} from "./semantic-process-event-race-runtime.js";
import {
  effectIncidentAssociationsAreValid,
} from "./semantic-process-incident-validation.js";
import { evaluateInputMappings } from "./semantic-process-data.js";
import {
  ControlStateKind,
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeScopeOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";
import type {
  SemanticFlowNodeOccurrenceAnchor,
  SemanticFlowNodeOccurrenceAnchorKind,
  UnnumberedFlowNodeOccurrenceStart,
} from "./flow-node-occurrence-lifecycle.js";
import {
  sequentialMultiInstanceBoundaryTimerBinding,
  sequentialMultiInstanceTaskWaitMatches,
} from "./flow-node-occurrence-sequential-multi-instance.js";
import {
  parallelMultiInstanceBoundaryTimerBinding,
  parallelMultiInstanceTaskWaitMatches,
} from "./flow-node-occurrence-parallel-multi-instance-open-set.js";
import {
  LocalDataOwnerKind,
  matchesEffectLocalDataOwner,
} from "./local-data-owner.js";

const WaitAnchorKind = "wait" as SemanticFlowNodeOccurrenceAnchorKind.Wait;
const ScopeAnchorKind = "scope" as SemanticFlowNodeOccurrenceAnchorKind.Scope;
const CallAnchorKind = "callActivity" as SemanticFlowNodeOccurrenceAnchorKind.CallActivity;

export type BoundaryTimerBinding =
  | {
      operation: Extract<
        SemanticOperation,
        {
          kind:
            | SemanticOperationKind.AwaitBoundedUserTask
            | SemanticOperationKind.AwaitMonitoredUserTask;
        }
      >;
      hostId: OccurrenceId;
    }
  | {
      operation: Extract<
        SemanticOperation,
        { kind: SemanticOperationKind.EnterBoundedScope }
      >;
      child: RuntimeScopeOccurrence;
    }
  | {
      operation: Extract<
        SemanticOperation,
        { kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask }
      >;
      activeTask: OccurrenceId;
    }
  | {
      operation: Extract<
        SemanticOperation,
        { kind: SemanticOperationKind.AwaitParallelMultiInstanceUserTask }
      >;
      activeTasks: ReadonlyArray<OccurrenceId>;
    };

/** Projects every exact long-lived flow-node occurrence or fails closed. */
export function projectOpenFlowNodeOccurrences(
  program: SemanticProcessProgram,
  state: RuntimeState,
): UnnumberedFlowNodeOccurrenceStart[] | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return runtimeHasNoLiveOwners(state) ? [] : null;
  }
  if (
    !calledProcessAssociationsAreValid(state) ||
    !eventRaceAssociationsAreValid(state) ||
    !effectIncidentAssociationsAreValid(state) ||
    !effectLocalScopesAreExact(state) ||
    !scopeTreeIsExact(program, state)
  ) {
    return null;
  }

  const projected: UnnumberedFlowNodeOccurrenceStart[] = [];
  for (const wait of state.userTaskWaits) {
    if (!waitMatchesUserTask(program, state, wait)) return null;
    if (!pushWait(projected, program, state, wait.id, wait.owner)) return null;
  }
  for (const wait of state.messageWaits) {
    if (!waitMatchesMessage(program, state, wait)) return null;
    if (!pushWait(projected, program, state, wait.id, wait.owner)) return null;
  }
  for (const wait of state.timerWaits) {
    const role = timerWaitRole(program, state, wait);
    if (role === null) return null;
    if (
      role === "flowNode" &&
      !pushWait(projected, program, state, wait.id, wait.owner)
    ) {
      return null;
    }
  }
  for (const wait of state.effectWaits) {
    if (!waitMatchesEffect(program, state, wait)) return null;
    if (!pushWait(projected, program, state, wait.id, wait.owner)) return null;
  }
  for (const { wait } of state.effectIncidents) {
    if (!waitMatchesEffect(program, state, wait)) return null;
    if (!pushWait(projected, program, state, wait.id, wait.owner)) return null;
  }
  if (!projectEmbeddedScopes(projected, program, state)) return null;
  if (!projectCallActivities(projected, program, state)) return null;
  return canonicalOpenSet(projected);
}

/**
 * Resolves one private Boundary Timer deadline to its exact live host.
 *
 * Read from the Activity occurrence record that owns the deadline. The previous form scanned every
 * operation and required the host's activation ordinal to equal the Timer's, a comparison across two
 * counter families that no state asserted; because this owner feeds the publication contract, a
 * diverged pair would have misattributed a published occurrence rather than merely refused a
 * transition.
 */
export function resolveBoundaryTimerBinding(
  program: SemanticProcessProgram,
  state: RuntimeState,
  wait: RuntimeState["timerWaits"][number],
): BoundaryTimerBinding | null {
  const record = activityOccurrenceForAttachedTimer(state.activityOccurrences, wait.id);
  const operation = record === undefined ? undefined : only(
    program.operations.filter((candidate) => candidate.id === record.operationId),
  );
  if (record === undefined || operation === undefined) return null;
  // The output check distinguishes this operation's own deadline from another Timer of the same
  // element and depends on no ordinal agreement. Kinds are switched rather than filtered so each arm
  // carries the narrowed operation the binding union requires.
  switch (operation.kind) {
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask: {
      const body = activityBodyTask(record);
      const task = body === undefined ? undefined
        : only(state.userTaskWaits.filter(({ id }) => sameOccurrence(id, body)));
      return task === undefined || operation.boundaryTimer.output !== wait.output
        ? null
        : { operation, hostId: task.id };
    }
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
      return sequentialMultiInstanceBoundaryTimerBinding(state, record, operation, wait);
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return parallelMultiInstanceBoundaryTimerBinding(
        program,
        state,
        record,
        operation,
        wait,
      );
    case SemanticOperationKind.EnterBoundedScope: {
      const body = activityBodyScope(record);
      const child = body === undefined ? undefined
        : only(state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, body)));
      return child === undefined || operation.boundaryTimer.output !== wait.output
        ? null
        : { operation, child };
    }
    default:
      return null;
  }
}

/** Resolves the semantic Process containing one exact runtime scope occurrence. */
export function processIdForFlowNodeOwner(
  program: SemanticProcessProgram,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): string | null {
  if (state.control.kind === ControlStateKind.NotStarted) return null;
  let record = only(state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, owner)
  ));
  const seen = new Set<string>();
  if (record === undefined) return null;
  while (record.parent !== null) {
    if (seen.has(scopeKey(record.id))) return null;
    seen.add(scopeKey(record.id));
    const definition = only(program.definitionScopes.filter(({ id }) =>
      id === record!.id.definitionScopeId
    ));
    const parent = only(state.scopeOccurrences.filter(({ id }) =>
      sameScopeOccurrence(id, record!.parent!)
    ));
    if (
      definition === undefined ||
      parent === undefined ||
      definition.parentScopeId !== parent.id.definitionScopeId ||
      parent.id.processInstanceId !== record.id.processInstanceId
    ) {
      return null;
    }
    record = parent;
  }
  const root = only(program.definitionScopes.filter(({ id, parentScopeId }) =>
    id === record!.id.definitionScopeId && parentScopeId === null
  ));
  if (root === undefined) return null;
  if (record.id.processInstanceId === state.control.instanceId) {
    return root.originElementId === program.processId ? program.processId : null;
  }
  const call = only(state.calledProcessOccurrences.filter(({ calledRoot }) =>
    sameScopeOccurrence(calledRoot, record!.id)
  ));
  return call !== undefined && call.calledProcessId === root.originElementId
    ? call.calledProcessId
    : null;
}

function projectEmbeddedScopes(
  projected: UnnumberedFlowNodeOccurrenceStart[],
  program: SemanticProcessProgram,
  state: RuntimeState,
): boolean {
  for (const occurrence of state.scopeOccurrences) {
    if (occurrence.parent === null) continue;
    const definition = only(program.definitionScopes.filter(({ id }) =>
      id === occurrence.id.definitionScopeId
    ));
    const operation = only(program.operations.filter((candidate) =>
      (candidate.kind === SemanticOperationKind.EnterScope ||
        candidate.kind === SemanticOperationKind.EnterBoundedScope) &&
      candidate.childScopeId === occurrence.id.definitionScopeId &&
      candidate.origin.elementId === definition?.originElementId &&
      operationOwnedBy(program, candidate, occurrence.parent!)
    ));
    const processId = processIdForFlowNodeOwner(program, state, occurrence.parent);
    if (definition === undefined || operation === undefined || processId === null) {
      return false;
    }
    projected.push({
      anchor: { kind: ScopeAnchorKind, id: occurrence.id },
      processId,
      elementId: definition.originElementId,
      owner: occurrence.parent,
    });
  }
  return true;
}

function projectCallActivities(
  projected: UnnumberedFlowNodeOccurrenceStart[],
  program: SemanticProcessProgram,
  state: RuntimeState,
): boolean {
  for (const record of state.calledProcessOccurrences) {
    const operation = only(program.operations.filter((candidate) =>
      candidate.kind === SemanticOperationKind.InvokeProcess &&
      candidate.origin.elementId === record.id.elementId &&
      candidate.calledProcessId === record.calledProcessId &&
      candidate.calledRootScopeId === record.calledRoot.definitionScopeId &&
      candidate.returnOperationId === record.returnOperationId &&
      operationOwnedBy(program, candidate, record.caller)
    ));
    const processId = processIdForFlowNodeOwner(program, state, record.caller);
    if (operation === undefined || processId === null) return false;
    projected.push({
      anchor: { kind: CallAnchorKind, id: record.id },
      processId,
      elementId: record.id.elementId,
      owner: record.caller,
    });
  }
  return true;
}

function pushWait(
  projected: UnnumberedFlowNodeOccurrenceStart[],
  program: SemanticProcessProgram,
  state: RuntimeState,
  id: OccurrenceId,
  owner: ScopeOccurrenceId,
): boolean {
  const processId = processIdForFlowNodeOwner(program, state, owner);
  if (
    !validOccurrence(id) ||
    id.processInstanceId !== owner.processInstanceId ||
    processId === null
  ) {
    return false;
  }
  projected.push({
    anchor: { kind: WaitAnchorKind, id },
    processId,
    elementId: id.elementId,
    owner,
  });
  return true;
}

/**
 * Refuses an operation family this matcher has not classified.
 *
 * Deliberately exhaustive with no wildcard, matching the Lean owner: a catch-all here reads as "this
 * family declares no task wait", so a newly added wait-declaring family becomes silently invisible
 * to every public projection instead of failing to compile. That exact mechanism has recurred often
 * enough to be a recorded finding rather than an oversight.
 */
function assertNeverOperation(operation: never): never {
  throw new TypeError(
    `Unclassified semantic operation: ${JSON.stringify(operation)}`,
  );
}

function waitMatchesUserTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  wait: RuntimeState["userTaskWaits"][number],
): boolean {
  if (!ownerExists(state, wait.owner)) return false;
  return only(program.operations.filter((operation) => {
    if (!operationOwnedBy(program, operation, wait.owner)) return false;
    switch (operation.kind) {
      case SemanticOperationKind.AwaitUserTask:
        return operation.task.elementId === wait.id.elementId &&
          operation.output === wait.output &&
          operation.task.name === wait.name &&
          sameJson(operation.task.metadata, wait.metadata);
      case SemanticOperationKind.AwaitDataInputUserTask:
      case SemanticOperationKind.AwaitDataOutputUserTask:
        return operation.task.elementId === wait.id.elementId &&
          operation.output === wait.output &&
          operation.task.name === wait.name &&
          wait.metadata === undefined;
      case SemanticOperationKind.AwaitBoundedUserTask:
      case SemanticOperationKind.AwaitMonitoredUserTask:
        return operation.task.elementId === wait.id.elementId &&
          operation.task.output === wait.output &&
          operation.task.name === wait.name &&
          wait.metadata === undefined;
      case SemanticOperationKind.AwaitMessageBoundedUserTask:
        return messageBoundedRecordForTask(
          program,
          state,
          operation,
          wait.id,
        ) !== undefined;
      case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
        return sequentialMultiInstanceTaskWaitMatches(state, operation, wait);
      case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
        return parallelMultiInstanceTaskWaitMatches(
          program,
          state,
          operation,
          wait,
        );
      case SemanticOperationKind.Initiate:
      case SemanticOperationKind.InitiateMessage:
      case SemanticOperationKind.InitiateTimer:
      case SemanticOperationKind.EnterScope:
      case SemanticOperationKind.EnterBoundedScope:
      case SemanticOperationKind.InvokeProcess:
      case SemanticOperationKind.ReturnProcess:
      case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      case SemanticOperationKind.AwaitMessage:
      case SemanticOperationKind.AwaitPayloadMessage:
      case SemanticOperationKind.AwaitCorrelatedPayloadMessage:
      case SemanticOperationKind.AwaitTimer:
      case SemanticOperationKind.AwaitEffect:
      case SemanticOperationKind.AwaitEventRace:
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
        return assertNeverOperation(operation);
    }
  })) !== undefined;
}

function waitMatchesMessage(
  program: SemanticProcessProgram,
  state: RuntimeState,
  wait: RuntimeState["messageWaits"][number],
): boolean {
  if (!ownerExists(state, wait.owner)) return false;
  const ordinary = program.operations.filter((operation) =>
    (operation.kind === SemanticOperationKind.AwaitMessage ||
      operation.kind === SemanticOperationKind.AwaitPayloadMessage ||
      operation.kind === SemanticOperationKind.AwaitCorrelatedPayloadMessage) &&
    operation.message.elementId === wait.id.elementId &&
    operation.output === wait.output &&
    sameMessageChannel(operation.message.channel, wait.channel) &&
    operationOwnedBy(program, operation, wait.owner)
  );
  const raced = state.eventRaces.flatMap((record) =>
    sameOccurrence(record.messageSubscriptionId, wait.id) &&
      sameScopeOccurrence(record.owner, wait.owner)
      ? program.operations.filter((operation) =>
        operation.kind === SemanticOperationKind.AwaitEventRace &&
        operation.origin.elementId === record.id.elementId &&
        operation.message.elementId === wait.id.elementId &&
        operation.message.output === wait.output &&
        sameMessageChannel(operation.message.channel, wait.channel) &&
        operationOwnedBy(program, operation, wait.owner)
      )
      : []
  );
  const bounded = state.activityOccurrences.filter((record) =>
    record.attachedHandlers.some((handler) =>
      handler.kind === ActivityHandlerKind.Message &&
      sameOccurrence(handler.occurrence, wait.id)
    ) && messageBoundedRecordIsExact(program, state, record)
  );
  return ordinary.length + raced.length + bounded.length === 1;
}

function messageBoundedRecordForTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitMessageBoundedUserTask }
  >,
  taskId: OccurrenceId,
): ActivityOccurrence | undefined {
  return only(state.activityOccurrences.filter((record) =>
    record.body.kind === ActivityBodyKind.UserTask &&
    sameOccurrence(record.body.task, taskId) &&
    record.operationId === operation.id &&
    messageBoundedRecordIsExact(program, state, record)
  ));
}

function messageBoundedRecordIsExact(
  program: SemanticProcessProgram,
  state: RuntimeState,
  record: ActivityOccurrence,
): boolean {
  const operation = only(program.operations.filter((candidate) =>
    candidate.kind === SemanticOperationKind.AwaitMessageBoundedUserTask &&
    candidate.id === record.operationId &&
    operationOwnedBy(program, candidate, record.owner)
  ));
  const handler = record.attachedHandlers.length === 1 &&
      record.attachedHandlers[0]?.kind === ActivityHandlerKind.Message
    ? record.attachedHandlers[0]
    : undefined;
  if (
    operation?.kind !== SemanticOperationKind.AwaitMessageBoundedUserTask ||
    record.body.kind !== ActivityBodyKind.UserTask ||
    handler === undefined ||
    record.id.processInstanceId !== record.owner.processInstanceId ||
    record.id.activityElementId !== operation.task.elementId ||
    !Number.isSafeInteger(record.id.activation) ||
    record.id.activation <= 0 ||
    !ownerExists(state, record.owner)
  ) {
    return false;
  }
  const bodyTask = record.body.task;
  const task = only(state.userTaskWaits.filter((wait) =>
    sameOccurrence(wait.id, bodyTask) &&
    wait.id.elementId === operation.task.elementId &&
    wait.name === operation.task.name &&
    wait.output === operation.task.output &&
    wait.metadata === undefined &&
    sameScopeOccurrence(wait.owner, record.owner)
  ));
  const message = only(state.messageWaits.filter((wait) =>
    sameOccurrence(wait.id, handler.occurrence) &&
    wait.id.elementId === operation.boundaryMessage.elementId &&
    wait.output === operation.boundaryMessage.output &&
    sameMessageChannel(wait.channel, operation.boundaryMessage.channel) &&
    sameScopeOccurrence(wait.owner, record.owner)
  ));
  return task !== undefined && message !== undefined;
}

function timerWaitRole(
  program: SemanticProcessProgram,
  state: RuntimeState,
  wait: RuntimeState["timerWaits"][number],
): "flowNode" | "privateBoundary" | null {
  if (
    !ownerExists(state, wait.owner) ||
    !validOccurrence(wait.id) ||
    wait.id.processInstanceId !== wait.owner.processInstanceId ||
    !Number.isSafeInteger(wait.deadlineMs) ||
    wait.deadlineMs < 0
  ) {
    return null;
  }
  const ordinary = program.operations.filter((operation) =>
    operation.kind === SemanticOperationKind.AwaitTimer &&
    operation.timer.elementId === wait.id.elementId &&
    operation.output === wait.output &&
    operationOwnedBy(program, operation, wait.owner)
  );
  const raced = state.eventRaces.flatMap((record) =>
    sameOccurrence(record.timerOccurrenceId, wait.id) &&
      sameScopeOccurrence(record.owner, wait.owner)
      ? program.operations.filter((operation) =>
        operation.kind === SemanticOperationKind.AwaitEventRace &&
        operation.origin.elementId === record.id.elementId &&
        operation.timer.elementId === wait.id.elementId &&
        operation.timer.output === wait.output &&
        operationOwnedBy(program, operation, wait.owner)
      )
      : []
  );
  const boundary = resolveBoundaryTimerBinding(program, state, wait);
  const matches = ordinary.length + raced.length + (boundary === null ? 0 : 1);
  if (matches !== 1) return null;
  return boundary === null ? "flowNode" : "privateBoundary";
}

function waitMatchesEffect(
  program: SemanticProcessProgram,
  state: RuntimeState,
  wait: RuntimeState["effectWaits"][number],
): boolean {
  return ownerExists(state, wait.owner) &&
    only(program.operations.filter((operation) =>
      operation.kind === SemanticOperationKind.AwaitEffect &&
      operation.effect.elementId === wait.id.elementId &&
      operation.output === wait.output &&
      sameJson(operation.effect.descriptor, wait.descriptor) &&
      sameJson(evaluateInputMappings(operation.effect.inputMappings), wait.arguments) &&
      sameJson(operation.effect.outputMappings, wait.outputMappings) &&
      sameJson(operation.bpmnErrorRoute, wait.bpmnErrorRoute) &&
      operationOwnedBy(program, operation, wait.owner)
    )) !== undefined;
}

function effectLocalScopesAreExact(state: RuntimeState): boolean {
  const waits = [
    ...state.effectWaits,
    ...state.effectIncidents.map(({ wait }) => wait),
  ];
  const effectScopes = state.variables.activities.filter(
    ({ owner }) => owner.kind === LocalDataOwnerKind.EffectOccurrence,
  );
  return waits.every((wait, index) =>
    waits.findIndex(({ id }) => sameOccurrence(id, wait.id)) === index &&
    effectScopes.filter(({ owner }) =>
      matchesEffectLocalDataOwner(owner, wait.id)
    ).length === 1 &&
    effectScopes.some(({ owner, bindings }) =>
      matchesEffectLocalDataOwner(owner, wait.id) &&
      sameJson(bindings, wait.arguments)
    )
  ) && effectScopes.every(({ owner }) =>
    waits.filter(({ id }) => matchesEffectLocalDataOwner(owner, id)).length === 1
  );
}

function scopeTreeIsExact(
  program: SemanticProcessProgram,
  state: RuntimeState,
): boolean {
  return state.scopeOccurrences.every((record, index, records) =>
    validScopeId(record.id) &&
    records.findIndex(({ id }) => sameScopeOccurrence(id, record.id)) === index &&
    processIdForFlowNodeOwner(program, state, record.id) !== null
  );
}

function operationOwnedBy(
  program: SemanticProcessProgram,
  operation: SemanticOperation,
  owner: ScopeOccurrenceId,
): boolean {
  const bindings = program.operationScopes.filter(({ operationId }) =>
    operationId === operation.id
  );
  return bindings.length === 1 && bindings[0]?.scopeId === owner.definitionScopeId;
}

function ownerExists(state: RuntimeState, owner: ScopeOccurrenceId): boolean {
  return state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, owner)
  ).length === 1;
}

function runtimeHasNoLiveOwners(state: RuntimeState): boolean {
  return state.scopeOccurrences.length === 0 &&
    state.controlTokens.length === 0 &&
    state.userTaskWaits.length === 0 &&
    state.messageWaits.length === 0 &&
    state.timerWaits.length === 0 &&
    state.effectWaits.length === 0 &&
    state.effectIncidents.length === 0 &&
    state.selectedBranchSets.length === 0 &&
    state.eventRaces.length === 0 &&
    state.calledProcessOccurrences.length === 0 &&
    state.variables.activities.length === 0;
}

function canonicalOpenSet(
  entries: ReadonlyArray<UnnumberedFlowNodeOccurrenceStart>,
): UnnumberedFlowNodeOccurrenceStart[] | null {
  const sorted = [...entries].sort(compareStarts);
  return sorted.every(validStart) && sorted.every((entry, index) =>
    index === 0 || anchorKey(sorted[index - 1]!.anchor) !== anchorKey(entry.anchor)
  )
    ? sorted
    : null;
}

function validStart(start: UnnumberedFlowNodeOccurrenceStart): boolean {
  return start.processId.length > 0 &&
    start.elementId.length > 0 &&
    validScopeId(start.owner) &&
    validAnchor(start.anchor);
}

function validAnchor(anchor: SemanticFlowNodeOccurrenceAnchor): boolean {
  switch (anchor.kind) {
    case "wait":
    case "callActivity":
      return validOccurrence(anchor.id);
    case "scope":
      return validScopeId(anchor.id);
    case "transition":
      return false;
    default:
      return false;
  }
}

function validOccurrence(id: OccurrenceId): boolean {
  return id.processInstanceId.length > 0 &&
    id.elementId.length > 0 &&
    Number.isSafeInteger(id.activation) &&
    id.activation > 0;
}

function validScopeId(id: ScopeOccurrenceId): boolean {
  return id.processInstanceId.length > 0 &&
    id.definitionScopeId.length > 0 &&
    Number.isSafeInteger(id.activation) &&
    id.activation > 0;
}

function compareStarts(
  left: UnnumberedFlowNodeOccurrenceStart,
  right: UnnumberedFlowNodeOccurrenceStart,
): number {
  return compareAnchors(left.anchor, right.anchor) ||
    compareCanonicalStrings(left.processId, right.processId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    compareScopeIds(left.owner, right.owner);
}

function compareAnchors(
  left: SemanticFlowNodeOccurrenceAnchor,
  right: SemanticFlowNodeOccurrenceAnchor,
): number {
  const kindOrder = anchorKindOrder(left.kind) - anchorKindOrder(right.kind);
  if (kindOrder !== 0) return kindOrder;
  switch (left.kind) {
    case "wait":
    case "callActivity":
      return right.kind === left.kind ? compareOccurrenceIds(left.id, right.id) : 0;
    case "scope":
      return right.kind === left.kind ? compareScopeIds(left.id, right.id) : 0;
    case "transition":
      return right.kind === left.kind
        ? compareCanonicalStrings(left.commandId, right.commandId) ||
          left.transitionIndex - right.transitionIndex ||
          left.localIndex - right.localIndex
        : 0;
    default:
      return 0;
  }
}

function anchorKindOrder(kind: SemanticFlowNodeOccurrenceAnchor["kind"]): number {
  switch (kind) {
    case "wait": return 0;
    case "scope": return 1;
    case "callActivity": return 2;
    case "transition": return 3;
    default: return 4;
  }
}

function compareOccurrenceIds(left: OccurrenceId, right: OccurrenceId): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    left.activation - right.activation;
}

function compareScopeIds(left: ScopeOccurrenceId, right: ScopeOccurrenceId): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.definitionScopeId, right.definitionScopeId) ||
    left.activation - right.activation;
}

function anchorKey(anchor: SemanticFlowNodeOccurrenceAnchor): string {
  switch (anchor.kind) {
    case "wait":
      return JSON.stringify([0, anchor.id.processInstanceId, anchor.id.elementId, anchor.id.activation]);
    case "scope":
      return JSON.stringify([1, anchor.id.processInstanceId, anchor.id.definitionScopeId, anchor.id.activation]);
    case "callActivity":
      return JSON.stringify([2, anchor.id.processInstanceId, anchor.id.elementId, anchor.id.activation]);
    case "transition":
      return JSON.stringify([3, anchor.commandId, anchor.transitionIndex, anchor.localIndex]);
    default:
      return "";
  }
}

function scopeKey(id: ScopeOccurrenceId): string {
  return JSON.stringify([id.processInstanceId, id.definitionScopeId, id.activation]);
}

function only<T>(values: ReadonlyArray<T>): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
