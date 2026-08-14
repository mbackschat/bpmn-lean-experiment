import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import {
  ExecutionPublicationResultKind,
  SemanticTransitionKind,
  executionPublicationExportFormat,
} from "./execution-publications.js";
import type {
  CommittedTransitionBatch,
  CommittedTransitionRecord,
  CurrentCommittedExecution,
  ExecutionPublicationDecodeContext,
  ExecutionPublicationExport,
  ExecutionPublicationIdentity,
  ExecutionPublicationPage,
  ExecutionPublicationRequest,
  ExecutionPublicationResult,
  PublicControlTokenPosition,
  PublicScopePosition,
} from "./execution-publications.js";
import {
  requirePublicationDefinitionIdentity,
  requirePublicationInternalTransition,
  requirePublicationPositionDelta,
  requirePublicationScopePositions,
  requirePublicationState,
  requirePublicationStimulus,
  requirePublicationTokenPositions,
  samePublicationDefinition,
  samePublicationScope,
  samePublicationScopePosition,
  samePublicationToken,
} from "./execution-publication-semantic-value-decoders.js";

const defaultLimit = 50;
const maximumLimit = 100;

export function decodeExecutionPublicationRequest(
  value: unknown,
): ExecutionPublicationRequest {
  requireObject(value, "execution publication request");
  const hasLimit = Object.hasOwn(value, "limit");
  exact(value, "execution publication request", hasLimit
    ? ["afterRevision", "limit"]
    : ["afterRevision"]);
  return {
    afterRevision: requireNonnegativeSafeInteger(
      readOwn(value, "afterRevision"),
      "execution publication request.afterRevision",
    ),
    ...(hasLimit ? { limit: requirePublicationLimit(readOwn(value, "limit")) } : {}),
  };
}

export function decodeExecutionPublicationPage(
  value: unknown,
  context: ExecutionPublicationDecodeContext,
): ExecutionPublicationPage {
  requireContext(context);
  requirePage(value, context, true);
  return value as ExecutionPublicationPage;
}

export function decodeExecutionPublicationResult(
  value: unknown,
  context: ExecutionPublicationDecodeContext,
): ExecutionPublicationResult {
  requireContext(context);
  requireObject(value, "execution publication result");
  switch (readOwn(value, "kind")) {
    case ExecutionPublicationResultKind.Available:
      exact(value, "available execution publication result", ["kind", "page"]);
      requirePage(readOwn(value, "page"), context, true);
      return value as ExecutionPublicationResult;
    case ExecutionPublicationResultKind.NotReady:
    case ExecutionPublicationResultKind.NotFound:
    case ExecutionPublicationResultKind.Unavailable:
    case ExecutionPublicationResultKind.Gap:
      exact(value, "execution publication result", ["kind"]);
      return value as ExecutionPublicationResult;
    default:
      throw new TypeError("execution publication result has an unknown kind");
  }
}

export function decodeExecutionPublicationExport(
  value: unknown,
  identity: ExecutionPublicationIdentity,
): ExecutionPublicationExport {
  requireIdentity(identity, "expected execution publication");
  requireObject(value, "execution publication export");
  exact(value, "execution publication export", [
    "format", "definition", "processId", "processInstanceId", "headRevision",
    "batches", "current",
  ]);
  if (readOwn(value, "format") !== executionPublicationExportFormat) {
    throw new TypeError("execution publication export has an unknown format");
  }
  const batches = readOwn(value, "batches");
  if (!isDenseArray(batches) || batches.length === 0) {
    throw new TypeError("execution publication export batches must be nonempty");
  }
  requirePage({
    definition: readOwn(value, "definition"),
    processId: readOwn(value, "processId"),
    processInstanceId: readOwn(value, "processInstanceId"),
    requestedAfterRevision: 0,
    pageThroughRevision: readOwn(value, "headRevision"),
    headRevision: readOwn(value, "headRevision"),
    batches,
    current: readOwn(value, "current"),
  }, { ...identity, afterRevision: 0 }, false);
  return value as ExecutionPublicationExport;
}

