import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import {
  FlowNodeOccurrencePublicationResultKind,
  FlowNodeOccurrenceRole,
  FlowNodeOccurrenceTerminalKind,
} from "./flow-node-occurrence-publications.js";
import type {
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrenceKey,
  FlowNodeOccurrencePage,
  FlowNodeOccurrencePublicationDecodeContext,
  FlowNodeOccurrencePublicationRequest,
  FlowNodeOccurrencePublicationResult,
} from "./flow-node-occurrence-publications.js";
import { isDenseFlowNodeArray } from "./flow-node-publication-decoder-primitives.js";
import {
  requirePublicationDefinitionIdentity,
  samePublicationDefinition,
} from "./publication-identity.js";

const defaultLimit = 50;
const maximumLimit = 100;
const roles: ReadonlySet<unknown> = new Set(Object.values(FlowNodeOccurrenceRole));
const terminals: ReadonlySet<unknown> = new Set(Object.values(FlowNodeOccurrenceTerminalKind));

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
    case FlowNodeOccurrencePublicationResultKind.NotFound:
    case FlowNodeOccurrencePublicationResultKind.Unavailable:
    case FlowNodeOccurrencePublicationResultKind.Gap:
    case FlowNodeOccurrencePublicationResultKind.IntegrityFailure:
      exact(value, "flow-node occurrence publication result", ["kind"]);
      return value as FlowNodeOccurrencePublicationResult;
    default:
      throw new TypeError("flow-node occurrence publication result has an unknown kind");
  }
}

/** The canonical text of an occurrence key, for comparing keys by value. */
export function flowNodeOccurrenceKeyText(key: FlowNodeOccurrenceKey): string {
  return JSON.stringify([key.processInstanceId, key.elementId, key.activation, key.role]);
}

function requirePage(value: unknown, context: FlowNodeOccurrencePublicationDecodeContext): void {
  requireObject(value, "flow-node occurrence publication page");
  exact(value, "flow-node occurrence publication page", [
    "definition", "processInstanceId", "requestedAfterRevision", "pageThroughRevision", "headRevision", "batches",
  ]);
  const definition = requirePublicationDefinitionIdentity(
    readOwn(value, "definition"),
    "flow-node occurrence publication definition identity",
  );
  if (!samePublicationDefinition(definition, context.definition)) {
    throw new TypeError("flow-node occurrence publication definition identity does not match the expected identity");
  }
  if (requireNonemptyString(readOwn(value, "processInstanceId"), "Process-instance identity") !==
      context.processInstanceId) {
    throw new TypeError("Process-instance identity does not match");
  }
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
  const lifecycle = new PageLifecycle();
  let cursor = requested;
  for (const [index, batch] of batches.entries()) {
    cursor = requireBatch(batch, cursor, lifecycle, `flow-node occurrence publication page.batches[${index}]`)
      .throughRevision;
  }
  if (cursor !== through) {
    throw new TypeError("flow-node occurrence publication page batches do not reach pageThroughRevision");
  }
}

