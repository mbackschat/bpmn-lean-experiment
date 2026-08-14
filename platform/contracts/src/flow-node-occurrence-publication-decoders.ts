import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
  requireString,
} from "./decoder-primitives.js";
import {
  FlowNodeOccurrencePublicationResultKind,
  FlowNodeOccurrenceTerminalKind,
} from "./flow-node-occurrence-publications.js";
import type {
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrenceEnd,
  FlowNodeOccurrenceId,
  FlowNodeOccurrencePage,
  FlowNodeOccurrencePublicationDecodeContext,
  FlowNodeOccurrencePublicationDefinitionIdentity,
  FlowNodeOccurrencePublicationRequest,
  FlowNodeOccurrencePublicationResult,
  FlowNodeOccurrenceScopeId,
  FlowNodeOccurrenceStart,
  OpenFlowNodeOccurrence,
} from "./flow-node-occurrence-publications.js";
import {
  compareFlowNodeCanonicalStrings,
  isDenseFlowNodeArray,
} from "./flow-node-publication-decoder-primitives.js";

const defaultLimit = 50;
const maximumLimit = 100;
const lowercaseSha256 = /^[0-9a-f]{64}$/u;

export function decodeFlowNodeOccurrencePublicationRequest(
  value: unknown,
): FlowNodeOccurrencePublicationRequest {
  requireObject(value, "flow-node occurrence publication request");
  const hasLimit = Object.hasOwn(value, "limit");
  exact(value, "flow-node occurrence publication request", hasLimit
    ? ["afterRevision", "limit"]
    : ["afterRevision"]);
  return {
    afterRevision: requireNonnegativeSafeInteger(
      readOwn(value, "afterRevision"),
      "flow-node occurrence publication request.afterRevision",
    ),
    ...(hasLimit
      ? { limit: requirePublicationLimit(readOwn(value, "limit")) }
      : {}),
  };
}

export function decodeFlowNodeOccurrencePublicationPage(
  value: unknown,
  context: FlowNodeOccurrencePublicationDecodeContext,
): FlowNodeOccurrencePage {
  requireContext(context);
  requirePage(value, context);
  return value as FlowNodeOccurrencePage;
}

export function decodeFlowNodeOccurrencePublicationResult(
  value: unknown,
  context: FlowNodeOccurrencePublicationDecodeContext,
): FlowNodeOccurrencePublicationResult {
  requireContext(context);
  requireObject(value, "flow-node occurrence publication result");
  switch (readOwn(value, "kind")) {
    case FlowNodeOccurrencePublicationResultKind.Available:
      exact(value, "available flow-node occurrence publication result", ["kind", "page"]);
      requirePage(readOwn(value, "page"), context);
      return value as FlowNodeOccurrencePublicationResult;
    case FlowNodeOccurrencePublicationResultKind.NotReady:
    case FlowNodeOccurrencePublicationResultKind.NotFound:
    case FlowNodeOccurrencePublicationResultKind.Unavailable:
    case FlowNodeOccurrencePublicationResultKind.Gap:
      exact(value, "flow-node occurrence publication result", ["kind"]);
      return value as FlowNodeOccurrencePublicationResult;
    default:
      throw new TypeError("flow-node occurrence publication result has an unknown kind");
  }
}

