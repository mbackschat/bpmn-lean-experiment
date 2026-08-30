/**
 * Exact semantic flow-node occurrence lifecycle projection.
 *
 * Lifecycle facts are derived at the evaluator boundary that owns the selected stimulus or Program
 * operation. Runtime state supplies private pairing identities and an independent open-set oracle;
 * neither Program-operation counts nor a later public state difference define an occurrence.
 */
import {
  EffectExecutionResultKind,
  StimulusKind,
} from "./contract.js";
import type { OccurrenceId, Stimulus } from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
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
  RuntimeScopeOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";
import { candidateLongLivedStarts } from "./flow-node-occurrence-boundary-starts.js";
import {
  candidateElementOccurrence,
  candidateOperationOccurrence,
} from "./flow-node-occurrence-candidates.js";
import {
  projectOpenFlowNodeOccurrences,
  resolveBoundaryTimerBinding,
} from "./flow-node-occurrence-open-set.js";
import {
  sequentialMultiInstanceInterruptionOccurrences,
  sequentialMultiInstanceIterationOccurrences,
} from "./flow-node-occurrence-sequential-multi-instance.js";
import {
  parallelMultiInstanceCompletionOccurrences,
  parallelMultiInstanceInterruptionOccurrences,
} from "./flow-node-occurrence-parallel-multi-instance-lifecycle.js";
import {
  isSequentialMultiInstanceTaskDefinition,
} from "./semantic-process-sequential-multi-instance-runtime.js";
import {
  isParallelMultiInstanceTaskDefinition,
} from "./semantic-process-parallel-multi-instance-runtime.js";

export enum FlowNodeOccurrenceTerminalKind {
  Completed = "completed",
  Cancelled = "cancelled",
}

export enum SemanticFlowNodeOccurrenceAnchorKind {
  Wait = "wait",
  Scope = "scope",
  CallActivity = "callActivity",
  Transition = "transition",
}

export type SemanticFlowNodeOccurrenceAnchor = DeepReadonly<
  | { kind: SemanticFlowNodeOccurrenceAnchorKind.Wait; id: OccurrenceId }
  | { kind: SemanticFlowNodeOccurrenceAnchorKind.Scope; id: ScopeOccurrenceId }
  | { kind: SemanticFlowNodeOccurrenceAnchorKind.CallActivity; id: OccurrenceId }
  | {
      kind: SemanticFlowNodeOccurrenceAnchorKind.Transition;
      commandId: string;
      transitionIndex: number;
      localIndex: number;
    }
>;

export type UnnumberedFlowNodeOccurrenceStart = DeepReadonly<{
  anchor: SemanticFlowNodeOccurrenceAnchor;
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
}>;

export type UnnumberedFlowNodeOccurrenceEnd = DeepReadonly<{
  anchor: SemanticFlowNodeOccurrenceAnchor;
  terminal: FlowNodeOccurrenceTerminalKind;
}>;

export type UnnumberedFlowNodeOccurrenceDelta = DeepReadonly<{
  started: UnnumberedFlowNodeOccurrenceStart[];
  ended: UnnumberedFlowNodeOccurrenceEnd[];
}>;

export type FlowNodeOccurrenceTransitionBoundary = DeepReadonly<
  | { kind: "external"; stimulus: Stimulus }
  | { kind: "internal"; operation: SemanticOperation; owner: ScopeOccurrenceId }
>;

type InstantaneousOccurrence = Readonly<{
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
}>;

type TerminalSpec = Readonly<{
  anchor: SemanticFlowNodeOccurrenceAnchor;
  terminal: FlowNodeOccurrenceTerminalKind;
}>;

/** Derives and fold-checks one delta against independently projected before and after open sets. */
export function projectFlowNodeOccurrenceLifecycleDelta(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  boundary: FlowNodeOccurrenceTransitionBoundary,
  commandId: string,
  transitionIndex: number,
): UnnumberedFlowNodeOccurrenceDelta | null {
  if (!validTransitionIdentity(commandId, transitionIndex)) {
    return null;
  }
  const pieces = boundary.kind === "external"
    ? externalLifecycle(program, before, after, boundary.stimulus)
    : internalLifecycle(program, before, after, boundary.operation, boundary.owner);
  if (pieces === null) {
    return null;
  }
  const delta = assembleDelta(
    pieces.started,
    pieces.ended,
    pieces.instantaneous,
    commandId,
    transitionIndex,
  );
  const beforeOpen = projectOpenFlowNodeOccurrences(program, before);
  const afterOpen = projectOpenFlowNodeOccurrences(program, after);
  if (beforeOpen === null || afterOpen === null) {
    return null;
  }
  const folded = foldFlowNodeOccurrenceLifecycleDelta(beforeOpen, delta);
  return folded !== null && sameJson(folded, afterOpen) ? delta : null;
}

