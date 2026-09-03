/** Independent Program/anchor reconstruction for the exact Compensation checkpoint's E1 batches. */
import { EffectExecutionResultKind } from "./contract.js";
import type { CompleteEffectStimulus, OccurrenceId } from "./contract.js";
import type {
  CompensationSubjectDefinition,
} from "./compensation-trigger-handler-contract.js";
import {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
} from "./flow-node-occurrence-lifecycle.js";
import type {
  UnnumberedFlowNodeOccurrenceEnd,
  UnnumberedFlowNodeOccurrenceStart,
} from "./flow-node-occurrence-lifecycle.js";
import type { OpenOccurrence } from "./flow-node-occurrence-publication-external-completeness.js";
import type {
  SemanticProcessProgram,
  TriggerCompensationOperation,
} from "./semantic-process-contract.js";
import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
} from "./semantic-profile-catalog.js";
import { sameScopeOccurrence } from "./semantic-process-state.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";

export type CompensationCompletenessPieces = Readonly<{
  starts: UnnumberedFlowNodeOccurrenceStart[];
  ends: UnnumberedFlowNodeOccurrenceEnd[];
  instants: Array<Omit<UnnumberedFlowNodeOccurrenceStart, "anchor">>;
}>;

/** Reconstructs either zero-subject instant continuation or the exact initial maximal frontier. */
export function compensationTriggerCompletenessPieces(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  operation: TriggerCompensationOperation,
  owner: ScopeOccurrenceId,
  supplied: Readonly<{ started: readonly UnnumberedFlowNodeOccurrenceStart[] }>,
): CompensationCompletenessPieces {
  requireCheckpointProfile(program);
  const declaration = program.compensationExecution;
  const triggers = startsOfKind(
    supplied.started,
    SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger,
  );
  const alreadyActive = open.some((entry) =>
    entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger &&
    sameScopeOccurrence(entry.owner, owner)
  );
  if (
    declaration === undefined ||
    declaration.triggerOperationId !== operation.id
  ) failCompleteness();
  if (declaration.subjects.length === 0) {
    if (triggers.length !== 0 || alreadyActive) failCompleteness();
    return pieces([], [], [{
      processId: requireProcessId(program, owner),
      elementId: operation.origin.elementId,
      owner,
    }]);
  }
  if (
    triggers.length !== 1 ||
    alreadyActive
  ) failCompleteness();
  const trigger = triggers[0]!;
  requireOccurrenceStart(
    trigger,
    owner,
    requireProcessId(program, owner),
    operation.origin.elementId,
    operation.id,
  );
  const frontierIds = declaration.subjects.map((subject) =>
    subjectDefinitionId(program, subject)
  ).filter((elementId) =>
    !declaration.dependencies.some(({ predecessorElementId }) =>
      predecessorElementId === elementId
    )
  );
  const frontier = frontierIds.map((elementId) =>
    requireSubjectById(program, elementId)
  );
  const handlers = requireHandlerStarts(program, supplied.started, frontier, owner);
  const waits = requireDistinctWaitStarts(
    supplied.started,
    frontier,
    owner,
    requireProcessId(program, owner),
  );
  return pieces([trigger, ...handlers, ...waits]);
}

