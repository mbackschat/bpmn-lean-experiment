import {
  compareCanonicalStrings,
  isSourceOverlayIdentityOrNull,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  ScopeOccurrenceId,
  SemanticProcessIdentity,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import type {
  CommittedTransitionBatch,
  CommittedTransitionRecord,
} from "./semantic-publication.js";
import type {
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrenceEnd,
  FlowNodeOccurrenceId,
  FlowNodeOccurrencePage,
  FlowNodeOccurrencePublicationResult,
  FlowNodeOccurrencePublicationTransportValidationContext,
  FlowNodeOccurrencePublicationValidationContext,
  FlowNodeOccurrenceStart,
  OpenFlowNodeOccurrence,
} from "./flow-node-occurrence-publication.js";
import {
  requireExecutionPublicationPage,
} from "./semantic-publication.js";
import {
  programOccurrenceFactIsValid,
  programOccurrenceStartMatchesTransition,
} from "./flow-node-occurrence-publication-program-validation.js";

export type FlowNodeOccurrencePublicationValidationAuthority =
  | {
      kind: "program";
      context: FlowNodeOccurrencePublicationValidationContext;
    }
  | {
      kind: "transport";
      context: FlowNodeOccurrencePublicationTransportValidationContext;
    };

export function isFlowNodeOccurrencePublicationResult(
  value: unknown,
  authority: FlowNodeOccurrencePublicationValidationAuthority,
): value is FlowNodeOccurrencePublicationResult {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case "available":
      return hasOnlyKeys(value, ["kind", "page"]) &&
        isPage(value.page, authority);
    case "notReady":
    case "notFound":
    case "unavailable":
    case "gap":
      return hasOnlyKeys(value, ["kind"]);
    default:
      return false;
  }
}

function isPage(
  value: unknown,
  authority: FlowNodeOccurrencePublicationValidationAuthority,
): value is FlowNodeOccurrencePage {
  const definition = authority.kind === "program"
    ? authority.context.program.identity
    : authority.context.definition;
  const processId = authority.kind === "program"
    ? authority.context.program.processId
    : authority.context.processId;
  const expectedAfter = authority.context.afterRevision;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "definition",
      "processId",
      "processInstanceId",
      "requestedAfterRevision",
      "pageThroughRevision",
      "headRevision",
      "batches",
      "currentOpen",
    ]) ||
    !sameDefinition(value.definition, definition) ||
    value.processId !== processId ||
    value.processInstanceId !== authority.context.processInstanceId ||
    !isNonEmpty(value.processInstanceId) ||
    !isSafe(value.requestedAfterRevision, 0) ||
    (expectedAfter !== undefined &&
      value.requestedAfterRevision !== expectedAfter) ||
    !isSafe(value.pageThroughRevision, 0) ||
    !isSafe(value.headRevision, 1) ||
    value.requestedAfterRevision > value.pageThroughRevision ||
    value.pageThroughRevision > value.headRevision ||
    !Array.isArray(value.batches)
  ) {
    return false;
  }
  const limit = authority.context.limit ?? 50;
  if (
    !isSafe(limit, 1) ||
    limit > 100 ||
    value.batches.length > limit ||
    ((value.batches.length === 0) !==
      (value.requestedAfterRevision === value.pageThroughRevision)) ||
    ((value.currentOpen !== null) !==
      (value.pageThroughRevision === value.headRevision))
  ) {
    return false;
  }
  if (authority.kind === "program" &&
    (!executionContextIsValid(authority.context) ||
      !alignsWithExecutionPage(value, authority.context.executionPublication))) {
    return false;
  }

  const program = authority.kind === "program"
    ? authority.context.program
    : null;
  const fold = new VisibleOccurrenceFold(Number(value.requestedAfterRevision));
  let cursor = Number(value.requestedAfterRevision);
  let priorTime: number | undefined;
  for (let batchIndex = 0; batchIndex < value.batches.length; batchIndex += 1) {
    const batch = value.batches[batchIndex];
    const executionBatch = authority.kind === "program"
      ? authority.context.executionPublication.batches[batchIndex] ?? null
      : null;
    if (!isBatch(
      batch,
      String(value.processInstanceId),
      program,
      executionBatch,
      cursor,
      priorTime,
      fold,
    )) {
      return false;
    }
    const typed = batch as FlowNodeOccurrenceBatch;
    cursor = typed.throughRevision;
    priorTime = typed.committedAtEpochMs;
  }
  if (cursor !== value.pageThroughRevision) {
    return false;
  }
  return value.currentOpen === null || isCurrentOpen(
    value.currentOpen,
    String(value.processInstanceId),
    Number(value.requestedAfterRevision),
    Number(value.headRevision),
    program,
    fold,
  );
}