function requirePage(
  value: unknown,
  context: ExecutionPublicationDecodeContext,
  enforceLimit: boolean,
): void {
  requireObject(value, "execution publication page");
  exact(value, "execution publication page", [
    "definition", "processId", "processInstanceId", "requestedAfterRevision",
    "pageThroughRevision", "headRevision", "batches", "current",
  ]);
  const definition = requirePublicationDefinitionIdentity(
    readOwn(value, "definition"),
    "execution publication definition identity",
  );
  if (!samePublicationDefinition(definition, context.definition)) {
    throw new TypeError("execution publication definition identity does not match the expected definition identity");
  }
  requireEqualString(readOwn(value, "processId"), context.processId, "Process identity");
  requireEqualString(
    readOwn(value, "processInstanceId"),
    context.processInstanceId,
    "Process-instance identity",
  );
  const requested = requireNonnegativeSafeInteger(
    readOwn(value, "requestedAfterRevision"),
    "execution publication page.requestedAfterRevision",
  );
  if (requested !== context.afterRevision) {
    throw new TypeError("execution publication page cursor does not match the request");
  }
  const through = requireNonnegativeSafeInteger(
    readOwn(value, "pageThroughRevision"),
    "execution publication page.pageThroughRevision",
  );
  const head = requirePositiveSafeInteger(
    readOwn(value, "headRevision"),
    "execution publication page.headRevision",
  );
  if (requested > through || through > head) {
    throw new TypeError("execution publication page range is inconsistent");
  }
  const batches = readOwn(value, "batches");
  if (!isDenseArray(batches)) {
    throw new TypeError("execution publication page.batches must be a dense array");
  }
  const limit = context.limit ?? defaultLimit;
  requirePublicationLimit(limit);
  if (enforceLimit && batches.length > limit) {
    throw new TypeError("execution publication page exceeds the requested batch limit");
  }
  if ((batches.length === 0) !== (requested === through)) {
    throw new TypeError("execution publication page batch count contradicts its range");
  }
  let cursor = requested;
  let logicalTime: number | undefined;
  const records: CommittedTransitionRecord[] = [];
  for (const [index, batch] of batches.entries()) {
    const checked = requireBatch(
      batch,
      context,
      cursor,
      logicalTime,
      `execution publication page.batches[${index}]`,
    );
    cursor = checked.throughRevision;
    logicalTime = checked.transitions.at(-1)?.logicalTimeMs;
    records.push(...checked.transitions);
  }
  if (cursor !== through) {
    throw new TypeError("execution publication page batches do not reach pageThroughRevision");
  }
  const current = readOwn(value, "current");
  if ((current !== null) !== (through === head)) {
    throw new TypeError("execution publication current presence does not match the head range");
  }
  if (current !== null) {
    requireCurrent(current, context, head, logicalTime);
    if (requested === 0 && !foldMatchesCurrent(records, current as CurrentCommittedExecution)) {
      throw new TypeError("execution publication position deltas do not reconstruct current");
    }
  }
}

function requireBatch(
  value: unknown,
  identity: ExecutionPublicationIdentity,
  expectedFrom: number,
  priorTime: number | undefined,
  label: string,
): CommittedTransitionBatch {
  requireObject(value, label);
  exact(value, label, ["commandId", "fromRevision", "throughRevision", "transitions"]);
  const commandId = requireNonemptyString(readOwn(value, "commandId"), `${label}.commandId`);
  const from = requireNonnegativeSafeInteger(readOwn(value, "fromRevision"), `${label}.fromRevision`);
  const through = requirePositiveSafeInteger(readOwn(value, "throughRevision"), `${label}.throughRevision`);
  const transitions = readOwn(value, "transitions");
  if (from !== expectedFrom) throw new TypeError(`${label}.fromRevision is not contiguous`);
  if (!isDenseArray(transitions) || transitions.length === 0) {
    throw new TypeError(`${label}.transitions must be a nonempty dense array`);
  }
  if (through - from !== transitions.length) {
    throw new TypeError(`${label} range does not equal its transition count`);
  }
  let time = priorTime;
  transitions.forEach((record, index) => {
    time = requireTransitionRecord(
      record,
      identity,
      commandId,
      from + index + 1,
      index === 0,
      time,
      `${label}.transitions[${index}]`,
    );
  });
  return value as CommittedTransitionBatch;
}

