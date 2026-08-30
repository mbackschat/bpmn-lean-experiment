import {
  ActivityHandlerKind,
  FlowNodeOccurrenceTerminalKind as SemanticTerminalKind,
  ScenarioStepKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  attachedHandlersForBodyAnchor,
  compareCanonicalStrings,
  isWellFormedWireString,
  requireCompleteFlowNodeOccurrenceLifecycles,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  ActivityHandlerOccurrence,
  OccurrenceId,
  RetainedFlowNodeOccurrence,
  RuntimeState,
  ScenarioStep,
  ScopeOccurrenceId,
  SemanticFlowNodeOccurrenceAnchor,
  SemanticProcessIdentity,
  SemanticProcessProgram,
  Stimulus,
  UnnumberedFlowNodeOccurrenceDelta,
  UnnumberedFlowNodeOccurrenceStart,
} from "@bpmn-lean/semantic-core";
import {
  FlowNodeOccurrenceTerminalKind,
  requireFlowNodeOccurrencePublicationResult,
} from "@bpmn-lean/temporal-protocol";
import type {
  ExecutionPublicationPage,
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrenceEnd,
  FlowNodeOccurrenceStart,
  OpenFlowNodeOccurrence,
} from "@bpmn-lean/temporal-protocol";

import type {
  ExecutionPublicationState,
} from "./execution-publication-state.js";

type RetainedOpenFlowNodeOccurrence = DeepReadonly<{
  anchor: SemanticFlowNodeOccurrenceAnchor;
  occurrence: OpenFlowNodeOccurrence;
  /**
   * The handler occurrences the Activity occurrence record listed when this body opened.
   *
   * Retained because the completeness relation must pair a boundary Timer to its host without an
   * activation ordinal, and this is the only point where the record and the newly opened entry
   * coexist: the relation sees no semantic state, and the published delta cannot carry the pairing
   * without changing a wire schema. Empty for every occurrence that no record lists.
   */
  attachedHandlers: ActivityHandlerOccurrence[];
}>;

export type FlowNodeOccurrencePublicationState = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  headRevision: number;
  batches: FlowNodeOccurrenceBatch[];
  currentOpen: OpenFlowNodeOccurrence[];
  retainedOpen: RetainedOpenFlowNodeOccurrence[];
  lastCommittedAtEpochMs: number | null;
}>;

/** Creates the empty authoritative occurrence fold beside semantic RuntimeState. */
export function createFlowNodeOccurrencePublicationState(
  program: SemanticProcessProgram,
  processInstanceId: string,
): FlowNodeOccurrencePublicationState {
  if (!isNonEmpty(processInstanceId)) {
    throw new TypeError(
      "flow-node occurrence publication Process instance ID must be nonempty",
    );
  }
  return {
    definition: program.identity,
    processId: program.processId,
    processInstanceId,
    headRevision: 0,
    batches: [],
    currentOpen: [],
    retainedOpen: [],
    lastCommittedAtEpochMs: null,
  };
}

