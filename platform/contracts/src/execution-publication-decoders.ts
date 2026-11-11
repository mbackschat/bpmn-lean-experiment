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
  ExecutionInputKind,
  ExecutionPublicationResultKind,
  ExecutionRoleKind,
  ProcessStatus,
  executionPublicationExportFormat,
} from "./execution-publications.js";
import type {
  CommittedTransitionBatch,
  ExecutionPublicationDecodeContext,
  ExecutionPublicationExport,
  ExecutionPublicationPage,
  ExecutionPublicationRequest,
  ExecutionPublicationResult,
  ExecutionState,
} from "./execution-publications.js";
import { isDenseArray, requirePublicJsonObject } from "./public-json-value.js";
import {
  requirePublicationDefinitionIdentity,
  requirePublicationIdentity,
  samePublicationDefinition,
} from "./publication-identity.js";
import type { PublicationIdentity } from "./publication-identity.js";

const defaultLimit = 50;
const maximumLimit = 100;
const inputKinds: ReadonlySet<unknown> = new Set(Object.values(ExecutionInputKind));
const statuses: ReadonlySet<unknown> = new Set(Object.values(ProcessStatus));

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
    case ExecutionPublicationResultKind.NotFound:
    case ExecutionPublicationResultKind.Unavailable:
    case ExecutionPublicationResultKind.Gap:
    case ExecutionPublicationResultKind.IntegrityFailure:
      exact(value, "execution publication result", ["kind"]);
      return value as ExecutionPublicationResult;
    default:
      throw new TypeError("execution publication result has an unknown kind");
  }
}

export function decodeExecutionPublicationExport(
  value: unknown,
  identity: PublicationIdentity,
): ExecutionPublicationExport {
  requirePublicationIdentity(identity, "expected execution publication");
  requireObject(value, "execution publication export");
  exact(value, "execution publication export", [
    "format", "definition", "processInstanceId", "headRevision", "batches", "current",
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
    processInstanceId: readOwn(value, "processInstanceId"),
    requestedAfterRevision: 0,
    pageThroughRevision: readOwn(value, "headRevision"),
    headRevision: readOwn(value, "headRevision"),
    batches,
    current: readOwn(value, "current"),
  }, { ...identity, afterRevision: 0 }, false);
  if (readOwn(value, "current") === null) {
    throw new TypeError("execution publication export must carry the state committed at its head");
  }
  return value as ExecutionPublicationExport;
}

function requirePage(
  value: unknown,
  context: ExecutionPublicationDecodeContext,
  enforceLimit: boolean,
): void {
  requireObject(value, "execution publication page");
  exact(value, "execution publication page", [
    "definition", "processInstanceId", "requestedAfterRevision", "pageThroughRevision", "headRevision",
    "batches", "current",
  ]);
  const definition = requirePublicationDefinitionIdentity(
    readOwn(value, "definition"),
    "execution publication definition identity",
  );
  if (!samePublicationDefinition(definition, context.definition)) {
    throw new TypeError("execution publication definition identity does not match the expected definition identity");
  }
  if (requireNonemptyString(readOwn(value, "processInstanceId"), "Process-instance identity") !==
      context.processInstanceId) {
    throw new TypeError("Process-instance identity does not match");
  }
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
  for (const [index, batch] of batches.entries()) {
    cursor = requireBatch(batch, cursor, `execution publication page.batches[${index}]`).throughRevision;
  }
  if (cursor !== through) {
    throw new TypeError("execution publication page batches do not reach pageThroughRevision");
  }
  const current = readOwn(value, "current");
  if (current !== null) {
    if (through !== head) throw new TypeError("execution publication current appears before the head");
    requireCurrent(current, context.processInstanceId, head);
  }
}

function requireBatch(value: unknown, expectedFrom: number, label: string): CommittedTransitionBatch {
  requireObject(value, label);
  exact(value, label, ["commandId", "fromRevision", "throughRevision", "transitions"]);
  requireNonemptyString(readOwn(value, "commandId"), `${label}.commandId`);
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
  transitions.forEach((record, index) => {
    requireTransitionRecord(record, from + index + 1, `${label}.transitions[${index}]`);
  });
  return value as CommittedTransitionBatch;
}