function requireTransitionRecord(
  value: unknown,
  identity: ExecutionPublicationIdentity,
  commandId: string,
  revision: number,
  external: boolean,
  priorTime: number | undefined,
  label: string,
): number {
  requireObject(value, label);
  exact(value, label, ["revision", "logicalTimeMs", "transition", "positionDelta"]);
  if (readOwn(value, "revision") !== revision) {
    throw new TypeError(`${label}.revision is not contiguous`);
  }
  const logicalTime = requireNonnegativeSafeInteger(
    readOwn(value, "logicalTimeMs"),
    `${label}.logicalTimeMs`,
  );
  if (priorTime !== undefined && logicalTime < priorTime) {
    throw new TypeError(`${label}.logicalTimeMs regresses`);
  }
  const delta = requirePublicationPositionDelta(
    readOwn(value, "positionDelta"),
    `${label}.positionDelta`,
  );
  const transition = readOwn(value, "transition");
  requireObject(transition, `${label}.transition`);
  if (external) {
    exact(transition, `${label}.transition`, ["kind", "stimulus"]);
    if (readOwn(transition, "kind") !== SemanticTransitionKind.ExternalStimulus) {
      throw new TypeError(`${label} first transition must be the external stimulus`);
    }
    requirePublicationStimulus(
      readOwn(transition, "stimulus"),
      identity,
      commandId,
      revision,
      logicalTime,
      `${label}.transition.stimulus`,
    );
  } else {
    requirePublicationInternalTransition(transition, delta, `${label}.transition`);
  }
  return logicalTime;
}

function requireCurrent(
  value: unknown,
  identity: ExecutionPublicationIdentity,
  head: number,
  lastTime: number | undefined,
): void {
  requireObject(value, "execution publication current");
  exact(value, "execution publication current", ["revision", "state", "controlTokens", "scopes"]);
  if (readOwn(value, "revision") !== head) {
    throw new TypeError("execution publication current revision does not equal head");
  }
  const state = requirePublicationState(readOwn(value, "state"), identity.processInstanceId);
  if (lastTime !== undefined && state.logicalTimeMs !== lastTime) {
    throw new TypeError("execution publication current logical time does not equal the head record");
  }
  const tokens = requirePublicationTokenPositions(
    readOwn(value, "controlTokens"),
    "execution publication current.controlTokens",
  );
  const scopes = requirePublicationScopePositions(
    readOwn(value, "scopes"),
    true,
    "execution publication current.scopes",
  );
  for (const token of tokens) {
    if (!scopes.some(({ id }) => samePublicationScope(id, token.owner))) {
      throw new TypeError("execution publication current token owner is not a live scope");
    }
  }
  for (const scope of scopes) {
    if (scope.bpmnElementId === identity.processId &&
      scope.id.processInstanceId !== identity.processInstanceId) {
      throw new TypeError("execution publication current root scope has the wrong Process instance");
    }
  }
}

function requireIdentity(value: ExecutionPublicationIdentity, label: string): void {
  requireObject(value, label);
  exact(value, label, ["definition", "processId", "processInstanceId"]);
  requirePublicationDefinitionIdentity(readOwn(value, "definition"), `${label}.definition`);
  requireNonemptyString(readOwn(value, "processId"), `${label}.processId`);
  requireNonemptyString(readOwn(value, "processInstanceId"), `${label}.processInstanceId`);
}

