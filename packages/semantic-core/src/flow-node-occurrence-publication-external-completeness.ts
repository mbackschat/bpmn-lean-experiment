/** External-stimulus and cancellation side of the semantic occurrence completeness relation. */
import {
  EffectExecutionResultKind,
  StimulusKind,
} from "./contract.js";
import type {
  OccurrenceId,
} from "./contract.js";
import {
  ActivityHandlerKind,
  sameOccurrenceId,
} from "./activity-occurrence.js";
import type { ActivityHandlerOccurrence } from "./activity-occurrence.js";
import {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
} from "./flow-node-occurrence-lifecycle.js";
import type {
  SemanticFlowNodeOccurrenceAnchor,
  UnnumberedFlowNodeOccurrenceDelta,
  UnnumberedFlowNodeOccurrenceEnd,
  UnnumberedFlowNodeOccurrenceStart,
} from "./flow-node-occurrence-lifecycle.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitMessageBoundedUserTaskOperation,
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { sameMessageChannel } from "./message-channel.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";
import type { UnnumberedCommittedTransitionRecord } from "./semantic-transition-trace.js";
import { compareCanonicalStrings } from "./wire.js";
import {
  parallelMultiInstanceBoundaryHosts,
  parallelMultiInstanceCompletionEnds,
} from "./flow-node-occurrence-parallel-multi-instance-publication.js";

/**
 * One open flow-node occurrence as this relation sees it.
 *
 * `attachedHandlers` is the retained half of the Activity occurrence record: the handler occurrences the
 * record listed at the moment this body opened. It exists because the alternative is an ordinal join.
 * Pairing a boundary Timer to its host by activation equality holds only while an Activity is armed
 * once per body, and body turnover is exactly the state where that fails: the host advances and the
 * deadline does not, so the ordinal join returns no pair and this relation rejects a correct
 * publication.
 *
 * Retaining it costs this relation part of its independence, and that cost is accepted rather than
 * hidden: the pairing originates in the producer's record, so a producer that mispairs is no longer
 * contradicted here. The pairing cannot instead ride the published delta, because that would change a
 * wire schema, and it cannot be recomputed from semantic state, because no pre-state reaches this
 * boundary. Empty for every occurrence that no record lists.
 */
export type OpenOccurrence = Readonly<{
  anchor: SemanticFlowNodeOccurrenceAnchor;
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
  attachedHandlers: readonly ActivityHandlerOccurrence[];
}>;