function executionContextIsValid(
  context: FlowNodeOccurrencePublicationValidationContext,
): boolean {
  try {
    requireExecutionPublicationPage(context.executionPublication, {
      program: context.program,
      processInstanceId: context.processInstanceId,
      ...(context.afterRevision === undefined
        ? {}
        : { afterRevision: context.afterRevision }),
      ...(context.limit === undefined ? {} : { limit: context.limit }),
    });
    return true;
  } catch {
    return false;
  }
}

function alignsWithExecutionPage(
  occurrence: Record<string, unknown>,
  execution: FlowNodeOccurrencePublicationValidationContext["executionPublication"],
): boolean {
  if (
    !sameDefinition(occurrence.definition, execution.definition) ||
    occurrence.processId !== execution.processId ||
    occurrence.processInstanceId !== execution.processInstanceId ||
    occurrence.requestedAfterRevision !== execution.requestedAfterRevision ||
    occurrence.pageThroughRevision !== execution.pageThroughRevision ||
    occurrence.headRevision !== execution.headRevision ||
    !Array.isArray(occurrence.batches) ||
    occurrence.batches.length !== execution.batches.length ||
    ((occurrence.currentOpen !== null) !== (execution.current !== null))
  ) {
    return false;
  }
  return occurrence.batches.every((candidate, index) => {
    const expected = execution.batches[index];
    return isRecord(candidate) && expected !== undefined &&
      candidate.commandId === expected.commandId &&
      candidate.fromRevision === expected.fromRevision &&
      candidate.throughRevision === expected.throughRevision &&
      Array.isArray(candidate.transitions) &&
      candidate.transitions.length === expected.transitions.length &&
      candidate.transitions.every((record, transitionIndex) =>
        isRecord(record) &&
        record.revision === expected.transitions[transitionIndex]?.revision);
  });
}

function isBatch(
  value: unknown,
  processInstanceId: string,
  program: SemanticProcessProgram | null,
  executionBatch: CommittedTransitionBatch | null,
  expectedFrom: number,
  priorTime: number | undefined,
  fold: VisibleOccurrenceFold,
): value is FlowNodeOccurrenceBatch {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "commandId",
      "fromRevision",
      "throughRevision",
      "committedAtEpochMs",
      "transitions",
    ]) ||
    !isNonEmpty(value.commandId) ||
    value.fromRevision !== expectedFrom ||
    !isSafe(value.throughRevision, 1) ||
    !isSafe(value.committedAtEpochMs, 0) ||
    (priorTime !== undefined && value.committedAtEpochMs < priorTime) ||
    !Array.isArray(value.transitions) ||
    value.transitions.length === 0 ||
    value.throughRevision - expectedFrom !== value.transitions.length
  ) {
    return false;
  }
  for (let index = 0; index < value.transitions.length; index += 1) {
    const transition = value.transitions[index];
    const revision = expectedFrom + index + 1;
    if (
      !isRecord(transition) ||
      !hasOnlyKeys(transition, ["revision", "lifecycle"]) ||
      transition.revision !== revision ||
      !isDelta(
        transition.lifecycle,
        processInstanceId,
        revision,
        Number(value.committedAtEpochMs),
        program,
        executionBatch?.transitions[index] ?? null,
        fold,
      )
    ) {
      return false;
    }
  }
  return true;
}