function requireContext(value: ExecutionPublicationDecodeContext): void {
  requireObject(value, "execution publication decode context");
  const hasLimit = Object.hasOwn(value, "limit");
  exact(value, "execution publication decode context", hasLimit
    ? ["definition", "processId", "processInstanceId", "afterRevision", "limit"]
    : ["definition", "processId", "processInstanceId", "afterRevision"]);
  requirePublicationDefinitionIdentity(
    readOwn(value, "definition"),
    "execution publication decode context.definition",
  );
  requireNonemptyString(readOwn(value, "processId"), "execution publication decode context.processId");
  requireNonemptyString(
    readOwn(value, "processInstanceId"),
    "execution publication decode context.processInstanceId",
  );
  requireNonnegativeSafeInteger(
    readOwn(value, "afterRevision"),
    "execution publication decode context.afterRevision",
  );
  if (hasLimit) requirePublicationLimit(readOwn(value, "limit"));
}

function foldMatchesCurrent(
  records: CommittedTransitionRecord[],
  current: CurrentCommittedExecution,
): boolean {
  const scopes: PublicScopePosition[] = [];
  const tokens: PublicControlTokenPosition[] = [];
  for (const { positionDelta: delta } of records) {
    for (const scope of delta.enteredScopes) {
      if (scopes.some(({ id }) => samePublicationScope(id, scope.id))) return false;
      scopes.push(scope);
    }
    for (const token of delta.consumedTokens) {
      const existing = tokens.find((item) => samePublicationToken(item, token));
      if (existing === undefined || existing.multiplicity < token.multiplicity) return false;
      const remaining = existing.multiplicity - token.multiplicity;
      tokens.splice(tokens.indexOf(existing), 1);
      if (remaining > 0) tokens.push({ ...existing, multiplicity: remaining });
    }
    for (const token of delta.producedTokens) {
      const existing = tokens.find((item) => samePublicationToken(item, token));
      if (existing === undefined) tokens.push(token);
      else {
        const multiplicity = existing.multiplicity + token.multiplicity;
        if (!Number.isSafeInteger(multiplicity)) return false;
        tokens.splice(tokens.indexOf(existing), 1, { ...existing, multiplicity });
      }
    }
    for (const scope of delta.exitedScopes) {
      const existing = scopes.find(({ id }) => samePublicationScope(id, scope.id));
      if (existing === undefined || tokens.some(({ owner }) => samePublicationScope(owner, scope.id))) {
        return false;
      }
      scopes.splice(scopes.indexOf(existing), 1);
    }
  }
  return sameSet(
    tokens,
    current.controlTokens,
    (left, right) => samePublicationToken(left, right) && left.multiplicity === right.multiplicity,
  ) && sameSet(scopes, current.scopes, samePublicationScopePosition);
}

function requirePublicationLimit(value: unknown): number {
  const limit = requirePositiveSafeInteger(value, "execution publication limit");
  if (limit > maximumLimit) {
    throw new TypeError("execution publication limit must be from 1 through 100");
  }
  return limit;
}

function requireEqualString(value: unknown, expected: string, label: string): void {
  if (requireNonemptyString(value, label) !== expected) throw new TypeError(`${label} does not match`);
}

function exact(value: object, label: string, keys: string[]): void {
  requireExactKeys(value, label, keys);
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && Reflect.ownKeys(value).length === value.length + 1 &&
    Reflect.ownKeys(value).every((key) => key === "length" ||
      (typeof key === "string" && /^(?:0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length));
}

function sameSet<T>(
  left: readonly T[],
  right: readonly T[],
  same: (a: T, b: T) => boolean,
): boolean {
  return left.length === right.length &&
    left.every((item) => right.some((candidate) => same(item, candidate)));
}