export function expectedExternalLifecycle(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  stimulus: Extract<
    UnnumberedCommittedTransitionRecord["transition"],
    { kind: "externalStimulus" }
  >["stimulus"],
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  commandId: string,
  transitionIndex: number,
): UnnumberedFlowNodeOccurrenceDelta {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
    case StimulusKind.ReportEffectFailure:
    case StimulusKind.RetryIncident:
      return lifecycleDelta();
    case StimulusKind.CompleteUserTaskInstance: {
      const completed = requireWait(open, stimulus.taskId);
      const bounded = messageBoundaryPair(
        program,
        open,
        completed,
        "task",
      );
      if (bounded !== null) {
        if (stimulus.submittedValues.length !== 0) failCompleteness();
        return lifecycleDelta([], [
          lifecycleEnd(bounded.host, FlowNodeOccurrenceTerminalKind.Completed),
          lifecycleEnd(bounded.message, FlowNodeOccurrenceTerminalKind.Cancelled),
        ]);
      }
      const operation = multiInstanceOperationForWait(
        program,
        completed,
      );
      if (operation === null) {
        return lifecycleDelta([], [lifecycleEnd(
          completed,
          FlowNodeOccurrenceTerminalKind.Completed,
        )]);
      }
      return operation.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
        ? lifecycleDelta(
            optionalSequentialSuccessor(supplied, completed, operation),
            [lifecycleEnd(completed, FlowNodeOccurrenceTerminalKind.Completed)],
          )
        : lifecycleDelta([], requireParallelCompletionEnds(
            open,
            supplied,
            completed,
          ));
    }
    case StimulusKind.DeliverMessage: {
      const message = requireWait(open, stimulus.subscriptionId);
      const bounded = messageBoundaryPair(
        program,
        open,
        message,
        "message",
      );
      if (bounded !== null) {
        if (!sameMessageChannel(
          bounded.operation.boundaryMessage.channel,
          stimulus.channel,
        )) failCompleteness();
        return lifecycleDelta(
          [],
          [
            lifecycleEnd(bounded.host, FlowNodeOccurrenceTerminalKind.Cancelled),
            lifecycleEnd(bounded.message, FlowNodeOccurrenceTerminalKind.Completed),
          ],
          [instantOccurrence(
            bounded.host.processId,
            bounded.operation.boundaryMessage.elementId,
            bounded.host.owner,
          )],
          commandId,
          transitionIndex,
        );
      }
      const pair = eventRacePair(program, open, message, "message");
      return pair === null
        ? lifecycleDelta([], [lifecycleEnd(message, FlowNodeOccurrenceTerminalKind.Completed)])
        : lifecycleDelta([], [
            lifecycleEnd(message, FlowNodeOccurrenceTerminalKind.Completed),
            lifecycleEnd(pair, FlowNodeOccurrenceTerminalKind.Cancelled),
          ]);
    }
    case StimulusKind.DeliverPayloadMessage: {
      const message = requireWait(open, stimulus.subscriptionId);
      return lifecycleDelta([], [
        lifecycleEnd(message, FlowNodeOccurrenceTerminalKind.Completed),
      ]);
    }
    case StimulusKind.DeliverCorrelatedPayloadMessage: {
      const message = requireWait(open, stimulus.subscriptionId);
      return lifecycleDelta([], [
        lifecycleEnd(message, FlowNodeOccurrenceTerminalKind.Completed),
      ]);
    }
    case StimulusKind.FireTimer: {
      const timer = findWait(open, stimulus.timerId);
      if (timer !== null) {
        const pair = eventRacePair(program, open, timer, "timer");
        return pair === null
          ? lifecycleDelta([], [lifecycleEnd(timer, FlowNodeOccurrenceTerminalKind.Completed)])
          : lifecycleDelta([], [
              lifecycleEnd(pair, FlowNodeOccurrenceTerminalKind.Cancelled),
              lifecycleEnd(timer, FlowNodeOccurrenceTerminalKind.Completed),
            ]);
      }
      return boundaryTimerLifecycle(
        program,
        open,
        stimulus.timerId,
        commandId,
        transitionIndex,
      );
    }
    case StimulusKind.CompleteEffect: {
      const effect = requireWait(open, stimulus.effectId);
      if (stimulus.result.kind === EffectExecutionResultKind.Success) {
        return lifecycleDelta([], [lifecycleEnd(
          effect,
          FlowNodeOccurrenceTerminalKind.Completed,
        )]);
      }
      const operation = uniqueOperationForElement(
        program,
        SemanticOperationKind.AwaitEffect,
        stimulus.effectId.elementId,
        effect.owner.definitionScopeId,
      );
      if (operation === null || operation.bpmnErrorRoute === null) {
        failCompleteness();
      }
      return lifecycleDelta([], [
        lifecycleEnd(effect, FlowNodeOccurrenceTerminalKind.Cancelled),
      ], [
        instantOccurrence(
          requireProcessId(program, effect.owner),
          operation.bpmnErrorRoute.origin.boundaryEventId,
          effect.owner,
        ),
      ], commandId, transitionIndex);
    }
    case StimulusKind.CancelIncidentProcess:
      return lifecycleDelta([], open.map((entry) =>
        lifecycleEnd(entry, FlowNodeOccurrenceTerminalKind.Cancelled)));
    default:
      return assertNever(stimulus);
  }
}

type MessageBoundaryPair = Readonly<{
  operation: AwaitMessageBoundedUserTaskOperation;
  host: OpenOccurrence;
  message: OpenOccurrence;
}>;