function requireTransitionRecord(value: unknown, revision: number, label: string): void {
  requireObject(value, label);
  exact(value, label, ["revision", "role", "element", "sourceType", "owner"]);
  if (readOwn(value, "revision") !== revision) {
    throw new TypeError(`${label}.revision is not contiguous`);
  }
  requireRole(readOwn(value, "role"), `${label}.role`);
  const element = readOwn(value, "element");
  const sourceType = readOwn(value, "sourceType");
  if (element === null) {
    if (sourceType !== null) throw new TypeError(`${label}.sourceType must be null without an element`);
  } else {
    requireNonemptyString(element, `${label}.element`);
    if (sourceType !== null) requireNonemptyString(sourceType, `${label}.sourceType`);
  }
  requireNonnegativeSafeInteger(readOwn(value, "owner"), `${label}.owner`);
}

function requireRole(value: unknown, label: string): void {
  requireObject(value, label);
  switch (readOwn(value, "kind")) {
    case ExecutionRoleKind.Input:
      exact(value, label, ["kind", "input"]);
      if (!inputKinds.has(readOwn(value, "input"))) throw new TypeError(`${label}.input is not a kernel input`);
      return;
    case ExecutionRoleKind.Signal:
      exact(value, label, ["kind", "signal"]);
      requireNonemptyString(readOwn(value, "signal"), `${label}.signal`);
      return;
    case ExecutionRoleKind.Arrive:
      exact(value, label, ["kind", "flow"]);
      requireNonemptyString(readOwn(value, "flow"), `${label}.flow`);
      return;
    case ExecutionRoleKind.Idle:
      exact(value, label, ["kind", "scope"]);
      requireNonnegativeSafeInteger(readOwn(value, "scope"), `${label}.scope`);
      return;
    default:
      throw new TypeError(`${label} has an unknown kind`);
  }
}

function requireCurrent(value: unknown, processInstanceId: string, head: number): void {
  requireObject(value, "execution publication current");
  exact(value, "execution publication current", ["revision", "state"]);
  if (readOwn(value, "revision") !== head) {
    throw new TypeError("execution publication current revision does not equal head");
  }
  requireState(readOwn(value, "state"), processInstanceId, "execution publication current.state");
}

function requireState(value: unknown, processInstanceId: string, label: string): ExecutionState {
  requireObject(value, label);
  const status = readOwn(value, "status");
  if (!statuses.has(status)) throw new TypeError(`${label}.status is unknown`);
  // canonical-result.schema.json#/$defs/state: a failed state carries its failure and no open wait; no other does.
  // `broadcasts` is present only after an input that threw a Signal.
  const failed = status === ProcessStatus.Failed;
  const threw = Object.hasOwn(value, "broadcasts");
  exact(value, label, [
    "kind", "instanceId", "status", "logicalTimeMs", "variables", "scopes", "openWaits",
    ...(threw ? ["broadcasts"] : []),
    ...(failed ? ["failure"] : []),
  ]);
  if (readOwn(value, "kind") !== "state") throw new TypeError(`${label}.kind must be state`);
  if (readOwn(value, "instanceId") !== processInstanceId) {
    throw new TypeError(`${label}.instanceId does not match the Process instance`);
  }
  requireNonnegativeSafeInteger(readOwn(value, "logicalTimeMs"), `${label}.logicalTimeMs`);
  requireList(readOwn(value, "variables"), `${label}.variables`, requireBinding);
  requireList(readOwn(value, "scopes"), `${label}.scopes`, requirePublicJsonObject);
  requireList(readOwn(value, "openWaits"), `${label}.openWaits`, (wait, itemLabel) => {
    requireObject(wait, itemLabel);
    exact(wait, itemLabel, ["id", "definition", "input", "detail"]);
    requireOccurrenceId(readOwn(wait, "id"), `${itemLabel}.id`);
    const definition = readOwn(wait, "definition");
    if (definition !== null) requirePublicJsonObject(definition, `${itemLabel}.definition`);
    const input = readOwn(wait, "input");
    if (input !== null) requireNonemptyString(input, `${itemLabel}.input`);
    requireKinded(readOwn(wait, "detail"), `${itemLabel}.detail`);
  });
  if (threw) requireList(readOwn(value, "broadcasts"), `${label}.broadcasts`, requireBroadcast);
  if (failed) {
    requirePublicJsonObject(readOwn(value, "failure"), `${label}.failure`);
    if ((readOwn(value, "openWaits") as readonly unknown[]).length > 0) {
      throw new TypeError(`${label}.openWaits must be empty when the instance failed`);
    }
  }
  return value as ExecutionState;
}