/** Reconstructs one handler completion, dependency unlock, or fail-fast sibling cancellation. */
export function compensationCompletionCompletenessPieces(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  stimulus: CompleteEffectStimulus,
  supplied: Readonly<{ started: readonly UnnumberedFlowNodeOccurrenceStart[] }>,
): CompensationCompletenessPieces | null {
  const declaration = program.compensationExecution;
  if (declaration === undefined) return null;
  requireCheckpointProfile(program);
  const matchingSubjects = declaration.subjects.filter(({ body }) =>
    body.effectElementId === stimulus.effectId.elementId
  );
  if (matchingSubjects.length === 0) return null;
  const subject = requireUnique(matchingSubjects);
  const handlers = open.filter((entry) =>
    entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler &&
    entry.elementId === subject.body.handlerElementId &&
    entry.anchor.id.processInstanceId === stimulus.effectId.processInstanceId
  );
  if (handlers.length === 0) return null;
  const handler = requireUnique(handlers);
  if (
    !safePositive(stimulus.effectId.activation) ||
    handler.processId !== requireProcessId(program, handler.owner)
  ) failCompleteness();
  const trigger = requireUnique(open.filter((entry) =>
    entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger &&
    sameScopeOccurrence(entry.owner, handler.owner)
  ));
  const selectedEnds = handlerEnds(open, handler, subject);

  if (stimulus.result.kind === EffectExecutionResultKind.BpmnError) {
    const activeHandlers = open.filter((entry) =>
      entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler &&
      sameScopeOccurrence(entry.owner, handler.owner)
    );
    return pieces([], [
      end(trigger, FlowNodeOccurrenceTerminalKind.Cancelled),
      ...activeHandlers.flatMap((entry) => {
        const activeSubject = requireSubjectByHandler(program, entry.elementId);
        return handlerEnds(open, entry, activeSubject).map((terminal) => ({
          ...terminal,
          terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
        }));
      }),
    ]);
  }

  const selectedId = subjectDefinitionId(program, subject);
  const remainingIds = open.filter((entry) =>
    entry !== handler &&
    entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler &&
    sameScopeOccurrence(entry.owner, handler.owner)
  ).map((entry) => subjectDefinitionId(
    program,
    requireSubjectByHandler(program, entry.elementId),
  ));
  const unlockedIds = declaration.dependencies
    .filter(({ successorElementId }) => successorElementId === selectedId)
    .map(({ predecessorElementId }) => predecessorElementId)
    .filter((candidate, index, candidates) =>
      candidates.indexOf(candidate) === index &&
      !declaration.dependencies.some(({ predecessorElementId, successorElementId }) =>
        predecessorElementId === candidate && remainingIds.includes(successorElementId)
      )
    );
  const unlocked = unlockedIds.map((elementId) =>
    requireSubjectById(program, elementId)
  );
  const starts = requireHandlerStarts(program, supplied.started, unlocked, handler.owner);
  const waits = requireDistinctWaitStarts(
    supplied.started,
    unlocked,
    handler.owner,
    handler.processId,
  );
  const triggerEnds = remainingIds.length === 0 && unlocked.length === 0
    ? [end(trigger, FlowNodeOccurrenceTerminalKind.Completed)]
    : [];
  return pieces(
    [...starts, ...waits],
    [
      ...selectedEnds.map((terminal) => ({
        ...terminal,
        terminal: FlowNodeOccurrenceTerminalKind.Completed,
      })),
      ...triggerEnds,
    ],
  );
}

function requireHandlerStarts(
  program: SemanticProcessProgram,
  supplied: readonly UnnumberedFlowNodeOccurrenceStart[],
  subjects: readonly CompensationSubjectDefinition[],
  owner: ScopeOccurrenceId,
): UnnumberedFlowNodeOccurrenceStart[] {
  const starts = startsOfKind(
    supplied,
    SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler,
  );
  if (starts.length !== subjects.length) failCompleteness();
  return subjects.map((subject) => {
    const start = requireUnique(starts.filter(({ elementId }) =>
      elementId === subject.body.handlerElementId
    ));
    requireOccurrenceStart(
      start,
      owner,
      requireProcessId(program, owner),
      subject.body.handlerElementId,
      subject.body.handlerElementId,
    );
    return start;
  });
}

function requireDistinctWaitStarts(
  supplied: readonly UnnumberedFlowNodeOccurrenceStart[],
  subjects: readonly CompensationSubjectDefinition[],
  owner: ScopeOccurrenceId,
  processId: string,
): UnnumberedFlowNodeOccurrenceStart[] {
  const expected = subjects.filter(({ body }) =>
    body.effectElementId !== body.handlerElementId
  );
  const waits = startsOfKind(supplied, SemanticFlowNodeOccurrenceAnchorKind.Wait);
  if (waits.length !== expected.length) failCompleteness();
  return expected.map((subject) => {
    const wait = requireUnique(waits.filter(({ elementId }) =>
      elementId === subject.body.effectElementId
    ));
    requireOccurrenceStart(
      wait,
      owner,
      processId,
      subject.body.effectElementId,
      subject.body.effectElementId,
    );
    return wait;
  });
}