function messageBoundaryPair(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  selected: OpenOccurrence,
  role: "task" | "message",
): MessageBoundaryPair | null {
  const operations = program.operations.filter(
    (operation): operation is AwaitMessageBoundedUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitMessageBoundedUserTask &&
      operationOwnedBy(program, operation, selected.owner) &&
      (role === "task"
        ? operation.task.elementId === selected.elementId
        : operation.boundaryMessage.elementId === selected.elementId),
  );
  if (operations.length > 1) failCompleteness();
  const operation = operations[0];
  if (operation === undefined) return null;
  const host = role === "task"
    ? selected
    : requireUnique(open.filter((entry) =>
        entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
        entry.elementId === operation.task.elementId &&
        entry.processId === selected.processId &&
        sameScope(entry.owner, selected.owner) &&
        listsMessage(entry, selected.anchor)
      ));
  if (host.anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Wait) {
    failCompleteness();
  }
  const handler = host.attachedHandlers.length === 1 &&
      host.attachedHandlers[0]?.kind === ActivityHandlerKind.Message
    ? host.attachedHandlers[0]
    : undefined;
  if (handler === undefined) failCompleteness();
  const message = role === "message"
    ? selected
    : requireUnique(open.filter((entry) =>
        entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
        entry.elementId === operation.boundaryMessage.elementId &&
        entry.processId === host.processId &&
        sameScope(entry.owner, host.owner) &&
        sameOccurrenceAnchor(entry.anchor, handler.occurrence)
      ));
  if (
    message.anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Wait ||
    !sameOccurrenceAnchor(message.anchor, handler.occurrence) ||
    host.elementId !== operation.task.elementId ||
    message.elementId !== operation.boundaryMessage.elementId ||
    host.processId !== message.processId ||
    !sameScope(host.owner, message.owner)
  ) failCompleteness();
  return { operation, host, message };
}

function listsMessage(
  host: OpenOccurrence,
  message: SemanticFlowNodeOccurrenceAnchor,
): boolean {
  return message.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
    host.attachedHandlers.length === 1 &&
    host.attachedHandlers[0]?.kind === ActivityHandlerKind.Message &&
    sameOccurrenceAnchor(message, host.attachedHandlers[0].occurrence);
}

function sameOccurrenceAnchor(
  anchor: SemanticFlowNodeOccurrenceAnchor,
  id: OccurrenceId,
): boolean {
  return anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
    sameOccurrenceId(anchor.id, id);
}

/**
 * Whether this open occurrence's record listed the firing deadline as its own handler.
 *
 * The predicate that replaces an activation-ordinal comparison across two counter families. The
 * ordinal held only while an Activity was armed once per body; under body turnover the host advances
 * and its deadline does not, so the ordinal matched nothing and this relation refused a correct
 * publication. Reading the retained list pairs them by ownership instead, which is what the Activity
 * occurrence record was introduced to express.
 */
function listsTimer(entry: OpenOccurrence, timerId: OccurrenceId): boolean {
  return entry.attachedHandlers.some((attached) =>
    attached.kind === ActivityHandlerKind.Timer &&
    attached.occurrence.processInstanceId === timerId.processInstanceId &&
    attached.occurrence.elementId === timerId.elementId &&
    attached.occurrence.activation === timerId.activation);
}

function boundaryTimerLifecycle(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  timerId: OccurrenceId,
  commandId: string,
  transitionIndex: number,
): UnnumberedFlowNodeOccurrenceDelta {
  const operations = program.operations.filter((operation) =>
    (operation.kind === SemanticOperationKind.AwaitBoundedUserTask ||
      operation.kind === SemanticOperationKind.AwaitMonitoredUserTask ||
      operation.kind ===
        SemanticOperationKind.AwaitSequentialMultiInstanceUserTask ||
      operation.kind ===
        SemanticOperationKind.AwaitParallelMultiInstanceUserTask ||
      operation.kind === SemanticOperationKind.EnterBoundedScope) &&
    operation.boundaryTimer.elementId === timerId.elementId);
  if (operations.length !== 1) failCompleteness();
  const operation = operations[0]!;
  switch (operation.kind) {
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask: {
      const host = requireUnique(open.filter((entry) =>
        entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
        entry.anchor.id.processInstanceId === timerId.processInstanceId &&
        entry.anchor.id.elementId === operation.task.elementId &&
        listsTimer(entry, timerId) &&
        operationOwnedBy(program, operation, entry.owner)));
      return lifecycleDelta(
        [],
        operation.kind === SemanticOperationKind.AwaitMonitoredUserTask
          ? []
          : [lifecycleEnd(host, FlowNodeOccurrenceTerminalKind.Cancelled)],
        [instantOccurrence(host.processId, timerId.elementId, host.owner)],
        commandId,
        transitionIndex,
      );
    }
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask: {
      const hosts = parallelMultiInstanceBoundaryHosts(
        program,
        open,
        operation,
        timerId,
      );
      if (hosts === null) failCompleteness();
      const host = hosts[0]!;
      return lifecycleDelta(
        [],
        hosts.map((entry) => lifecycleEnd(
          entry,
          FlowNodeOccurrenceTerminalKind.Cancelled,
        )),
        [instantOccurrence(host.processId, timerId.elementId, host.owner)],
        commandId,
        transitionIndex,
      );
    }
    case SemanticOperationKind.EnterBoundedScope: {
      const child = requireUnique(open.filter((entry) =>
        entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope &&
        entry.anchor.id.processInstanceId === timerId.processInstanceId &&
        entry.anchor.id.definitionScopeId === operation.childScopeId &&
        listsTimer(entry, timerId) &&
        operationOwnedBy(program, operation, entry.owner)));
      if (child.anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Scope) {
        failCompleteness();
      }
      return lifecycleDelta(
        [],
        cancelledRegion(open, child.anchor.id, false),
        [instantOccurrence(child.processId, timerId.elementId, child.owner)],
        commandId,
        transitionIndex,
      );
    }
    default:
      return failCompleteness();
  }
}