/** Numbers and folds one lifecycle batch against the exact E1 accumulator successors. */
export function accumulateFlowNodeOccurrencePublication(
  program: SemanticProcessProgram,
  state: FlowNodeOccurrencePublicationState,
  executionBefore: ExecutionPublicationState,
  executionAfter: ExecutionPublicationState,
  stimulus: Stimulus,
  step: ScenarioStep,
  committedAtEpochMs: number,
): FlowNodeOccurrencePublicationState {
  if (step.kind !== ScenarioStepKind.Committed) {
    return state;
  }
  if (
    step.publication === null ||
    step.flowNodeOccurrenceLifecycles === null
  ) {
    throw new TypeError(
      "committed semantic step has no publishable flow-node lifecycle",
    );
  }
  requireAccumulatorContinuity(
    program,
    state,
    executionBefore,
    committedAtEpochMs,
  );
  const executionBatch = executionAfter.batches.at(-1);
  if (
    executionBatch === undefined ||
    executionAfter.batches.length !== executionBefore.batches.length + 1 ||
    executionBatch.fromRevision !== state.headRevision ||
    executionBatch.throughRevision !== executionAfter.headRevision ||
    executionBatch.transitions.length !== step.flowNodeOccurrenceLifecycles.length ||
    executionBatch.transitions.length !== step.publication.transitions.length ||
    executionBatch.commandId !== stimulusCommandId(stimulus)
  ) {
    throw new TypeError(
      "flow-node occurrence publication is not aligned with execution publication",
    );
  }
  requireCompleteFlowNodeOccurrenceLifecycles(
    program,
    state.retainedOpen.map(toCoreRetained),
    executionBatch.commandId,
    executionBatch.transitions,
    step.flowNodeOccurrenceLifecycles,
  );

  const retained = state.retainedOpen.map(cloneRetained);
  const transitions = step.flowNodeOccurrenceLifecycles.map(
    (lifecycle, index) => numberLifecycleDelta(
      state.processInstanceId,
      executionBatch.transitions[index]!.revision,
      lifecycle,
      committedAtEpochMs,
      retained,
    ),
  );
  const first = transitions[0];
  if (first === undefined) {
    throw new TypeError("flow-node occurrence publication batch is empty");
  }
  const batch: FlowNodeOccurrenceBatch = {
    commandId: executionBatch.commandId,
    fromRevision: executionBatch.fromRevision,
    throughRevision: executionBatch.throughRevision,
    committedAtEpochMs,
    transitions: [first, ...transitions.slice(1)],
  };
  const refreshed = refreshAttachedHandlers(retained, step.state);
  const currentOpen = refreshed
    .map(({ occurrence }) => cloneOpen(occurrence))
    .sort((left, right) => comparePublicId(left.id, right.id));
  const candidate: FlowNodeOccurrencePublicationState = {
    definition: state.definition,
    processId: state.processId,
    processInstanceId: state.processInstanceId,
    headRevision: executionAfter.headRevision,
    batches: [...state.batches, batch],
    currentOpen,
    retainedOpen: refreshed,
    lastCommittedAtEpochMs: committedAtEpochMs,
  };
  requireFlowNodeOccurrencePublicationResult(
    {
      kind: "available",
      page: {
        definition: candidate.definition,
        processId: candidate.processId,
        processInstanceId: candidate.processInstanceId,
        requestedAfterRevision: batch.fromRevision,
        pageThroughRevision: batch.throughRevision,
        headRevision: candidate.headRevision,
        batches: [batch],
        currentOpen,
      },
    },
    {
      program,
      processInstanceId: candidate.processInstanceId,
      executionPublication: executionPageForBatch(
        executionAfter,
        executionBatch,
      ),
      afterRevision: batch.fromRevision,
      limit: 1,
    },
  );
  return candidate;
}