function isDelta(
  value: unknown,
  processInstanceId: string,
  revision: number,
  committedAtEpochMs: number,
  program: SemanticProcessProgram | null,
  executionTransition: CommittedTransitionRecord | null,
  fold: VisibleOccurrenceFold,
): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["started", "ended"]) ||
    !Array.isArray(value.started) ||
    !Array.isArray(value.ended)
  ) {
    return false;
  }
  const starts: FlowNodeOccurrenceStart[] = [];
  for (let index = 0; index < value.started.length; index += 1) {
    const candidate = value.started[index];
    if (!isStart(
      candidate,
      processInstanceId,
      revision,
      index,
      program,
      executionTransition,
    )) {
      return false;
    }
    starts.push(candidate);
  }
  if (!canonical(starts, (left, right) => compareId(left.id, right.id))) {
    return false;
  }
  const ends: FlowNodeOccurrenceEnd[] = [];
  for (const candidate of value.ended) {
    if (!isEnd(candidate, processInstanceId, revision)) {
      return false;
    }
    ends.push(candidate);
  }
  if (!canonical(ends, (left, right) => compareId(left.id, right.id))) {
    return false;
  }
  return fold.apply(starts, ends, committedAtEpochMs);
}

function isStart(
  value: unknown,
  processInstanceId: string,
  revision: number,
  startIndex: number,
  program: SemanticProcessProgram | null,
  executionTransition: CommittedTransitionRecord | null,
): value is FlowNodeOccurrenceStart {
  return isRecord(value) &&
    hasOnlyKeys(value, ["id", "processId", "elementId", "owner"]) &&
    isId(value.id, processInstanceId) &&
    value.id.startRevision === revision &&
    value.id.startIndex === startIndex &&
    isNonEmpty(value.processId) &&
    isNonEmpty(value.elementId) &&
    isScopeId(value.owner) &&
    (program === null || (
      executionTransition !== null &&
      programOccurrenceStartMatchesTransition(
        value as Record<"processId" | "elementId" | "owner", unknown>,
        program,
        executionTransition,
      )
    ));
}

function isEnd(
  value: unknown,
  processInstanceId: string,
  revision: number,
): value is FlowNodeOccurrenceEnd {
  return isRecord(value) &&
    hasOnlyKeys(value, ["id", "terminal"]) &&
    isId(value.id, processInstanceId) &&
    value.id.startRevision <= revision &&
    (value.terminal === "completed" || value.terminal === "cancelled");
}

function isCurrentOpen(
  value: unknown,
  processInstanceId: string,
  requestedAfterRevision: number,
  headRevision: number,
  program: SemanticProcessProgram | null,
  fold: VisibleOccurrenceFold,
): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  const occurrences: OpenFlowNodeOccurrence[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, [
        "id",
        "processId",
        "elementId",
        "owner",
        "startedAtEpochMs",
      ]) ||
      !isId(candidate.id, processInstanceId) ||
      candidate.id.startRevision > headRevision ||
      !isNonEmpty(candidate.processId) ||
      !isNonEmpty(candidate.elementId) ||
      !isScopeId(candidate.owner) ||
      !isSafe(candidate.startedAtEpochMs, 0) ||
      (program !== null && !programOccurrenceFactIsValid(
        candidate as Record<"processId" | "elementId" | "owner", unknown>,
        program,
      ))
    ) {
      return false;
    }
    occurrences.push(candidate as OpenFlowNodeOccurrence);
  }
  return canonical(occurrences, (left, right) => compareId(left.id, right.id)) &&
    fold.matchesCurrent(occurrences, requestedAfterRevision);
}

class VisibleOccurrenceFold {
  readonly #requestedAfterRevision: number;
  readonly #visibleOpen = new Map<string, OpenFlowNodeOccurrence>();
  readonly #visibleEnded = new Set<string>();
  readonly #allVisibleStarts = new Set<string>();

  constructor(requestedAfterRevision: number) {
    this.#requestedAfterRevision = requestedAfterRevision;
  }