/** Finds the MI operation from the retained wait and Program, independently of private controllers. */
function multiInstanceOperationForWait(
  program: SemanticProcessProgram,
  wait: OpenOccurrence,
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
  > => (operation.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask ||
      operation.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask) &&
    operation.task.elementId === wait.elementId &&
    wait.processId === requireProcessId(program, wait.owner) &&
    operationOwnedBy(program, operation, wait.owner));
  if (matches.length > 1) failCompleteness();
  return matches[0] ?? null;
}

function requireParallelCompletionEnds(
  open: readonly OpenOccurrence[],
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  completed: OpenOccurrence,
): UnnumberedFlowNodeOccurrenceEnd[] {
  const ends = parallelMultiInstanceCompletionEnds(open, supplied, completed);
  return ends ?? failCompleteness();
}

/**
 * The optional next generated task in a non-final SMI completion.
 *
 * Completeness admits the two reviewed shapes. The independent batch fold/current-open equality
 * decides which shape the committed successor state requires; this function neither reconstructs
 * RuntimeState nor calls the open-set projection. A reused identity is not a successor.
 */
function optionalSequentialSuccessor(
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  completed: OpenOccurrence,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask }
  >,
): UnnumberedFlowNodeOccurrenceStart[] {
  const matches = supplied.started.filter((start) =>
    start.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
    !sameAnchor(start.anchor, completed.anchor) &&
    start.anchor.id.processInstanceId === completed.owner.processInstanceId &&
    start.anchor.id.elementId === operation.task.elementId &&
    Number.isSafeInteger(start.anchor.id.activation) &&
    start.anchor.id.activation > 0 &&
    start.processId === completed.processId &&
    start.elementId === operation.task.elementId &&
    sameScope(start.owner, completed.owner));
  if (matches.length > 1) failCompleteness();
  return matches;
}

export function lifecycleDelta(
  starts: readonly UnnumberedFlowNodeOccurrenceStart[] = [],
  ends: readonly UnnumberedFlowNodeOccurrenceEnd[] = [],
  instants: readonly Omit<UnnumberedFlowNodeOccurrenceStart, "anchor">[] = [],
  commandId = "",
  transitionIndex = 0,
): UnnumberedFlowNodeOccurrenceDelta {
  const instantaneous = [...instants].sort(compareInstant).map((entry, localIndex) => ({
    ...entry,
    anchor: {
      kind: SemanticFlowNodeOccurrenceAnchorKind.Transition,
      commandId,
      transitionIndex,
      localIndex,
    } as const,
  }));
  return {
    started: [...starts, ...instantaneous].sort(compareStarts),
    ended: [
      ...ends,
      ...instantaneous.map(({ anchor }) => ({
        anchor,
        terminal: FlowNodeOccurrenceTerminalKind.Completed,
      })),
    ].sort(compareEnds),
  };
}