function numberLifecycleDelta(
  processInstanceId: string,
  revision: number,
  lifecycle: UnnumberedFlowNodeOccurrenceDelta,
  committedAtEpochMs: number,
  retained: RetainedOpenFlowNodeOccurrence[],
) {
  if (
    !canonical(lifecycle.started, (left, right) =>
      compareUnnumberedStarts(left, right)) ||
    !canonical(lifecycle.ended, (left, right) =>
      compareAnchors(left.anchor, right.anchor))
  ) {
    throw new TypeError("semantic flow-node lifecycle is not canonical");
  }
  const started: FlowNodeOccurrenceStart[] = [];
  for (let startIndex = 0; startIndex < lifecycle.started.length; startIndex += 1) {
    const semanticStart = lifecycle.started[startIndex]!;
    if (retained.some(({ anchor }) => sameAnchor(anchor, semanticStart.anchor))) {
      throw new TypeError("semantic flow-node lifecycle reused an open anchor");
    }
    const publicStart: FlowNodeOccurrenceStart = {
      id: { processInstanceId, startRevision: revision, startIndex },
      processId: semanticStart.processId,
      elementId: semanticStart.elementId,
      owner: cloneScope(semanticStart.owner),
    };
    started.push(publicStart);
    retained.push({
      anchor: cloneAnchor(semanticStart.anchor),
      occurrence: { ...publicStart, startedAtEpochMs: committedAtEpochMs },
      // Written once below, from the committed post-state, for every entry rather than only for the
      // ones this command opened. See `refreshAttachedHandlers`.
      attachedHandlers: [],
    });
  }
  const ended: FlowNodeOccurrenceEnd[] = [];
  for (const semanticEnd of lifecycle.ended) {
    const matchIndex = retained.findIndex(({ anchor }) =>
      sameAnchor(anchor, semanticEnd.anchor));
    if (matchIndex < 0) {
      throw new TypeError("semantic flow-node lifecycle ended an unknown anchor");
    }
    const match = retained[matchIndex]!;
    if (
      semanticEnd.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Transition &&
      match.occurrence.id.startRevision !== revision
    ) {
      throw new TypeError("transition flow-node anchor crossed a revision");
    }
    retained.splice(matchIndex, 1);
    ended.push({
      id: { ...match.occurrence.id },
      terminal: requireTerminal(semanticEnd.terminal),
    });
  }
  if (retained.some(({ anchor }) =>
    anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Transition)) {
    throw new TypeError("transition flow-node anchor escaped its lifecycle delta");
  }
  ended.sort((left, right) => comparePublicId(left.id, right.id));
  return { revision, lifecycle: { started, ended } };
}

function requireAccumulatorContinuity(
  program: SemanticProcessProgram,
  state: FlowNodeOccurrencePublicationState,
  execution: ExecutionPublicationState,
  committedAtEpochMs: number,
): void {
  if (
    !sameDefinition(state.definition, program.identity) ||
    state.processId !== program.processId ||
    state.processInstanceId !== execution.processInstanceId ||
    state.headRevision !== execution.headRevision ||
    state.batches.length !== execution.batches.length ||
    !accumulatedBatchesAlign(state, execution) ||
    !isSafe(committedAtEpochMs, 0) ||
    (state.lastCommittedAtEpochMs !== null &&
      committedAtEpochMs < state.lastCommittedAtEpochMs) ||
    ((state.lastCommittedAtEpochMs === null) !== (state.headRevision === 0)) ||
    !sameCurrentOpen(
      state.currentOpen,
      state.retainedOpen.map(({ occurrence }) => occurrence),
    ) ||
    hasDuplicateRetainedIdentity(state.retainedOpen) ||
    state.retainedOpen.some(({ anchor }) =>
      anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Transition)
  ) {
    throw new TypeError("flow-node occurrence accumulator continuity drifted");
  }
}

function accumulatedBatchesAlign(
  occurrences: FlowNodeOccurrencePublicationState,
  execution: ExecutionPublicationState,
): boolean {
  return occurrences.batches.every((batch, index) => {
    const expected = execution.batches[index];
    return expected !== undefined &&
      batch.commandId === expected.commandId &&
      batch.fromRevision === expected.fromRevision &&
      batch.throughRevision === expected.throughRevision &&
      batch.transitions.length === expected.transitions.length &&
      batch.transitions.every((transition, transitionIndex) =>
        transition.revision === expected.transitions[transitionIndex]?.revision);
  });
}

function hasDuplicateRetainedIdentity(
  retained: readonly RetainedOpenFlowNodeOccurrence[],
): boolean {
  return retained.some((entry, index) => retained.some((candidate, candidateIndex) =>
    candidateIndex > index && (
      sameAnchor(entry.anchor, candidate.anchor) ||
      comparePublicId(entry.occurrence.id, candidate.occurrence.id) === 0
    )));
}

function executionPageForBatch(
  state: ExecutionPublicationState,
  batch: ExecutionPublicationState["batches"][number],
): ExecutionPublicationPage {
  return {
    definition: state.definition,
    processId: state.processId,
    processInstanceId: state.processInstanceId,
    requestedAfterRevision: batch.fromRevision,
    pageThroughRevision: batch.throughRevision,
    headRevision: state.headRevision,
    batches: [batch],
    current: state.current,
  };
}