function requirePage(
  value: unknown,
  context: FlowNodeOccurrencePublicationDecodeContext,
): void {
  requireObject(value, "flow-node occurrence publication page");
  exact(value, "flow-node occurrence publication page", [
    "definition",
    "processId",
    "processInstanceId",
    "requestedAfterRevision",
    "pageThroughRevision",
    "headRevision",
    "batches",
    "currentOpen",
  ]);
  const definition = requireDefinition(
    readOwn(value, "definition"),
    "flow-node occurrence publication definition identity",
  );
  if (!sameDefinition(definition, context.definition)) {
    throw new TypeError(
      "flow-node occurrence publication definition identity does not match the expected definition identity",
    );
  }
  requireEqualString(readOwn(value, "processId"), context.processId, "Process identity");
  requireEqualString(
    readOwn(value, "processInstanceId"),
    context.processInstanceId,
    "Process-instance identity",
  );
  const requested = requireNonnegativeSafeInteger(
    readOwn(value, "requestedAfterRevision"),
    "flow-node occurrence publication page.requestedAfterRevision",
  );
  if (requested !== context.afterRevision) {
    throw new TypeError("flow-node occurrence publication page cursor does not match the request");
  }
  const through = requireNonnegativeSafeInteger(
    readOwn(value, "pageThroughRevision"),
    "flow-node occurrence publication page.pageThroughRevision",
  );
  const head = requirePositiveSafeInteger(
    readOwn(value, "headRevision"),
    "flow-node occurrence publication page.headRevision",
  );
  if (requested > through || through > head) {
    throw new TypeError("flow-node occurrence publication page range is inconsistent");
  }
  const batches = readOwn(value, "batches");
  if (!isDenseFlowNodeArray(batches)) {
    throw new TypeError("flow-node occurrence publication page.batches must be a dense array");
  }
  const limit = context.limit ?? defaultLimit;
  requirePublicationLimit(limit);
  if (batches.length > limit) {
    throw new TypeError("flow-node occurrence publication page exceeds the requested batch limit");
  }
  if ((batches.length === 0) !== (requested === through)) {
    throw new TypeError("flow-node occurrence publication page batch count contradicts its range");
  }
  const fold = new VisibleOccurrenceFold(requested);
  let cursor = requested;
  let priorTime: number | undefined;
  batches.forEach((batch, index) => {
    const checked = requireBatch(
      batch,
      context.processInstanceId,
      cursor,
      priorTime,
      fold,
      `flow-node occurrence publication page.batches[${index}]`,
    );
    cursor = checked.throughRevision;
    priorTime = checked.committedAtEpochMs;
  });
  if (cursor !== through) {
    throw new TypeError("flow-node occurrence publication batches do not reach pageThroughRevision");
  }
  const currentOpen = readOwn(value, "currentOpen");
  if ((currentOpen !== null) !== (through === head)) {
    throw new TypeError("flow-node occurrence publication currentOpen presence does not match the head range");
  }
  if (currentOpen !== null) {
    requireCurrentOpen(
      currentOpen,
      context.processInstanceId,
      requested,
      head,
      fold,
    );
  }
}

function requireBatch(
  value: unknown,
  processInstanceId: string,
  expectedFrom: number,
  priorTime: number | undefined,
  fold: VisibleOccurrenceFold,
  label: string,
): FlowNodeOccurrenceBatch {
  requireObject(value, label);
  exact(value, label, [
    "commandId",
    "fromRevision",
    "throughRevision",
    "committedAtEpochMs",
    "transitions",
  ]);
  requireNonemptyString(readOwn(value, "commandId"), `${label}.commandId`);
  const from = requireNonnegativeSafeInteger(readOwn(value, "fromRevision"), `${label}.fromRevision`);
  const through = requirePositiveSafeInteger(readOwn(value, "throughRevision"), `${label}.throughRevision`);
  const committedAt = requireNonnegativeSafeInteger(
    readOwn(value, "committedAtEpochMs"),
    `${label}.committedAtEpochMs`,
  );
  if (from !== expectedFrom) throw new TypeError(`${label}.fromRevision is not contiguous`);
  if (priorTime !== undefined && committedAt < priorTime) {
    throw new TypeError(`${label}.committedAtEpochMs regresses`);
  }
  const transitions = readOwn(value, "transitions");
  if (!isDenseFlowNodeArray(transitions) || transitions.length === 0) {
    throw new TypeError(`${label}.transitions must be a nonempty dense array`);
  }
  if (through - from !== transitions.length) {
    throw new TypeError(`${label} range does not equal its transition count`);
  }
  transitions.forEach((transition, index) => requireTransition(
    transition,
    processInstanceId,
    from + index + 1,
    committedAt,
    fold,
    `${label}.transitions[${index}]`,
  ));
  return value as FlowNodeOccurrenceBatch;
}

