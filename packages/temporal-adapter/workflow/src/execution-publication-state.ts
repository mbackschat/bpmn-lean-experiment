import {
  ScenarioStepKind,
  isWellFormedWireString,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  PublicControlTokenPosition,
  PublicScopePosition,
  ScenarioStep,
  SemanticProcessIdentity,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  requireExecutionPublicationPage,
} from "@bpmn-lean/temporal-protocol";
import type {
  CommittedTransitionBatch,
  CommittedTransitionRecord,
  CurrentCommittedExecution,
} from "@bpmn-lean/temporal-protocol";

export type ExecutionPublicationState = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  headRevision: number;
  batches: CommittedTransitionBatch[];
  current: CurrentCommittedExecution | null;
}>;

/** Creates the empty revision-zero publication beside, but outside, semantic RuntimeState. */
export function createExecutionPublicationState(
  program: SemanticProcessProgram,
  processInstanceId: string,
): ExecutionPublicationState {
  if (
    processInstanceId.length === 0 ||
    !isWellFormedWireString(processInstanceId)
  ) {
    throw new TypeError("execution publication Process instance ID must be nonempty");
  }
  return {
    definition: program.identity,
    processId: program.processId,
    processInstanceId,
    headRevision: 0,
    batches: [],
    current: null,
  };
}

/**
 * Numbers one complete evaluator publication only after the semantic step has
 * reached a committed stable state. Noncommitted steps leave the accumulator exact.
 */
export function accumulateExecutionPublication(
  program: SemanticProcessProgram,
  state: ExecutionPublicationState,
  stimulus: Stimulus,
  step: ScenarioStep,
): ExecutionPublicationState {
  switch (step.kind) {
    case ScenarioStepKind.Terminal:
    case ScenarioStepKind.HarnessFailure:
      return state;
    case ScenarioStepKind.Committed:
      return appendCommittedPublication(program, state, stimulus, step.publication);
    default:
      return assertNever(step);
  }
}

function appendCommittedPublication(
  program: SemanticProcessProgram,
  state: ExecutionPublicationState,
  stimulus: Stimulus,
  publication: Extract<ScenarioStep, { kind: ScenarioStepKind.Committed }>["publication"],
): ExecutionPublicationState {
  if (publication === null) {
    throw new TypeError(
      "committed semantic step has no publishable trace",
    );
  }
  requireAccumulatorIdentity(program, state);
  const fromRevision = state.headRevision;
  const throughRevision = fromRevision + publication.transitions.length;
  if (!Number.isSafeInteger(throughRevision) || throughRevision <= fromRevision) {
    throw new RangeError("execution publication revision range is exhausted");
  }
  const transitions = publication.transitions.map((record, index) => ({
    revision: fromRevision + index + 1,
    logicalTimeMs: record.logicalTimeMs,
    transition: record.transition,
    positionDelta: record.positionDelta,
  }));
  const first = transitions[0];
  if (first === undefined) {
    throw new TypeError("committed semantic publication must be nonempty");
  }
  const batch: CommittedTransitionBatch = {
    commandId: stimulusCommandId(stimulus),
    fromRevision,
    throughRevision,
    transitions: [first, ...transitions.slice(1)],
  };
  const current: CurrentCommittedExecution = {
    revision: throughRevision,
    state: publication.current.state,
    controlTokens: publication.current.controlTokens,
    scopes: publication.current.scopes,
  };
  const folded = requirePublicationContinuity(state, transitions);
  requireExactCurrentPositions(folded, publication.current);
  requireExactCurrentPositions(folded, current);
  const candidate: ExecutionPublicationState = {
    definition: state.definition,
    processId: state.processId,
    processInstanceId: state.processInstanceId,
    headRevision: throughRevision,
    batches: [...state.batches, batch],
    current,
  };
  requireExecutionPublicationPage({
    definition: candidate.definition,
    processId: candidate.processId,
    processInstanceId: candidate.processInstanceId,
    requestedAfterRevision: fromRevision,
    pageThroughRevision: throughRevision,
    headRevision: throughRevision,
    batches: [batch],
    current,
  }, {
    program,
    processInstanceId: state.processInstanceId,
    afterRevision: fromRevision,
    limit: 1,
  });
  return candidate;
}

type FoldedPublicPositions = Readonly<{
  controlTokens: ReadonlyArray<PublicControlTokenPosition>;
  scopes: ReadonlyArray<PublicScopePosition>;
}>;

function requirePublicationContinuity(
  state: ExecutionPublicationState,
  transitions: ReadonlyArray<CommittedTransitionRecord>,
): FoldedPublicPositions {
  const prior = state.current;
  if (
    (state.headRevision === 0) !== (prior === null) ||
    (prior !== null && prior.revision !== state.headRevision)
  ) {
    throw new TypeError("execution publication accumulator current drifted");
  }
  const first = transitions[0];
  if (
    first === undefined ||
    (prior !== null && first.logicalTimeMs < prior.state.logicalTimeMs)
  ) {
    throw new TypeError("publication logical time precedes its accumulated head");
  }
  const controlTokens = prior === null ? [] : [...prior.controlTokens];
  const scopes = prior === null ? [] : [...prior.scopes];
  for (const { positionDelta } of transitions) {
    if (!applyPositionDelta(controlTokens, scopes, positionDelta)) {
      throw new TypeError(
        "publication position delta does not reach its current positions",
      );
    }
  }
  return { controlTokens, scopes };
}