function requireTerminal(
  terminal: SemanticTerminalKind,
): FlowNodeOccurrenceTerminalKind {
  switch (terminal) {
    case SemanticTerminalKind.Completed:
      return FlowNodeOccurrenceTerminalKind.Completed;
    case SemanticTerminalKind.Cancelled:
      return FlowNodeOccurrenceTerminalKind.Cancelled;
    default:
      return assertNever(terminal);
  }
}

function compareUnnumberedStarts(
  left: UnnumberedFlowNodeOccurrenceStart,
  right: UnnumberedFlowNodeOccurrenceStart,
): number {
  return compareAnchors(left.anchor, right.anchor) ||
    compareCanonicalStrings(left.processId, right.processId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    compareScopes(left.owner, right.owner);
}

function compareAnchors(
  left: SemanticFlowNodeOccurrenceAnchor,
  right: SemanticFlowNodeOccurrenceAnchor,
): number {
  const order = {
    [SemanticFlowNodeOccurrenceAnchorKind.Wait]: 0,
    [SemanticFlowNodeOccurrenceAnchorKind.Scope]: 1,
    [SemanticFlowNodeOccurrenceAnchorKind.CallActivity]: 2,
    [SemanticFlowNodeOccurrenceAnchorKind.Transition]: 3,
  } as const;
  const kindOrder = order[left.kind] - order[right.kind];
  if (kindOrder !== 0 || left.kind !== right.kind) {
    return kindOrder;
  }
  switch (left.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
      if (right.kind !== SemanticFlowNodeOccurrenceAnchorKind.Wait) {
        return kindOrder;
      }
      return compareOccurrences(left.id, right.id);
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      if (right.kind !== SemanticFlowNodeOccurrenceAnchorKind.CallActivity) {
        return kindOrder;
      }
      return compareOccurrences(left.id, right.id);
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      if (right.kind !== SemanticFlowNodeOccurrenceAnchorKind.Scope) {
        return kindOrder;
      }
      return compareScopes(left.id, right.id);
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      if (right.kind !== SemanticFlowNodeOccurrenceAnchorKind.Transition) {
        return kindOrder;
      }
      return compareCanonicalStrings(left.commandId, right.commandId) ||
        left.transitionIndex - right.transitionIndex ||
        left.localIndex - right.localIndex;
    default:
      return assertNever(left);
  }
}

function compareOccurrences(
  left: { processInstanceId: string; elementId: string; activation: number },
  right: { processInstanceId: string; elementId: string; activation: number },
): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    left.activation - right.activation;
}

function compareScopes(
  left: ScopeOccurrenceId,
  right: ScopeOccurrenceId,
): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.definitionScopeId, right.definitionScopeId) ||
    left.activation - right.activation;
}

function comparePublicId(
  left: OpenFlowNodeOccurrence["id"],
  right: OpenFlowNodeOccurrence["id"],
): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    left.startRevision - right.startRevision || left.startIndex - right.startIndex;
}

function sameAnchor(
  left: SemanticFlowNodeOccurrenceAnchor,
  right: SemanticFlowNodeOccurrenceAnchor,
): boolean {
  return compareAnchors(left, right) === 0;
}

function sameCurrentOpen(
  left: readonly OpenFlowNodeOccurrence[],
  right: readonly OpenFlowNodeOccurrence[],
): boolean {
  return left.length === right.length && left.every((item, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      comparePublicId(item.id, candidate.id) === 0 &&
      item.processId === candidate.processId &&
      item.elementId === candidate.elementId &&
      compareScopes(item.owner, candidate.owner) === 0 &&
      item.startedAtEpochMs === candidate.startedAtEpochMs;
  });
}

function cloneRetained(
  value: RetainedOpenFlowNodeOccurrence,
): RetainedOpenFlowNodeOccurrence {
  return {
    anchor: cloneAnchor(value.anchor),
    occurrence: cloneOpen(value.occurrence),
    attachedHandlers: value.attachedHandlers.map(cloneActivityHandler),
  };
}