/** Applies starts before terminals and rejects the complete anchor-collision class. */
export function foldFlowNodeOccurrenceLifecycleDelta(
  open: ReadonlyArray<UnnumberedFlowNodeOccurrenceStart>,
  delta: UnnumberedFlowNodeOccurrenceDelta,
): UnnumberedFlowNodeOccurrenceStart[] | null {
  const canonical = canonicalOpenSet(open);
  if (canonical === null || !sameJson(canonical, open) ||
      !sameJson([...delta.started].sort(compareStarts), delta.started) ||
      !sameJson([...delta.ended].sort(compareEnds), delta.ended)) {
    return null;
  }
  const entries = new Map(canonical.map((entry) => [anchorKey(entry.anchor), entry]));
  const transitionStarts = new Set<string>();
  for (const start of delta.started) {
    if (!validStart(start)) return null;
    const key = anchorKey(start.anchor);
    if (entries.has(key)) return null;
    entries.set(key, start);
    if (start.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Transition) {
      transitionStarts.add(key);
    }
  }
  const ended = new Set<string>();
  for (const terminal of delta.ended) {
    if (
      terminal.terminal !== FlowNodeOccurrenceTerminalKind.Completed &&
      terminal.terminal !== FlowNodeOccurrenceTerminalKind.Cancelled
    ) {
      return null;
    }
    const key = anchorKey(terminal.anchor);
    if (ended.has(key) || !entries.has(key)) return null;
    ended.add(key);
    entries.delete(key);
  }
  if ([...transitionStarts].some((key) => !ended.has(key)) ||
      delta.ended.some(({ anchor }) =>
        anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Transition &&
        !transitionStarts.has(anchorKey(anchor))) ||
      !transitionAnchorsAreLocal(delta)) {
    return null;
  }
  return canonicalOpenSet([...entries.values()]);
}