export function cancelledRegion(
  open: readonly OpenOccurrence[],
  root: ScopeOccurrenceId,
  retainRoot: boolean,
): UnnumberedFlowNodeOccurrenceEnd[] {
  const removedScopes = new Set([scopeKey(root)]);
  const removedInstances = new Set<string>();
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const entry of open) {
      if (entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope &&
        ownerIsRemoved(entry.owner, removedScopes, removedInstances) &&
        !removedScopes.has(scopeKey(entry.anchor.id))) {
        removedScopes.add(scopeKey(entry.anchor.id));
        expanded = true;
      }
      if (entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CallActivity &&
        ownerIsRemoved(entry.owner, removedScopes, removedInstances)) {
        const called = calledInstanceId(entry.anchor.id);
        if (!removedInstances.has(called)) {
          removedInstances.add(called);
          expanded = true;
        }
      }
    }
  }
  return open.filter((entry) => {
    if (entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope) {
      return removedScopes.has(scopeKey(entry.anchor.id)) &&
        !(retainRoot && sameScope(entry.anchor.id, root));
    }
    return ownerIsRemoved(entry.owner, removedScopes, removedInstances);
  }).map((entry) => lifecycleEnd(entry, FlowNodeOccurrenceTerminalKind.Cancelled));
}

function eventRacePair(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  selected: OpenOccurrence,
  selectedArm: "message" | "timer",
): OpenOccurrence | null {
  const candidates = program.operations.flatMap((operation) => {
    if (
      operation.kind !== SemanticOperationKind.AwaitEventRace ||
      !operationOwnedBy(program, operation, selected.owner) ||
      operation[selectedArm].elementId !== selected.elementId
    ) return [];
    const pairedElement = selectedArm === "message"
      ? operation.timer.elementId
      : operation.message.elementId;
    return open.filter((entry) =>
      entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
      entry.elementId === pairedElement && sameScope(entry.owner, selected.owner));
  });
  return candidates.length === 0 ? null : requireUnique(candidates);
}

function requireWait(open: readonly OpenOccurrence[], id: OccurrenceId): OpenOccurrence {
  const found = findWait(open, id);
  if (found === null) failCompleteness();
  return found;
}

function findWait(open: readonly OpenOccurrence[], id: OccurrenceId): OpenOccurrence | null {
  const matches = open.filter((entry) =>
    entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
    sameOccurrence(entry.anchor.id, id));
  return matches.length === 0 ? null : requireUnique(matches);
}

function uniqueOperationForElement<K extends SemanticOperationKind>(
  program: SemanticProcessProgram,
  kind: K,
  elementId: string,
  scopeId: string,
): Extract<SemanticOperation, { kind: K }> | null {
  const matches = program.operations.filter((operation): operation is Extract<
    SemanticOperation,
    { kind: K }
  > => operation.kind === kind && operationOwnsElement(operation, elementId) &&
    program.operationScopes.some((owner) =>
      owner.operationId === operation.id && owner.scopeId === scopeId));
  return matches.length === 1 ? matches[0]! : null;
}

function operationOwnsElement(operation: SemanticOperation, elementId: string): boolean {
  return operation.kind === SemanticOperationKind.AwaitEffect
    ? operation.effect.elementId === elementId
    : operation.origin.elementId === elementId;
}

export function operationOwnedBy(
  program: SemanticProcessProgram,
  operation: SemanticOperation,
  owner: ScopeOccurrenceId,
): boolean {
  return program.operationScopes.filter(({ operationId, scopeId }) =>
    operationId === operation.id && scopeId === owner.definitionScopeId).length === 1;
}

export function requireProcessId(
  program: SemanticProcessProgram,
  owner: ScopeOccurrenceId,
): string {
  let definition = uniqueDefinition(program, owner.definitionScopeId);
  const visited = new Set<string>();
  while (definition?.parentScopeId !== null) {
    if (definition === null || visited.has(definition.id)) failCompleteness();
    visited.add(definition.id);
    definition = uniqueDefinition(program, definition.parentScopeId);
  }
  if (definition === null) failCompleteness();
  return definition.originElementId;
}

export function uniqueDefinition(
  program: SemanticProcessProgram,
  id: string,
): SemanticProcessProgram["definitionScopes"][number] | null {
  const matches = program.definitionScopes.filter((definition) => definition.id === id);
  return matches.length === 1 ? matches[0]! : null;
}