function requireTransition(
  value: unknown,
  processInstanceId: string,
  expectedRevision: number,
  committedAtEpochMs: number,
  fold: VisibleOccurrenceFold,
  label: string,
): void {
  requireObject(value, label);
  exact(value, label, ["revision", "lifecycle"]);
  if (requirePositiveSafeInteger(readOwn(value, "revision"), `${label}.revision`) !== expectedRevision) {
    throw new TypeError(`${label}.revision is not contiguous`);
  }
  const lifecycle = readOwn(value, "lifecycle");
  requireObject(lifecycle, `${label}.lifecycle`);
  exact(lifecycle, `${label}.lifecycle`, ["started", "ended"]);
  const startedValues = readOwn(lifecycle, "started");
  const endedValues = readOwn(lifecycle, "ended");
  if (!isDenseFlowNodeArray(startedValues) || !isDenseFlowNodeArray(endedValues)) {
    throw new TypeError(`${label}.lifecycle collections must be dense arrays`);
  }
  const started = startedValues.map((candidate, index) => requireStart(
    candidate,
    processInstanceId,
    expectedRevision,
    index,
    `${label}.lifecycle.started[${index}]`,
  ));
  requireCanonical(started, (left, right) => compareId(left.id, right.id), `${label}.lifecycle.started`);
  const ended = endedValues.map((candidate, index) => requireEnd(
    candidate,
    processInstanceId,
    expectedRevision,
    `${label}.lifecycle.ended[${index}]`,
  ));
  requireCanonical(ended, (left, right) => compareId(left.id, right.id), `${label}.lifecycle.ended`);
  fold.apply(started, ended, committedAtEpochMs);
}

function requireStart(
  value: unknown,
  processInstanceId: string,
  revision: number,
  startIndex: number,
  label: string,
): FlowNodeOccurrenceStart {
  requireObject(value, label);
  exact(value, label, ["id", "processId", "elementId", "owner"]);
  const id = requireId(readOwn(value, "id"), processInstanceId, `${label}.id`);
  if (id.startRevision !== revision || id.startIndex !== startIndex) {
    throw new TypeError(`${label}.id does not match its transition position`);
  }
  requireNonemptyString(readOwn(value, "processId"), `${label}.processId`);
  requireNonemptyString(readOwn(value, "elementId"), `${label}.elementId`);
  requireScopeId(readOwn(value, "owner"), `${label}.owner`);
  return value as FlowNodeOccurrenceStart;
}

function requireEnd(
  value: unknown,
  processInstanceId: string,
  revision: number,
  label: string,
): FlowNodeOccurrenceEnd {
  requireObject(value, label);
  exact(value, label, ["id", "terminal"]);
  const id = requireId(readOwn(value, "id"), processInstanceId, `${label}.id`);
  if (id.startRevision > revision) {
    throw new TypeError(`${label}.id starts after its terminal revision`);
  }
  const terminal = readOwn(value, "terminal");
  if (terminal !== FlowNodeOccurrenceTerminalKind.Completed &&
    terminal !== FlowNodeOccurrenceTerminalKind.Cancelled) {
    throw new TypeError(`${label}.terminal has an unknown kind`);
  }
  return value as FlowNodeOccurrenceEnd;
}

function requireCurrentOpen(
  value: unknown,
  processInstanceId: string,
  requestedAfterRevision: number,
  headRevision: number,
  fold: VisibleOccurrenceFold,
): void {
  if (!isDenseFlowNodeArray(value)) {
    throw new TypeError("flow-node occurrence publication currentOpen must be a dense array");
  }
  const occurrences = value.map((candidate, index) => {
    const label = `flow-node occurrence publication currentOpen[${index}]`;
    requireObject(candidate, label);
    exact(candidate, label, ["id", "processId", "elementId", "owner", "startedAtEpochMs"]);
    const id = requireId(readOwn(candidate, "id"), processInstanceId, `${label}.id`);
    if (id.startRevision > headRevision) {
      throw new TypeError(`${label}.id starts after the publication head`);
    }
    requireNonemptyString(readOwn(candidate, "processId"), `${label}.processId`);
    requireNonemptyString(readOwn(candidate, "elementId"), `${label}.elementId`);
    requireScopeId(readOwn(candidate, "owner"), `${label}.owner`);
    requireNonnegativeSafeInteger(readOwn(candidate, "startedAtEpochMs"), `${label}.startedAtEpochMs`);
    return candidate as OpenFlowNodeOccurrence;
  });
  requireCanonical(occurrences, (left, right) => compareId(left.id, right.id), "flow-node occurrence publication currentOpen");
  fold.requireCurrent(occurrences, requestedAfterRevision);
}