function externalLifecycle(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  stimulus: Stimulus,
): LifecyclePieces | null {
  const completed = (id: OccurrenceId): LifecyclePieces => pieces([], [{ anchor: waitAnchor(id), terminal: FlowNodeOccurrenceTerminalKind.Completed }]);
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
    case StimulusKind.ReportEffectFailure:
    case StimulusKind.RetryIncident:
      return pieces();
    case StimulusKind.CompleteUserTaskInstance: {
      if (isParallelMultiInstanceTaskDefinition(program, stimulus.taskId)) {
        const change = parallelMultiInstanceCompletionOccurrences(
          program,
          before,
          after,
          stimulus,
        );
        return change === null ? null : pieces(change.started, change.ended);
      }
      if (isSequentialMultiInstanceTaskDefinition(program, stimulus.taskId)) {
        const iteration = sequentialMultiInstanceIterationOccurrences(program, before, after, stimulus);
        return iteration === null ? null : pieces(iteration.started, iteration.ended);
      }
      return completed(stimulus.taskId);
    }
    case StimulusKind.DeliverMessage: {
      const race = only(before.eventRaces.filter(({ messageSubscriptionId }) => sameOccurrence(messageSubscriptionId, stimulus.subscriptionId)));
      return race === undefined
        ? completed(stimulus.subscriptionId)
        : pieces([], [
          { anchor: waitAnchor(race.messageSubscriptionId), terminal: FlowNodeOccurrenceTerminalKind.Completed },
          { anchor: waitAnchor(race.timerOccurrenceId), terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
        ]);
    }
    case StimulusKind.FireTimer: {
      const race = only(before.eventRaces.filter(({ timerOccurrenceId }) => sameOccurrence(timerOccurrenceId, stimulus.timerId)));
      if (race !== undefined) {
        return pieces([], [
          { anchor: waitAnchor(race.messageSubscriptionId), terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
          { anchor: waitAnchor(race.timerOccurrenceId), terminal: FlowNodeOccurrenceTerminalKind.Completed },
        ]);
      }
      const timer = only(before.timerWaits.filter(({ id }) => sameOccurrence(id, stimulus.timerId)));
      if (timer === undefined) return null;
      const boundary = resolveBoundaryTimerBinding(program, before, timer);
      if (boundary === null) return completed(stimulus.timerId);
      const instant = candidateElementOccurrence(program, before, timer.id.elementId, timer.owner);
      if (instant === null) return null;
      switch (boundary.operation.kind) {
        case SemanticOperationKind.AwaitBoundedUserTask:
          return "hostId" in boundary
            ? pieces([], [{
                anchor: waitAnchor(boundary.hostId),
                terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
              }], [instant])
            : null;
        case SemanticOperationKind.AwaitMonitoredUserTask:
          return "hostId" in boundary ? pieces([], [], [instant]) : null;
        case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask: {
          const cancelled = sequentialMultiInstanceInterruptionOccurrences(boundary);
          return cancelled === null ? null : pieces([], cancelled.ended, [instant]);
        }
        case SemanticOperationKind.AwaitParallelMultiInstanceUserTask: {
          const cancelled = parallelMultiInstanceInterruptionOccurrences(boundary);
          return cancelled === null ? null : pieces([], cancelled.ended, [instant]);
        }
        case SemanticOperationKind.EnterBoundedScope:
          return "child" in boundary
            ? pieces(
                [],
                cancelledRegion(program, before, boundary.child, false),
                [instant],
              )
            : null;
        default:
          return assertNever(boundary.operation);
      }
    }
    case StimulusKind.CompleteEffect: {
      const wait = only(before.effectWaits.filter(({ id }) => sameOccurrence(id, stimulus.effectId)));
      if (wait === undefined) return null;
      if (stimulus.result.kind === EffectExecutionResultKind.Success) return completed(stimulus.effectId);
      const route = wait.bpmnErrorRoute;
      const instant = route === null ? null : candidateElementOccurrence(program, before, route.origin.boundaryEventId, wait.owner);
      return instant === null ? null : pieces([], [{
        anchor: waitAnchor(stimulus.effectId),
        terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
      }], [instant]);
    }
    case StimulusKind.CancelIncidentProcess:
      return pieces([], openAnchorCandidates(program, before).map(({ anchor }) => ({
        anchor,
        terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
      })));
    default:
      return assertNever(stimulus);
  }
}

function internalLifecycle(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  operation: SemanticOperation,
  owner: ScopeOccurrenceId,
): LifecyclePieces | null {
  const instant = (): InstantaneousOccurrence | null => candidateOperationOccurrence(program, before, operation, owner);
  const instantOnly = (): LifecyclePieces | null => {
    const occurrence = instant();
    return occurrence === null ? null : pieces([], [], [occurrence]);
  };
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
      return instantOnly();
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitDataInputUserTask:
    case SemanticOperationKind.AwaitDataOutputUserTask:
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.AwaitEffect: {
      const starts = candidateLongLivedStarts(program, after, operation, owner);
      return starts === null ? null : pieces(starts);
    }
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      return null;
    case SemanticOperationKind.AwaitEventRace: {
      const starts = candidateLongLivedStarts(program, after, operation, owner);
      const gateway = instant();
      return starts === null || gateway === null ? null : pieces(starts, [], [gateway]);
    }
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.EnterBoundedScope: {
      const starts = candidateLongLivedStarts(program, after, operation, owner);
      return starts === null ? null : pieces(starts);
    }
    case SemanticOperationKind.InvokeProcess: {
      const starts = candidateLongLivedStarts(program, after, operation, owner);
      return starts === null ? null : pieces(starts);
    }
    case SemanticOperationKind.ReturnProcess: {
      const record = only(before.calledProcessOccurrences.filter((candidate) => candidate.returnOperationId === operation.id));
      return record === undefined ? null : pieces([], [{
        anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.CallActivity, id: record.id },
        terminal: FlowNodeOccurrenceTerminalKind.Completed,
      }]);
    }
    case SemanticOperationKind.CompleteScope: {
      const occurrence = only(before.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, owner)));
      return occurrence?.parent === null ? pieces() : pieces([], [{
        anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Scope, id: owner },
        terminal: FlowNodeOccurrenceTerminalKind.Completed,
      }]);
    }
    case SemanticOperationKind.ThrowError: {
      const attached = only(before.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, owner)));
      if (attached?.parent === null || attached?.parent === undefined) return null;
      const thrown = instant();
      const caught = candidateElementOccurrence(program, before, operation.handler.origin.boundaryEventId, attached.parent);
      return thrown === null || caught === null ? null : pieces(
        [],
        cancelledRegion(program, before, attached, false),
        [thrown, caught],
      );
    }
    case SemanticOperationKind.TerminateScope: {
      const attached = only(before.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, owner)));
      const end = instant();
      return attached === undefined || end === null ? null : pieces(
        [],
        cancelledRegion(program, before, attached, true),
        [end],
      );
    }
    default:
      return assertNever(operation);
  }
}