/**
 * Rewrites every retained entry's cached handler list from the committed post-state.
 *
 * The cache exists so the publication completeness relation can pair a firing deadline to its host
 * without an activation ordinal, and the continuation decoder recomputes it from state rather than
 * trusting it. Those two models agree only if the cache tracks the state, so this is the single writer
 * and it runs for every entry on every command.
 *
 * Writing it only when a body opened is what an earlier form did, and it was wrong for a reachable
 * schedule rather than a contrived one: a non-interrupting boundary Timer empties a record's handler
 * list while its host wait stays open, so the stale cache named a withdrawn reminder, the decoder
 * refused a correct publication, and Continue-As-New failed on a legal state.
 *
 * Refreshing after the fold is also what the relation needs. The retained set it reads at one command
 * was written at the end of the previous one, so it is exactly that command's pre-state view, which is
 * the view a firing deadline must be resolved against.
 */
function refreshAttachedHandlers(
  retained: ReadonlyArray<RetainedOpenFlowNodeOccurrence>,
  committed: RuntimeState,
): RetainedOpenFlowNodeOccurrence[] {
  return retained.map((entry) => ({
    ...entry,
    attachedHandlers: attachedHandlersForBodyAnchor(committed, entry.anchor)
      .map(cloneActivityHandler),
  }));
}

function cloneActivityHandler(
  value: ActivityHandlerOccurrence,
): ActivityHandlerOccurrence {
  switch (value.kind) {
    case ActivityHandlerKind.Timer:
      return { kind: value.kind, occurrence: { ...value.occurrence } };
    case ActivityHandlerKind.Message:
      return { kind: value.kind, occurrence: { ...value.occurrence } };
  }
}

function cloneOccurrenceId(value: OccurrenceId): OccurrenceId {
  return {
    processInstanceId: value.processInstanceId,
    elementId: value.elementId,
    activation: value.activation,
  };
}

function toCoreRetained(
  value: RetainedOpenFlowNodeOccurrence,
): RetainedFlowNodeOccurrence {
  return {
    anchor: value.anchor,
    processId: value.occurrence.processId,
    elementId: value.occurrence.elementId,
    owner: value.occurrence.owner,
    attachedHandlers: value.attachedHandlers,
  };
}


function cloneAnchor(
  value: SemanticFlowNodeOccurrenceAnchor,
): SemanticFlowNodeOccurrenceAnchor {
  switch (value.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      return { kind: value.kind, id: { ...value.id } };
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return { kind: value.kind, id: cloneScope(value.id) };
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return {
        kind: value.kind,
        commandId: value.commandId,
        transitionIndex: value.transitionIndex,
        localIndex: value.localIndex,
      };
    default:
      return assertNever(value);
  }
}

function cloneOpen(value: OpenFlowNodeOccurrence): OpenFlowNodeOccurrence {
  return {
    id: { ...value.id },
    processId: value.processId,
    elementId: value.elementId,
    owner: cloneScope(value.owner),
    startedAtEpochMs: value.startedAtEpochMs,
  };
}

function cloneScope(value: ScopeOccurrenceId): ScopeOccurrenceId {
  return { ...value };
}

function sameDefinition(
  left: SemanticProcessIdentity,
  right: SemanticProcessIdentity,
): boolean {
  return left.compiler === right.compiler &&
    left.semanticProfile === right.semanticProfile &&
    left.sourceId === right.sourceId &&
    left.sourceSha256 === right.sourceSha256 &&
    (left.sourceOverlay === null
      ? right.sourceOverlay === null
      : right.sourceOverlay !== null &&
        left.sourceOverlay.id === right.sourceOverlay.id &&
        left.sourceOverlay.sha256 === right.sourceOverlay.sha256);
}

function canonical<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
): boolean {
  return values.every((value, index) =>
    index === 0 || compare(values[index - 1]!, value) < 0);
}

function isSafe(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isNonEmpty(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported flow-node occurrence variant: ${String(value)}`);
}