function applyPositionDelta(
  controlTokens: PublicControlTokenPosition[],
  scopes: PublicScopePosition[],
  delta: CommittedTransitionRecord["positionDelta"],
): boolean {
  for (const scope of delta.enteredScopes) {
    if (scopes.some(({ id }) => sameScopeOccurrence(id, scope.id))) {
      return false;
    }
    scopes.push(scope);
  }
  for (const consumed of delta.consumedTokens) {
    const existing = controlTokens.find((token) => sameTokenPosition(token, consumed));
    if (existing === undefined || existing.multiplicity < consumed.multiplicity) {
      return false;
    }
    const remaining = existing.multiplicity - consumed.multiplicity;
    controlTokens.splice(controlTokens.indexOf(existing), 1);
    if (remaining > 0) {
      controlTokens.push({ ...existing, multiplicity: remaining });
    }
  }
  for (const produced of delta.producedTokens) {
    if (!scopes.some(({ id }) => sameScopeOccurrence(id, produced.owner))) {
      return false;
    }
    const existing = controlTokens.find((token) => sameTokenPosition(token, produced));
    if (existing === undefined) {
      controlTokens.push(produced);
      continue;
    }
    const multiplicity = existing.multiplicity + produced.multiplicity;
    if (!Number.isSafeInteger(multiplicity)) {
      return false;
    }
    controlTokens.splice(
      controlTokens.indexOf(existing),
      1,
      { ...existing, multiplicity },
    );
  }
  for (const exited of delta.exitedScopes) {
    const existing = scopes.find(({ id }) => sameScopeOccurrence(id, exited.id));
    if (
      existing === undefined ||
      controlTokens.some(({ owner }) => sameScopeOccurrence(owner, exited.id))
    ) {
      return false;
    }
    scopes.splice(scopes.indexOf(existing), 1);
  }
  return true;
}

function requireExactCurrentPositions(
  folded: FoldedPublicPositions,
  current: FoldedPublicPositions,
): void {
  if (
    !sameSet(
      folded.controlTokens,
      current.controlTokens,
      sameTokenWithMultiplicity,
    ) ||
    !sameSet(folded.scopes, current.scopes, sameScopePosition)
  ) {
    throw new TypeError(
      "publication position delta does not reach its current positions",
    );
  }
}

function sameTokenPosition(
  left: PublicControlTokenPosition,
  right: PublicControlTokenPosition,
): boolean {
  return left.sequenceFlowId === right.sequenceFlowId &&
    sameScopeOccurrence(left.owner, right.owner);
}

function sameTokenWithMultiplicity(
  left: PublicControlTokenPosition,
  right: PublicControlTokenPosition,
): boolean {
  return sameTokenPosition(left, right) && left.multiplicity === right.multiplicity;
}

function sameScopePosition(
  left: PublicScopePosition,
  right: PublicScopePosition,
): boolean {
  return sameScopeOccurrence(left.id, right.id) &&
    left.bpmnElementId === right.bpmnElementId &&
    ((left.parent === null && right.parent === null) ||
      (left.parent !== null && right.parent !== null &&
        sameScopeOccurrence(left.parent, right.parent)));
}

function sameScopeOccurrence(
  left: PublicScopePosition["id"],
  right: PublicScopePosition["id"],
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.definitionScopeId === right.definitionScopeId &&
    left.activation === right.activation;
}

function sameSet<T>(
  left: ReadonlyArray<T>,
  right: ReadonlyArray<T>,
  same: (left: T, right: T) => boolean,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const unmatched = [...right];
  for (const item of left) {
    const match = unmatched.findIndex((candidate) => same(item, candidate));
    if (match < 0) {
      return false;
    }
    unmatched.splice(match, 1);
  }
  return unmatched.length === 0;
}

function requireAccumulatorIdentity(
  program: SemanticProcessProgram,
  state: ExecutionPublicationState,
): void {
  if (
    state.processId !== program.processId ||
    state.definition.compiler !== program.identity.compiler ||
    state.definition.semanticProfile !== program.identity.semanticProfile ||
    state.definition.sourceId !== program.identity.sourceId ||
    state.definition.sourceSha256 !== program.identity.sourceSha256 ||
    !sameOverlay(state.definition.sourceOverlay, program.identity.sourceOverlay)
  ) {
    throw new TypeError("execution publication accumulator identity drifted");
  }
}

function sameOverlay(
  left: SemanticProcessIdentity["sourceOverlay"],
  right: SemanticProcessIdentity["sourceOverlay"],
): boolean {
  return left === null
    ? right === null
    : right !== null && left.id === right.id && left.sha256 === right.sha256;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported publication step: ${String(value)}`);
}