type LifecyclePieces = Readonly<{
  started: UnnumberedFlowNodeOccurrenceStart[];
  ended: TerminalSpec[];
  instantaneous: InstantaneousOccurrence[];
}>;

function pieces(
  started: UnnumberedFlowNodeOccurrenceStart[] = [],
  ended: TerminalSpec[] = [],
  instantaneous: InstantaneousOccurrence[] = [],
): LifecyclePieces {
  return { started, ended, instantaneous };
}

function assembleDelta(
  started: ReadonlyArray<UnnumberedFlowNodeOccurrenceStart>,
  ended: ReadonlyArray<TerminalSpec>,
  instantaneous: ReadonlyArray<InstantaneousOccurrence>,
  commandId: string,
  transitionIndex: number,
): UnnumberedFlowNodeOccurrenceDelta {
  const instants = [...instantaneous].sort(compareInstantaneous).map((entry, localIndex) => ({
    ...entry,
    anchor: {
      kind: SemanticFlowNodeOccurrenceAnchorKind.Transition,
      commandId,
      transitionIndex,
      localIndex,
    } as const,
  }));
  return {
    started: [...started, ...instants].sort(compareStarts),
    ended: [
      ...ended,
      ...instants.map(({ anchor }) => ({ anchor, terminal: FlowNodeOccurrenceTerminalKind.Completed as const })),
    ].sort(compareEnds),
  };
}

function cancelledRegion(
  program: SemanticProcessProgram,
  state: RuntimeState,
  root: RuntimeScopeOccurrence,
  retainRoot: boolean,
): TerminalSpec[] {
  const removed = new Set<string>();
  const addScope = (id: ScopeOccurrenceId): void => {
    const key = scopeKey(id);
    if (removed.has(key)) return;
    removed.add(key);
    for (const child of state.scopeOccurrences) {
      if (child.parent !== null && sameScopeOccurrence(child.parent, id)) addScope(child.id);
    }
    for (const call of state.calledProcessOccurrences) {
      if (sameScopeOccurrence(call.caller, id)) addScope(call.calledRoot);
    }
  };
  addScope(root.id);
  return openAnchorCandidates(program, state).filter((entry) => {
    if (entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope && retainRoot && sameScopeOccurrence(entry.anchor.id, root.id)) return false;
    return removed.has(scopeKey(entry.owner)) ||
      (entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope && removed.has(scopeKey(entry.anchor.id)));
  }).map(({ anchor }) => ({ anchor, terminal: FlowNodeOccurrenceTerminalKind.Cancelled }));
}

function openAnchorCandidates(
  program: SemanticProcessProgram,
  state: RuntimeState,
): Array<{ anchor: SemanticFlowNodeOccurrenceAnchor; owner: ScopeOccurrenceId }> {
  const candidates: Array<{ anchor: SemanticFlowNodeOccurrenceAnchor; owner: ScopeOccurrenceId }> = [];
  const addWait = ({ id, owner }: { id: OccurrenceId; owner: ScopeOccurrenceId }): void => {
    candidates.push({ anchor: waitAnchor(id), owner });
  };
  state.userTaskWaits.forEach(addWait);
  state.messageWaits.forEach(addWait);
  state.timerWaits.filter((wait) => resolveBoundaryTimerBinding(program, state, wait) === null).forEach(addWait);
  state.effectWaits.forEach(addWait);
  state.effectIncidents.forEach(({ wait }) => addWait(wait));
  for (const occurrence of state.scopeOccurrences) {
    if (occurrence.parent !== null) {
      candidates.push({
        anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Scope, id: occurrence.id },
        owner: occurrence.parent,
      });
    }
  }
  for (const record of state.calledProcessOccurrences) {
    candidates.push({
      anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.CallActivity, id: record.id },
      owner: record.caller,
    });
  }
  return candidates;
}

function canonicalOpenSet(entries: ReadonlyArray<UnnumberedFlowNodeOccurrenceStart>): UnnumberedFlowNodeOccurrenceStart[] | null {
  const sorted = [...entries].sort(compareStarts);
  return sorted.every((entry) =>
    validStart(entry) &&
    entry.anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Transition
  ) && sorted.every((entry, index) => index === 0 || anchorKey(sorted[index - 1]!.anchor) !== anchorKey(entry.anchor))
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
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      return validOccurrence(anchor.id);
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return validScopeId(anchor.id);
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return validTransitionIdentity(anchor.commandId, anchor.transitionIndex) && Number.isSafeInteger(anchor.localIndex) && anchor.localIndex >= 0;
    default:
      return assertNever(anchor);
  }
}