function handlerEnds(
  open: readonly OpenOccurrence[],
  handler: OpenOccurrence,
  subject: CompensationSubjectDefinition,
): UnnumberedFlowNodeOccurrenceEnd[] {
  const terminals = [end(handler, FlowNodeOccurrenceTerminalKind.Completed)];
  if (subject.body.effectElementId === subject.body.handlerElementId) {
    return terminals;
  }
  const wait = requireUnique(open.filter((entry) =>
    entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
    entry.elementId === subject.body.effectElementId &&
    sameScopeOccurrence(entry.owner, handler.owner)
  ));
  return [...terminals, end(wait, FlowNodeOccurrenceTerminalKind.Completed)];
}

function requireSubjectById(
  program: SemanticProcessProgram,
  elementId: string,
): CompensationSubjectDefinition {
  return requireUnique((program.compensationExecution?.subjects ?? []).filter((subject) =>
    subjectDefinitionId(program, subject) === elementId
  ));
}

function requireSubjectByHandler(
  program: SemanticProcessProgram,
  handlerElementId: string,
): CompensationSubjectDefinition {
  return requireUnique((program.compensationExecution?.subjects ?? []).filter(({ body }) =>
    body.handlerElementId === handlerElementId
  ));
}

function subjectDefinitionId(
  program: SemanticProcessProgram,
  subject: CompensationSubjectDefinition,
): string {
  const elementId = subject.kind === "boundaryActivity"
    ? subject.subjectElementId
    : program.definitionScopes.find(({ id }) => id === subject.parentScopeId)
      ?.originElementId;
  return elementId ?? failCompleteness();
}

function requireOccurrenceStart(
  start: UnnumberedFlowNodeOccurrenceStart,
  owner: ScopeOccurrenceId,
  processId: string,
  elementId: string,
  anchorElementId: string,
): void {
  if (
    !("id" in start.anchor) ||
    !("elementId" in start.anchor.id) ||
    start.anchor.id.processInstanceId !== owner.processInstanceId ||
    start.anchor.id.elementId !== anchorElementId ||
    !safePositive(start.anchor.id.activation) ||
    start.processId !== processId ||
    start.elementId !== elementId ||
    !sameScopeOccurrence(start.owner, owner)
  ) failCompleteness();
}

function startsOfKind<K extends SemanticFlowNodeOccurrenceAnchorKind>(
  starts: readonly UnnumberedFlowNodeOccurrenceStart[],
  kind: K,
): Array<UnnumberedFlowNodeOccurrenceStart & {
  anchor: Extract<UnnumberedFlowNodeOccurrenceStart["anchor"], { kind: K }>;
}> {
  return starts.filter((start): start is UnnumberedFlowNodeOccurrenceStart & {
    anchor: Extract<UnnumberedFlowNodeOccurrenceStart["anchor"], { kind: K }>;
  } => start.anchor.kind === kind);
}

function end(
  entry: OpenOccurrence,
  terminal: FlowNodeOccurrenceTerminalKind,
): UnnumberedFlowNodeOccurrenceEnd {
  return { anchor: entry.anchor, terminal };
}

function pieces(
  starts: UnnumberedFlowNodeOccurrenceStart[] = [],
  ends: UnnumberedFlowNodeOccurrenceEnd[] = [],
  instants: Array<Omit<UnnumberedFlowNodeOccurrenceStart, "anchor">> = [],
): CompensationCompletenessPieces {
  return { starts, ends, instants };
}

function requireProcessId(
  program: SemanticProcessProgram,
  owner: ScopeOccurrenceId,
): string {
  let definition = program.definitionScopes.find(({ id }) =>
    id === owner.definitionScopeId
  );
  const visited = new Set<string>();
  while (definition?.parentScopeId !== null) {
    if (definition === undefined || visited.has(definition.id)) failCompleteness();
    visited.add(definition.id);
    definition = program.definitionScopes.find(({ id }) =>
      id === definition?.parentScopeId
    );
  }
  return definition?.originElementId ?? failCompleteness();
}

function requireCheckpointProfile(program: SemanticProcessProgram): void {
  if (
    program.identity.semanticProfile !==
      COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID
  ) failCompleteness();
}

function safePositive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function requireUnique<T>(values: readonly T[]): T {
  if (values.length !== 1) failCompleteness();
  return values[0]!;
}

function failCompleteness(): never {
  throw new TypeError(
    "semantic flow-node publication is not a complete lifecycle of its E1 transition",
  );
}