class VisibleOccurrenceFold {
  readonly #requestedAfterRevision: number;
  readonly #visibleOpen = new Map<string, OpenFlowNodeOccurrence>();
  readonly #visibleEnded = new Set<string>();
  readonly #visibleStarts = new Set<string>();

  constructor(requestedAfterRevision: number) {
    this.#requestedAfterRevision = requestedAfterRevision;
  }

  apply(
    starts: readonly FlowNodeOccurrenceStart[],
    ends: readonly FlowNodeOccurrenceEnd[],
    committedAtEpochMs: number,
  ): void {
    for (const start of starts) {
      const key = idKey(start.id);
      if (this.#visibleStarts.has(key) || this.#visibleEnded.has(key)) {
        throw new TypeError("flow-node occurrence publication repeats a visible start identity");
      }
      this.#visibleStarts.add(key);
      this.#visibleOpen.set(key, { ...start, startedAtEpochMs: committedAtEpochMs });
    }
    for (const end of ends) {
      const key = idKey(end.id);
      if (this.#visibleEnded.has(key)) {
        throw new TypeError("flow-node occurrence publication repeats a visible terminal identity");
      }
      const visible = this.#visibleOpen.delete(key);
      if (!visible && (
        this.#requestedAfterRevision === 0 ||
        end.id.startRevision > this.#requestedAfterRevision
      )) {
        throw new TypeError("flow-node occurrence publication terminal has no visible or unseen-prefix start");
      }
      this.#visibleEnded.add(key);
    }
  }