function requireBatch(
  value: unknown,
  expectedFrom: number,
  lifecycle: PageLifecycle,
  label: string,
): FlowNodeOccurrenceBatch {
  requireObject(value, label);
  exact(value, label, ["commandId", "fromRevision", "throughRevision", "transitions"]);
  requireNonemptyString(readOwn(value, "commandId"), `${label}.commandId`);
  const from = requireNonnegativeSafeInteger(readOwn(value, "fromRevision"), `${label}.fromRevision`);
  const through = requirePositiveSafeInteger(readOwn(value, "throughRevision"), `${label}.throughRevision`);
  if (from !== expectedFrom) throw new TypeError(`${label}.fromRevision is not contiguous`);
  if (through <= from) throw new TypeError(`${label} range is empty`);
  const transitions = readOwn(value, "transitions");
  if (!isDenseFlowNodeArray(transitions)) throw new TypeError(`${label}.transitions must be a dense array`);
  let prior = from;
  transitions.forEach((transition, index) => {
    const itemLabel = `${label}.transitions[${index}]`;
    requireObject(transition, itemLabel);
    exact(transition, itemLabel, ["revision", "started", "ended"]);
    const revision = requirePositiveSafeInteger(readOwn(transition, "revision"), `${itemLabel}.revision`);
    if (revision <= prior || revision > through) {
      throw new TypeError(`${itemLabel}.revision is outside its batch or out of order`);
    }
    prior = revision;
    const started = readOwn(transition, "started");
    const ended = readOwn(transition, "ended");
    if (!isDenseFlowNodeArray(started) || !isDenseFlowNodeArray(ended) || started.length + ended.length === 0) {
      throw new TypeError(`${itemLabel} must start or end at least one occurrence`);
    }
    started.forEach((start, startIndex) => {
      const startLabel = `${itemLabel}.started[${startIndex}]`;
      requireObject(start, startLabel);
      exact(start, startLabel, ["occurrence", "owner", "sourceType"]);
      lifecycle.start(requireKey(readOwn(start, "occurrence"), `${startLabel}.occurrence`), startLabel);
      requireNonnegativeSafeInteger(readOwn(start, "owner"), `${startLabel}.owner`);
      requireNonemptyString(readOwn(start, "sourceType"), `${startLabel}.sourceType`);
    });
    ended.forEach((end, endIndex) => {
      const endLabel = `${itemLabel}.ended[${endIndex}]`;
      requireObject(end, endLabel);
      exact(end, endLabel, ["occurrence", "terminal"]);
      lifecycle.end(requireKey(readOwn(end, "occurrence"), `${endLabel}.occurrence`), endLabel);
      if (!terminals.has(readOwn(end, "terminal"))) throw new TypeError(`${endLabel}.terminal is unknown`);
    });
  });
  return value as FlowNodeOccurrenceBatch;
}

/**
 * The lifecycle facts one page shows: no occurrence starts or ends twice. A page may end an occurrence that began
 * before it, so an end needs no start in the page.
 */
class PageLifecycle {
  readonly #started = new Set<string>();
  readonly #ended = new Set<string>();

  start(key: FlowNodeOccurrenceKey, label: string): void {
    const text = flowNodeOccurrenceKeyText(key);
    if (this.#started.has(text) || this.#ended.has(text)) throw new TypeError(`${label} starts an occurrence again`);
    this.#started.add(text);
  }

  end(key: FlowNodeOccurrenceKey, label: string): void {
    const text = flowNodeOccurrenceKeyText(key);
    if (this.#ended.has(text)) throw new TypeError(`${label} ends an occurrence again`);
    this.#ended.add(text);
  }
}

function requireKey(value: unknown, label: string): FlowNodeOccurrenceKey {
  requireObject(value, label);
  exact(value, label, ["processInstanceId", "elementId", "activation", "role"]);
  requireNonemptyString(readOwn(value, "processInstanceId"), `${label}.processInstanceId`);
  requireNonemptyString(readOwn(value, "elementId"), `${label}.elementId`);
  requirePositiveSafeInteger(readOwn(value, "activation"), `${label}.activation`);
  if (!roles.has(readOwn(value, "role"))) throw new TypeError(`${label}.role is unknown`);
  return value as FlowNodeOccurrenceKey;
}

function requireContext(context: FlowNodeOccurrencePublicationDecodeContext): void {
  requireObject(context, "flow-node occurrence publication decode context");
  const hasLimit = Object.hasOwn(context, "limit");
  exact(context, "flow-node occurrence publication decode context", hasLimit
    ? ["definition", "processInstanceId", "afterRevision", "limit"]
    : ["definition", "processInstanceId", "afterRevision"]);
  requirePublicationDefinitionIdentity(
    readOwn(context, "definition"),
    "flow-node occurrence publication decode context.definition",
  );
  requireNonemptyString(
    readOwn(context, "processInstanceId"),
    "flow-node occurrence publication decode context.processInstanceId",
  );
  requireNonnegativeSafeInteger(
    readOwn(context, "afterRevision"),
    "flow-node occurrence publication decode context.afterRevision",
  );
  if (hasLimit) requirePublicationLimit(readOwn(context, "limit"));
}

function requirePublicationLimit(value: unknown): number {
  const limit = requirePositiveSafeInteger(value, "flow-node occurrence publication limit");
  if (limit > maximumLimit) {
    throw new TypeError("flow-node occurrence publication limit must be from 1 through 100");
  }
  return limit;
}

function exact(value: object, label: string, keys: string[]): void {
  requireExactKeys(value, label, keys);
}
