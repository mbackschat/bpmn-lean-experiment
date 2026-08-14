import {
  ScenarioStepKind,
  isWellFormedWireString,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
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