export function instantOccurrence(
  processId: string,
  elementId: string,
  owner: ScopeOccurrenceId,
): Omit<UnnumberedFlowNodeOccurrenceStart, "anchor"> {
  return { processId, elementId, owner };
}

export function lifecycleEnd(
  entry: OpenOccurrence,
  terminal: FlowNodeOccurrenceTerminalKind,
): UnnumberedFlowNodeOccurrenceEnd {
  return { anchor: entry.anchor, terminal };
}

function ownerIsRemoved(
  owner: ScopeOccurrenceId,
  scopes: ReadonlySet<string>,
  instances: ReadonlySet<string>,
): boolean {
  return scopes.has(scopeKey(owner)) || instances.has(owner.processInstanceId);
}

export function calledInstanceId(id: OccurrenceId): string {
  return `call:${utf8Length(id.processInstanceId)}:${id.processInstanceId}:${utf8Length(id.elementId)}:${id.elementId}:${id.activation}`;
}

function utf8Length(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const point = value.codePointAt(index)!;
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (point > 0xffff) index += 1;
  }
  return length;
}

function compareStarts(
  left: UnnumberedFlowNodeOccurrenceStart,
  right: UnnumberedFlowNodeOccurrenceStart,
): number {
  return compareAnchors(left.anchor, right.anchor) ||
    compareCanonicalStrings(left.processId, right.processId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    compareScopes(left.owner, right.owner);
}

function compareEnds(
  left: UnnumberedFlowNodeOccurrenceEnd,
  right: UnnumberedFlowNodeOccurrenceEnd,
): number {
  return compareAnchors(left.anchor, right.anchor);
}

function compareInstant(
  left: Omit<UnnumberedFlowNodeOccurrenceStart, "anchor">,
  right: Omit<UnnumberedFlowNodeOccurrenceStart, "anchor">,
): number {
  return compareCanonicalStrings(left.processId, right.processId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    compareScopes(left.owner, right.owner);
}

function compareAnchors(
  left: SemanticFlowNodeOccurrenceAnchor,
  right: SemanticFlowNodeOccurrenceAnchor,
): number {
  const kindOrder = anchorRank(left) - anchorRank(right);
  if (kindOrder !== 0 || left.kind !== right.kind) return kindOrder;
  switch (left.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      return right.kind === left.kind ? compareOccurrences(left.id, right.id) : kindOrder;
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return right.kind === left.kind ? compareScopes(left.id, right.id) : kindOrder;
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return right.kind === left.kind
        ? compareCanonicalStrings(left.commandId, right.commandId) ||
          left.transitionIndex - right.transitionIndex || left.localIndex - right.localIndex
        : kindOrder;
    default:
      return assertNever(left);
  }
}

function anchorRank(anchor: SemanticFlowNodeOccurrenceAnchor): number {
  switch (anchor.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait: return 0;
    case SemanticFlowNodeOccurrenceAnchorKind.Scope: return 1;
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity: return 2;
    case SemanticFlowNodeOccurrenceAnchorKind.Transition: return 3;
    default: return assertNever(anchor);
  }
}

function compareOccurrences(left: OccurrenceId, right: OccurrenceId): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.elementId, right.elementId) || left.activation - right.activation;
}

function compareScopes(left: ScopeOccurrenceId, right: ScopeOccurrenceId): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.definitionScopeId, right.definitionScopeId) ||
    left.activation - right.activation;
}

function sameOccurrence(left: OccurrenceId, right: OccurrenceId): boolean {
  return compareOccurrences(left, right) === 0;
}

export function sameScope(left: ScopeOccurrenceId, right: ScopeOccurrenceId): boolean {
  return compareScopes(left, right) === 0;
}

export function sameAnchor(
  left: SemanticFlowNodeOccurrenceAnchor,
  right: SemanticFlowNodeOccurrenceAnchor,
): boolean {
  return compareAnchors(left, right) === 0;
}

function scopeKey(id: ScopeOccurrenceId): string {
  return JSON.stringify([id.processInstanceId, id.definitionScopeId, id.activation]);
}

export function requireUnique<T>(values: readonly T[]): T {
  if (values.length !== 1) failCompleteness();
  return values[0]!;
}

export function failCompleteness(): never {
  throw new TypeError("semantic flow-node publication is not a complete lifecycle of its E1 transition");
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported external occurrence completeness variant: ${String(value)}`);
}