function validOccurrence(id: OccurrenceId): boolean {
  return id.processInstanceId.length > 0 && id.elementId.length > 0 && Number.isSafeInteger(id.activation) && id.activation > 0;
}

function validScopeId(id: ScopeOccurrenceId): boolean {
  return id.processInstanceId.length > 0 && id.definitionScopeId.length > 0 && Number.isSafeInteger(id.activation) && id.activation > 0;
}

function validTransitionIdentity(commandId: string, transitionIndex: number): boolean {
  return commandId.length > 0 && Number.isSafeInteger(transitionIndex) && transitionIndex >= 0;
}

function waitAnchor(id: OccurrenceId): SemanticFlowNodeOccurrenceAnchor {
  return { kind: SemanticFlowNodeOccurrenceAnchorKind.Wait, id };
}

function anchorKey(anchor: SemanticFlowNodeOccurrenceAnchor): string {
  switch (anchor.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
      return JSON.stringify([0, anchor.id.processInstanceId, anchor.id.elementId, anchor.id.activation]);
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return JSON.stringify([1, anchor.id.processInstanceId, anchor.id.definitionScopeId, anchor.id.activation]);
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      return JSON.stringify([2, anchor.id.processInstanceId, anchor.id.elementId, anchor.id.activation]);
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return JSON.stringify([3, anchor.commandId, anchor.transitionIndex, anchor.localIndex]);
    default:
      return assertNever(anchor);
  }
}

function scopeKey(id: ScopeOccurrenceId): string {
  return JSON.stringify([id.processInstanceId, id.definitionScopeId, id.activation]);
}

function compareStarts(left: UnnumberedFlowNodeOccurrenceStart, right: UnnumberedFlowNodeOccurrenceStart): number {
  return compareAnchors(left.anchor, right.anchor) ||
    compareCanonicalStrings(left.processId, right.processId) || compareCanonicalStrings(left.elementId, right.elementId) ||
    compareScopeIds(left.owner, right.owner);
}

function compareEnds(left: UnnumberedFlowNodeOccurrenceEnd, right: UnnumberedFlowNodeOccurrenceEnd): number {
  return compareAnchors(left.anchor, right.anchor);
}

function compareAnchors(
  left: SemanticFlowNodeOccurrenceAnchor,
  right: SemanticFlowNodeOccurrenceAnchor,
): number {
  const kindOrder = anchorKindOrder(left.kind) - anchorKindOrder(right.kind);
  if (kindOrder !== 0) return kindOrder;
  switch (left.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      return right.kind === left.kind ? compareOccurrenceIds(left.id, right.id) : 0;
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return right.kind === left.kind ? compareScopeIds(left.id, right.id) : 0;
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return right.kind === left.kind
        ? compareCanonicalStrings(left.commandId, right.commandId) ||
          left.transitionIndex - right.transitionIndex ||
          left.localIndex - right.localIndex
        : 0;
    default:
      return assertNever(left);
  }
}

function anchorKindOrder(kind: SemanticFlowNodeOccurrenceAnchorKind): number {
  switch (kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait: return 0;
    case SemanticFlowNodeOccurrenceAnchorKind.Scope: return 1;
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity: return 2;
    case SemanticFlowNodeOccurrenceAnchorKind.Transition: return 3;
    default: return assertNever(kind);
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

function transitionAnchorsAreLocal(delta: UnnumberedFlowNodeOccurrenceDelta): boolean {
  const starts = delta.started.filter(({ anchor }) =>
    anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Transition
  ).map(({ anchor }) => anchor);
  const first = starts[0];
  if (first === undefined) return true;
  if (first.kind !== SemanticFlowNodeOccurrenceAnchorKind.Transition) return false;
  return starts.every((anchor, index) =>
    anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Transition &&
    anchor.commandId === first.commandId &&
    anchor.transitionIndex === first.transitionIndex &&
    anchor.localIndex === index &&
    delta.ended.some((terminal) =>
      terminal.terminal === FlowNodeOccurrenceTerminalKind.Completed &&
      anchorKey(terminal.anchor) === anchorKey(anchor)
    )
  );
}

function compareInstantaneous(left: InstantaneousOccurrence, right: InstantaneousOccurrence): number {
  return compareCanonicalStrings(left.processId, right.processId) || compareCanonicalStrings(left.elementId, right.elementId) ||
    compareScopeIds(left.owner, right.owner);
}

function only<T>(values: ReadonlyArray<T>): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported flow-node lifecycle variant: ${JSON.stringify(value)}`);
}