  requireCurrent(
    current: readonly OpenFlowNodeOccurrence[],
    requestedAfterRevision: number,
  ): void {
    const currentById = new Map<string, OpenFlowNodeOccurrence>();
    for (const occurrence of current) {
      const key = idKey(occurrence.id);
      if (currentById.has(key) || this.#visibleEnded.has(key)) {
        throw new TypeError("flow-node occurrence publication currentOpen repeats or retains a terminal identity");
      }
      currentById.set(key, occurrence);
      const expected = this.#visibleOpen.get(key);
      if (expected !== undefined && !sameOpen(expected, occurrence)) {
        throw new TypeError("flow-node occurrence publication currentOpen drifts from its visible start");
      }
      if (expected === undefined && occurrence.id.startRevision > requestedAfterRevision) {
        throw new TypeError("flow-node occurrence publication currentOpen invents an unseen-prefix start");
      }
    }
    if (![...this.#visibleOpen.keys()].every((key) => currentById.has(key))) {
      throw new TypeError("flow-node occurrence publication currentOpen omits a visible open start");
    }
  }
}

function requireContext(context: FlowNodeOccurrencePublicationDecodeContext): void {
  const definition = requireDefinition(context.definition, "expected flow-node occurrence definition identity");
  if (!sameDefinition(definition, context.definition)) {
    throw new TypeError("expected flow-node occurrence definition identity is malformed");
  }
  requireNonemptyString(context.processId, "expected Process identity");
  requireNonemptyString(context.processInstanceId, "expected Process-instance identity");
  requireNonnegativeSafeInteger(context.afterRevision, "expected occurrence cursor");
  if (context.limit !== undefined) requirePublicationLimit(context.limit);
}

function requireDefinition(
  value: unknown,
  label: string,
): FlowNodeOccurrencePublicationDefinitionIdentity {
  requireObject(value, label);
  exact(value, label, ["compiler", "semanticProfile", "sourceId", "sourceSha256", "sourceOverlay"]);
  if (readOwn(value, "compiler") !== "bpmn-source-semantic-process") {
    throw new TypeError(`${label}.compiler is not supported`);
  }
  requireNonemptyString(readOwn(value, "semanticProfile"), `${label}.semanticProfile`);
  requireNonemptyString(readOwn(value, "sourceId"), `${label}.sourceId`);
  requireSha256(readOwn(value, "sourceSha256"), `${label}.sourceSha256`);
  const overlay = readOwn(value, "sourceOverlay");
  if (overlay !== null) {
    requireObject(overlay, `${label}.sourceOverlay`);
    exact(overlay, `${label}.sourceOverlay`, ["id", "sha256"]);
    requireNonemptyString(readOwn(overlay, "id"), `${label}.sourceOverlay.id`);
    requireSha256(readOwn(overlay, "sha256"), `${label}.sourceOverlay.sha256`);
  }
  return value as FlowNodeOccurrencePublicationDefinitionIdentity;
}

function requireId(
  value: unknown,
  processInstanceId: string,
  label: string,
): FlowNodeOccurrenceId {
  requireObject(value, label);
  exact(value, label, ["processInstanceId", "startRevision", "startIndex"]);
  requireEqualString(readOwn(value, "processInstanceId"), processInstanceId, `${label}.Process-instance identity`);
  requirePositiveSafeInteger(readOwn(value, "startRevision"), `${label}.startRevision`);
  requireNonnegativeSafeInteger(readOwn(value, "startIndex"), `${label}.startIndex`);
  return value as FlowNodeOccurrenceId;
}

function requireScopeId(value: unknown, label: string): FlowNodeOccurrenceScopeId {
  requireObject(value, label);
  exact(value, label, ["processInstanceId", "definitionScopeId", "activation"]);
  requireNonemptyString(readOwn(value, "processInstanceId"), `${label}.processInstanceId`);
  requireNonemptyString(readOwn(value, "definitionScopeId"), `${label}.definitionScopeId`);
  requirePositiveSafeInteger(readOwn(value, "activation"), `${label}.activation`);
  return value as FlowNodeOccurrenceScopeId;
}

function sameDefinition(
  left: FlowNodeOccurrencePublicationDefinitionIdentity,
  right: FlowNodeOccurrencePublicationDefinitionIdentity,
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

function sameOpen(left: OpenFlowNodeOccurrence, right: OpenFlowNodeOccurrence): boolean {
  return compareId(left.id, right.id) === 0 &&
    left.processId === right.processId &&
    left.elementId === right.elementId &&
    compareScope(left.owner, right.owner) === 0 &&
    left.startedAtEpochMs === right.startedAtEpochMs;
}

function compareId(left: FlowNodeOccurrenceId, right: FlowNodeOccurrenceId): number {
  return compareFlowNodeCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    left.startRevision - right.startRevision || left.startIndex - right.startIndex;
}

function compareScope(left: FlowNodeOccurrenceScopeId, right: FlowNodeOccurrenceScopeId): number {
  return compareFlowNodeCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareFlowNodeCanonicalStrings(left.definitionScopeId, right.definitionScopeId) ||
    left.activation - right.activation;
}

function requireCanonical<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
  label: string,
): void {
  if (!values.every((value, index) => index === 0 || compare(values[index - 1]!, value) < 0)) {
    throw new TypeError(`${label} must use strict canonical order without duplicates`);
  }
}

function requireEqualString(value: unknown, expected: string, label: string): void {
  if (requireNonemptyString(value, label) !== expected) {
    throw new TypeError(`${label} does not match`);
  }
}

function requireSha256(value: unknown, label: string): string {
  const digest = requireString(value, label);
  if (!lowercaseSha256.test(digest)) throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  return digest;
}

function requirePublicationLimit(value: unknown): number {
  const limit = requirePositiveSafeInteger(value, "flow-node occurrence publication limit");
  if (limit > maximumLimit) {
    throw new TypeError("flow-node occurrence publication limit must be from 1 through 100");
  }
  return limit;
}

function idKey(value: FlowNodeOccurrenceId): string {
  return `${value.processInstanceId.length}:${value.processInstanceId}:${value.startRevision}:${value.startIndex}`;
}

function exact(value: object, label: string, keys: string[]): void {
  requireExactKeys(value, label, keys);
}