  apply(
    starts: readonly FlowNodeOccurrenceStart[],
    ends: readonly FlowNodeOccurrenceEnd[],
    committedAtEpochMs: number,
  ): boolean {
    for (const start of starts) {
      const key = idKey(start.id);
      if (this.#allVisibleStarts.has(key) || this.#visibleEnded.has(key)) {
        return false;
      }
      this.#allVisibleStarts.add(key);
      this.#visibleOpen.set(key, {
        ...start,
        startedAtEpochMs: committedAtEpochMs,
      });
    }
    for (const end of ends) {
      const key = idKey(end.id);
      if (this.#visibleEnded.has(key)) {
        return false;
      }
      const visible = this.#visibleOpen.delete(key);
      if (!visible && (
        this.#requestedAfterRevision === 0 ||
        end.id.startRevision > this.#requestedAfterRevision
      )) {
        return false;
      }
      this.#visibleEnded.add(key);
    }
    return true;
  }

  matchesCurrent(
    current: readonly OpenFlowNodeOccurrence[],
    requestedAfterRevision: number,
  ): boolean {
    const currentById = new Map<string, OpenFlowNodeOccurrence>();
    for (const occurrence of current) {
      const key = idKey(occurrence.id);
      if (currentById.has(key) || this.#visibleEnded.has(key)) {
        return false;
      }
      currentById.set(key, occurrence);
      const expected = this.#visibleOpen.get(key);
      if (expected !== undefined && !sameOpen(expected, occurrence)) {
        return false;
      }
      if (expected === undefined && occurrence.id.startRevision > requestedAfterRevision) {
        return false;
      }
    }
    return [...this.#visibleOpen.keys()].every((key) => currentById.has(key));
  }
}

function isId(
  value: unknown,
  processInstanceId: string,
): value is FlowNodeOccurrenceId {
  return isRecord(value) &&
    hasOnlyKeys(value, ["processInstanceId", "startRevision", "startIndex"]) &&
    value.processInstanceId === processInstanceId &&
    isNonEmpty(value.processInstanceId) &&
    isSafe(value.startRevision, 1) &&
    isSafe(value.startIndex, 0);
}

function isScopeId(value: unknown): value is ScopeOccurrenceId {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "processInstanceId",
      "definitionScopeId",
      "activation",
    ]) &&
    isNonEmpty(value.processInstanceId) &&
    isNonEmpty(value.definitionScopeId) &&
    isSafe(value.activation, 1);
}

function sameDefinition(
  value: unknown,
  expected: SemanticProcessIdentity,
): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "compiler",
      "semanticProfile",
      "sourceId",
      "sourceSha256",
      "sourceOverlay",
    ]) &&
    value.compiler === expected.compiler &&
    value.semanticProfile === expected.semanticProfile &&
    value.sourceId === expected.sourceId &&
    value.sourceSha256 === expected.sourceSha256 &&
    isSourceOverlayIdentityOrNull(value.sourceOverlay) &&
    sameOverlay(value.sourceOverlay, expected.sourceOverlay);
}

function sameOverlay(
  left: SemanticProcessIdentity["sourceOverlay"],
  right: SemanticProcessIdentity["sourceOverlay"],
): boolean {
  return left === null
    ? right === null
    : right !== null && left.id === right.id && left.sha256 === right.sha256;
}

function compareId(
  left: FlowNodeOccurrenceId,
  right: FlowNodeOccurrenceId,
): number {
  return compareCanonicalStrings(
    left.processInstanceId,
    right.processInstanceId,
  ) || left.startRevision - right.startRevision || left.startIndex - right.startIndex;
}

function canonical<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
): boolean {
  return values.every((value, index) =>
    index === 0 || compare(values[index - 1]!, value) < 0);
}

function sameOpen(
  left: OpenFlowNodeOccurrence,
  right: OpenFlowNodeOccurrence,
): boolean {
  return compareId(left.id, right.id) === 0 &&
    left.processId === right.processId &&
    left.elementId === right.elementId &&
    compareScope(left.owner, right.owner) === 0 &&
    left.startedAtEpochMs === right.startedAtEpochMs;
}

function compareScope(
  left: ScopeOccurrenceId,
  right: ScopeOccurrenceId,
): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.definitionScopeId, right.definitionScopeId) ||
    left.activation - right.activation;
}

function idKey(value: FlowNodeOccurrenceId): string {
  return `${value.processInstanceId.length}:${value.processInstanceId}:${value.startRevision}:${value.startIndex}`;
}

function isSafe(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isNonEmpty(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}