function requireBinding(value: unknown, label: string): void {
  requireObject(value, label);
  exact(value, label, ["name", "value"]);
  requireNonemptyString(readOwn(value, "name"), `${label}.name`);
  requireKinded(readOwn(value, "value"), `${label}.value`);
}

/** `scenario.schema.json#/$defs/occurrenceId`. */
function requireOccurrenceId(value: unknown, label: string): void {
  requireObject(value, label);
  exact(value, label, ["processInstanceId", "elementId", "activation"]);
  requireNonemptyString(readOwn(value, "processInstanceId"), `${label}.processInstanceId`);
  requireNonemptyString(readOwn(value, "elementId"), `${label}.elementId`);
  requirePositiveSafeInteger(readOwn(value, "activation"), `${label}.activation`);
}

/** `canonical-result.schema.json#/$defs/broadcast`: a Signal named by `name` or addressed by `signalRef`, never both. */
function requireBroadcast(value: unknown, label: string): void {
  requireObject(value, label);
  const named = Object.hasOwn(value, "name");
  if (named === Object.hasOwn(value, "signalRef")) {
    throw new TypeError(`${label} must carry exactly one of name and signalRef`);
  }
  const keyed = Object.hasOwn(value, "businessKey");
  exact(value, label, [named ? "name" : "signalRef", "variables", ...(keyed ? ["businessKey"] : []), "origin"]);
  if (named) {
    requireNonemptyString(readOwn(value, "name"), `${label}.name`);
  } else {
    // scenario.schema.json#/$defs/signalRef: the Signal's id and, when its Definitions declare one, their namespace.
    const signalRef = readOwn(value, "signalRef");
    requireObject(signalRef, `${label}.signalRef`);
    const spaced = Object.hasOwn(signalRef, "namespace");
    exact(signalRef, `${label}.signalRef`, ["id", ...(spaced ? ["namespace"] : [])]);
    requireNonemptyString(readOwn(signalRef, "id"), `${label}.signalRef.id`);
    if (spaced) requireString(readOwn(signalRef, "namespace"), `${label}.signalRef.namespace`);
  }
  requireList(readOwn(value, "variables"), `${label}.variables`, requireBinding);
  if (keyed) requireString(readOwn(value, "businessKey"), `${label}.businessKey`);
  requireOccurrenceId(readOwn(value, "origin"), `${label}.origin`);
}

/** An engine-typed object: plain JSON whose `kind` names its form. */
function requireKinded(value: unknown, label: string): void {
  requireNonemptyString(readOwn(requirePublicJsonObject(value, label), "kind"), `${label}.kind`);
}

function requireList(value: unknown, label: string, item: (value: unknown, label: string) => unknown): void {
  if (!isDenseArray(value)) throw new TypeError(`${label} must be a dense array`);
  value.forEach((entry, index) => item(entry, `${label}[${index}]`));
}

function requireContext(value: ExecutionPublicationDecodeContext): void {
  requireObject(value, "execution publication decode context");
  const hasLimit = Object.hasOwn(value, "limit");
  exact(value, "execution publication decode context", hasLimit
    ? ["definition", "processInstanceId", "afterRevision", "limit"]
    : ["definition", "processInstanceId", "afterRevision"]);
  requirePublicationDefinitionIdentity(
    readOwn(value, "definition"),
    "execution publication decode context.definition",
  );
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

function requirePublicationLimit(value: unknown): number {
  const limit = requirePositiveSafeInteger(value, "execution publication limit");
  if (limit > maximumLimit) {
    throw new TypeError("execution publication limit must be from 1 through 100");
  }
  return limit;
}

function exact(value: object, label: string, keys: string[]): void {
  requireExactKeys(value, label, keys);
}
