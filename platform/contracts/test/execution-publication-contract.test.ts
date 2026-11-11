import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decodeExecutionPublicationExport,
  decodeExecutionPublicationPage,
  decodeExecutionPublicationRequest,
  decodeExecutionPublicationResult,
  ExecutionInputKind,
  ExecutionPublicationResultKind,
  ExecutionRoleKind,
} from "@bpmn-lean/platform-contracts";

import {
  completeBatch,
  completedExecutionPublicationPage,
  completedState,
  elementFreeBatch,
  executionPublicationExport,
  executionPublicationPage,
  instanceFailure,
  publicationIdentity,
  runningState,
  startBatch,
} from "./execution-publication-fixture.ts";

const context = { ...publicationIdentity, afterRevision: 0 } as const;

/** The slice of a JSON Schema node the synchronization test reads. */
type SchemaNode = {
  properties?: Record<string, SchemaNode>;
  required?: string[];
  oneOf?: SchemaNode[];
  const?: string;
  enum?: string[];
};

function decodePage(page: unknown, request: { afterRevision?: number; limit?: number } = {}) {
  return decodeExecutionPublicationPage(page, { ...context, ...request });
}

function rejectPage(
  page: unknown,
  message: RegExp,
  request: { afterRevision?: number; limit?: number } = {},
): void {
  assert.throws(() => decodePage(page, request), message);
}

/** The start page with its first micro-step changed; the revision range stays valid. */
function pageWithRecord(patch: Record<string, unknown>) {
  const [first, ...rest] = startBatch.transitions;
  return {
    ...executionPublicationPage(),
    batches: [{ ...startBatch, transitions: [{ ...first, ...patch }, ...rest] }],
  };
}

function pageWithState(state: unknown) {
  return { ...executionPublicationPage(), current: { revision: 3, state } };
}

/** `count` single-step batches over revisions 1 to `count`, as one page that reaches its head without a state. */
function manyBatchPage(count: number) {
  return {
    ...publicationIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: count,
    headRevision: count,
    batches: Array.from({ length: count }, (_, index) => ({
      commandId: `command-${index + 1}`,
      fromRevision: index,
      throughRevision: index + 1,
      transitions: [{
        revision: index + 1,
        role: { kind: "input", input: "command" },
        element: null,
        sourceType: null,
        owner: 0,
      }],
    })),
    current: null,
  };
}

test("decodes one exact page and every closed result arm", () => {
  const page = executionPublicationPage();
  assert.deepEqual(decodePage(page), page);
  assert.deepEqual(decodePage(completedExecutionPublicationPage()), completedExecutionPublicationPage());
  assert.deepEqual(decodeExecutionPublicationResult({
    kind: ExecutionPublicationResultKind.Available,
    page,
  }, context), { kind: "available", page });
  for (const kind of ["notFound", "unavailable", "gap", "integrityFailure"] as const) {
    assert.deepEqual(decodeExecutionPublicationResult({ kind }, context), { kind });
  }
});

test("refuses a page on a non-available arm, a missing page and the retired notReady kind", () => {
  const page = executionPublicationPage();
  for (const kind of ["notFound", "unavailable", "gap", "integrityFailure"]) {
    assert.throws(() => decodeExecutionPublicationResult({ kind, page }, context), /public fields/u);
  }
  assert.throws(() => decodeExecutionPublicationResult({ kind: "available" }, context), /public fields/u);
  for (const kind of ["notReady", "future"]) {
    assert.throws(() => decodeExecutionPublicationResult({ kind }, context), /unknown kind/u);
  }
  assert.throws(
    () => decodeExecutionPublicationResult({ kind: "available", page: { ...page, headRevision: 2 } }, context),
    /range is inconsistent/u,
  );
});

test("accepts each kernel input kind and each role arm, and refuses unknown or extended ones", () => {
  for (const input of Object.values(ExecutionInputKind)) {
    const page = pageWithRecord({ role: { kind: ExecutionRoleKind.Input, input } });
    assert.deepEqual(decodePage(page), page);
  }
  for (const role of [
    { kind: "signal", signal: "completeProcess" },
    { kind: "arrive", flow: "Flow_1" },
    { kind: "idle", scope: 0 },
    { kind: "idle", scope: 12 },
  ]) {
    const page = pageWithRecord({ role });
    assert.deepEqual(decodePage(page), page);
  }
  const rejected: Array<[unknown, RegExp]> = [
    [{ kind: "input", input: "future" }, /not a kernel input/u],
    [{ kind: "input", input: "completeUserTaskInstance" }, /not a kernel input/u],
    [{ kind: "input" }, /public fields/u],
    [{ kind: "input", input: "start", flow: "Flow_1" }, /public fields/u],
    [{ kind: "signal", signal: "" }, /must not be empty/u],
    [{ kind: "signal", flow: "Flow_1" }, /public fields/u],
    [{ kind: "arrive", flow: "" }, /must not be empty/u],
    [{ kind: "idle", scope: -1 }, /nonnegative safe integer/u],
    [{ kind: "idle", scope: 1.5 }, /nonnegative safe integer/u],
    [{ kind: "externalStimulus" }, /unknown kind/u],
    ["input", /must be an object/u],
  ];
  for (const [role, message] of rejected) rejectPage(pageWithRecord({ role }), message);
});

test("keeps element, source type and owner exact", () => {
  for (const patch of [
    { element: null, sourceType: null },
    { element: "UserTask_Review", sourceType: null },
    { owner: 7 },
  ]) {
    const page = pageWithRecord(patch);
    assert.deepEqual(decodePage(page), page);
  }
  const rejected: Array<[Record<string, unknown>, RegExp]> = [
    [{ element: null, sourceType: "userTask" }, /sourceType must be null without an element/u],
    [{ element: "", sourceType: "userTask" }, /must not be empty/u],
    [{ sourceType: "" }, /must not be empty/u],
    [{ element: 7 }, /must be a string/u],
    [{ owner: -1 }, /nonnegative safe integer/u],
    [{ owner: 1.5 }, /nonnegative safe integer/u],
    [{ owner: Number.MAX_SAFE_INTEGER + 1 }, /nonnegative safe integer/u],
    [{ logicalTimeMs: 0 }, /public fields/u],
    [{ positionDelta: {} }, /public fields/u],
    [{ transition: { kind: "externalStimulus" } }, /public fields/u],
  ];
  for (const [patch, message] of rejected) rejectPage(pageWithRecord(patch), message);
  const [first] = startBatch.transitions;
  const { owner: _owner, ...withoutOwner } = first;
  rejectPage({
    ...executionPublicationPage(),
    batches: [{ ...startBatch, transitions: [withoutOwner, ...startBatch.transitions.slice(1)] }],
  }, /public fields/u);
});

test("keeps revisions contiguous across steps, batches and the page range", () => {
  const complete = completedExecutionPublicationPage();
  const [second, third] = [startBatch.transitions[1], startBatch.transitions[2]];
  rejectPage({
    ...executionPublicationPage(),
    batches: [{ ...startBatch, transitions: [startBatch.transitions[0], { ...second, revision: 3 }, third] }],
  }, /revision is not contiguous/u);
  rejectPage({
    ...executionPublicationPage(),
    batches: [{ ...startBatch, transitions: [startBatch.transitions[0], second, { ...third, revision: 0 }] }],
  }, /revision is not contiguous/u);
  rejectPage({ ...complete, batches: [startBatch, { ...elementFreeBatch, fromRevision: 2 }, completeBatch] },
    /fromRevision is not contiguous/u);
  rejectPage({ ...complete, batches: [startBatch, elementFreeBatch, { ...completeBatch, fromRevision: 5 }] },
    /fromRevision is not contiguous/u);
  rejectPage({ ...complete, batches: [startBatch, elementFreeBatch, { ...completeBatch, throughRevision: 6 }] },
    /range does not equal its transition count/u);
  rejectPage({ ...complete, batches: [startBatch, elementFreeBatch, { ...completeBatch, throughRevision: 8 }] },
    /range does not equal its transition count/u);
  rejectPage({ ...executionPublicationPage(), batches: [{ ...startBatch, transitions: [] }] },
    /nonempty dense array/u);
  rejectPage({ ...complete, batches: [startBatch, elementFreeBatch] }, /do not reach pageThroughRevision/u);
  rejectPage({ ...complete, batches: [] }, /batch count contradicts its range/u);
  rejectPage({ ...complete, batches: [{ ...startBatch, commandId: "" }, elementFreeBatch, completeBatch] },
    /commandId must not be empty/u);
  rejectPage({ ...executionPublicationPage(), pageThroughRevision: 4 }, /range is inconsistent/u);
  rejectPage({ ...executionPublicationPage(), headRevision: 2 }, /range is inconsistent/u);
  rejectPage({ ...executionPublicationPage(), headRevision: 0 }, /positive safe integer/u);
  rejectPage({ ...executionPublicationPage(), batches: "none" }, /dense array/u);
  rejectPage({ ...executionPublicationPage(), batches: new Array<unknown>(1) }, /dense array/u);
});

test("pages a cursor at the head as an empty page that still carries the current state", () => {
  const page = {
    ...executionPublicationPage(),
    requestedAfterRevision: 3,
    batches: [],
  };
  assert.deepEqual(decodePage(page, { afterRevision: 3 }), page);
  rejectPage(page, /cursor does not match the request/u, { afterRevision: 2 });
  rejectPage({ ...page, requestedAfterRevision: 4 }, /range is inconsistent/u, { afterRevision: 4 });
  rejectPage({ ...page, batches: [elementFreeBatch] }, /batch count contradicts its range/u, { afterRevision: 3 });
});

test("binds the page to the requested cursor and batch limit", () => {
  const page = completedExecutionPublicationPage();
  assert.deepEqual(decodePage(page, { limit: 3 }), page);
  rejectPage(page, /exceeds the requested batch limit/u, { limit: 2 });
  rejectPage(page, /cursor does not match the request/u, { afterRevision: 3 });
  rejectPage({ ...page, requestedAfterRevision: 3 }, /cursor does not match the request/u);

  const long = manyBatchPage(51);
  rejectPage(long, /exceeds the requested batch limit/u);
  assert.deepEqual(decodePage(long, { limit: 51 }), long);
  rejectPage(manyBatchPage(101), /exceeds the requested batch limit/u, { limit: 100 });

  for (const limit of [0, 101, 1.5, -1]) {
    assert.throws(() => decodePage(page, { limit }), /limit/u, String(limit));
  }
  assert.throws(
    () => decodeExecutionPublicationPage(page, { ...context, cursor: "private" } as never),
    /decode context must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodeExecutionPublicationPage(page, { definition: publicationIdentity.definition } as never),
    /decode context must contain exactly its public fields/u,
  );
});

test("decodes the Signals a committed input threw exactly as canonical-result.schema.json#/$defs/broadcast", () => {
  const origin = { processInstanceId: publicationIdentity.processInstanceId, elementId: "Throw_Go", activation: 1 };
  const named = { name: "Go", variables: runningState.variables, origin };
  const addressed = { signalRef: { id: "Signal_Go", namespace: "urn:orders" }, variables: [], businessKey: "", origin };
  const thrown = pageWithState({ ...runningState, broadcasts: [named, addressed, { signalRef: { id: "Signal_Go" }, variables: [], origin }] });
  assert.deepEqual(decodePage(thrown), thrown);
  const none = pageWithState({ ...runningState, broadcasts: [] });
  assert.deepEqual(decodePage(none), none);

  const malformed: Array<[unknown, RegExp]> = [
    [{ ...named, signalRef: addressed.signalRef }, /exactly one of name and signalRef/u],
    [{ variables: [], origin }, /exactly one of name and signalRef/u],
    [{ ...named, name: "" }, /must not be empty/u],
    [{ ...named, extra: true }, /exactly/u],
    [{ ...addressed, signalRef: { id: "" } }, /must not be empty/u],
    [{ ...addressed, signalRef: { id: "Signal_Go", namespace: 1 } }, /namespace must be a string/u],
    [{ ...addressed, signalRef: { id: "Signal_Go", local: "Go" } }, /exactly/u],
    [{ ...addressed, businessKey: 7 }, /businessKey must be a string/u],
    [{ ...named, variables: [{ name: "amount" }] }, /exactly/u],
    [{ ...named, origin: { ...origin, activation: 0 } }, /positive safe integer/u],
    [{ ...named, origin: { ...origin, elementId: "" } }, /must not be empty/u],
  ];
  for (const [broadcast, message] of malformed) {
    rejectPage(pageWithState({ ...runningState, broadcasts: [broadcast] }), message);
  }
  rejectPage(pageWithState({ ...runningState, broadcasts: {} }), /broadcasts must be a dense array/u);
});

test("binds the page to the expected definition and Process-instance identity", () => {
  const page = executionPublicationPage();
  const { definition } = page;
  const substitutions = [
    { ...definition, ref: { ...definition.ref, definitionKey: "OtherProcess" } },
    { ...definition, ref: { ...definition.ref, version: 8 } },
    { ...definition, ref: { ...definition.ref, sha256: "b".repeat(64) } },
    { ...definition, profile: "cib-seven-2.2.0:other" },
    { ...definition, sourceOverlay: { id: "overlay", sha256: "c".repeat(64) } },
  ];
  for (const substitute of substitutions) {
    rejectPage({ ...page, definition: substitute }, /definition identity does not match/u);
  }
  rejectPage({ ...page, processInstanceId: "other-instance" }, /Process-instance identity does not match/u);
  rejectPage(pageWithState({ ...runningState, instanceId: "other-instance" }), /instanceId does not match/u);

  const overlay = { id: "overlay-🚀", sha256: "c".repeat(64) };
  const overlaid = { ...definition, sourceOverlay: overlay };
  const overlaidContext = { ...context, definition: overlaid };
  const overlaidPage = { ...page, definition: overlaid };
  assert.deepEqual(decodeExecutionPublicationPage(overlaidPage, overlaidContext), overlaidPage);
  for (const drift of [{ ...overlay, id: "other" }, { ...overlay, sha256: "d".repeat(64) }, null]) {
    assert.throws(
      () => decodeExecutionPublicationPage({ ...overlaidPage, definition: { ...overlaid, sourceOverlay: drift } }, overlaidContext),
      /definition identity does not match/u,
    );
  }

  const malformed: Array<[unknown, RegExp]> = [
    [{ ...definition, ref: { ...definition.ref, sha256: "A".repeat(64) } }, /lowercase SHA-256/u],
    [{ ...definition, ref: { ...definition.ref, version: 0 } }, /positive safe integer/u],
    [{ ...definition, ref: { ...definition.ref, definitionKey: "" } }, /must not be empty/u],
    [{ ...definition, compiler: "bpmn-source-semantic-process" }, /public fields/u],
    [{ ...definition, ref: { ...definition.ref, sourceId: "source.bpmn" } }, /public fields/u],
    [{ ref: definition.ref, profile: definition.profile }, /public fields/u],
    [{ ...definition, sourceOverlay: { id: "overlay" } }, /public fields/u],
  ];
  for (const [candidate, message] of malformed) rejectPage({ ...page, definition: candidate }, message);
});

test("carries the current state only on the page that reaches the head, and may omit it there", () => {
  const complete = completedExecutionPublicationPage();
  const behind = {
    ...complete,
    pageThroughRevision: 3,
    batches: [startBatch],
  };
  assert.deepEqual(decodePage({ ...behind, current: null }), { ...behind, current: null });
  rejectPage(behind, /current appears before the head/u);

  assert.deepEqual(decodePage({ ...complete, current: null }), { ...complete, current: null });
  rejectPage({ ...complete, current: { ...complete.current, revision: 6 } }, /does not equal head/u);
  rejectPage({ ...complete, current: { ...complete.current, revision: 8 } }, /does not equal head/u);
  rejectPage({ ...complete, current: { ...complete.current, controlTokens: [] } }, /public fields/u);
  rejectPage({ ...complete, current: { revision: 7 } }, /public fields/u);
  rejectPage({ ...complete, current: { state: completedState } }, /public fields/u);
  rejectPage({ ...complete, current: undefined }, /must be an object/u);
  const { current: _current, ...withoutCurrent } = complete;
  rejectPage(withoutCurrent, /public fields/u);
});

test("keeps the current state exact: kind, instance, status and the failure only when failed", () => {
  for (const status of ["running", "completed", "cancelled"]) {
    const page = pageWithState({ ...runningState, status });
    assert.deepEqual(decodePage(page), page);
  }
  const failed = pageWithState({ ...completedState, status: "failed", failure: instanceFailure });
  assert.deepEqual(decodePage(failed), failed);

  for (const status of ["running", "completed", "cancelled"]) {
    rejectPage(pageWithState({ ...completedState, status, failure: instanceFailure }), /public fields/u);
  }
  rejectPage(pageWithState({ ...completedState, status: "failed", failure: "failed" }), /must be an object/u);
  rejectPage(pageWithState({ ...completedState, status: "failed" }), /public fields/u);
  rejectPage(pageWithState({ ...runningState, status: "failed", failure: instanceFailure }),
    /openWaits must be empty when the instance failed/u);
  rejectPage(pageWithState({ ...completedState, status: "paused" }), /status is unknown/u);
  rejectPage(pageWithState({ ...completedState, status: undefined }), /status is unknown/u);
  rejectPage(pageWithState({ ...runningState, kind: "stateObservation" }), /kind must be state/u);
  rejectPage(pageWithState({ ...runningState, instanceId: "" }), /instanceId does not match/u);
  rejectPage(pageWithState({ ...runningState, logicalTimeMs: -1 }), /nonnegative safe integer/u);
  rejectPage(pageWithState({ ...runningState, logicalTimeMs: 1.5 }), /nonnegative safe integer/u);
  const { variables: _variables, ...withoutVariables } = runningState;
  rejectPage(pageWithState(withoutVariables), /public fields/u);
  for (const retired of ["openUserTasks", "openTimers", "activeWaits", "enabledInteractions", "controlTokens"]) {
    rejectPage(pageWithState({ ...runningState, [retired]: [] }), /public fields/u);
  }
  rejectPage(pageWithState(null), /must be an object/u);
});

test("keeps variables, scopes and open waits in the engine's typed form without reinterpreting them", () => {
  const typed = [
    { name: "decimal", value: { kind: "decimal", coefficient: "12345", scale: 2 } },
    { name: "list", value: { kind: "list", value: [{ kind: "string", value: "A" }, { kind: "string", value: "A" }] } },
    { name: "map", value: { kind: "map", value: [{ name: "line2", value: { kind: "null" } }] } },
    { name: "futureKind", value: { kind: "futureKind", anything: [1, { nested: null }] } },
  ];
  const scopes = [{ scope: { processInstanceId: "process-instance-1", elementId: "SubProcess_1", activation: 2 }, variables: typed }];
  const page = pageWithState({ ...runningState, variables: typed, scopes });
  assert.deepEqual(decodePage(page), page);

  const [wait] = runningState.openWaits;
  const waits: unknown[] = [
    { ...wait, definition: { key: "Called", version: 3, versionTag: null, deployment: null, tenant: null, sourceSha256: null } },
    { ...wait, input: null },
    { ...wait, detail: { kind: "timer", dueMs: 1000 } },
  ];
  for (const openWait of waits) {
    const waitPage = pageWithState({ ...runningState, openWaits: [openWait] });
    assert.deepEqual(decodePage(waitPage), waitPage);
  }
});

test("refuses malformed variables, scopes and open waits", () => {
  const [wait] = runningState.openWaits;
  const [binding] = runningState.variables;
  const rejectedVariables: Array<[unknown, RegExp]> = [
    ["none", /dense array/u],
    [new Array<unknown>(1), /dense array/u],
    [[{ name: "", value: binding.value }], /name must not be empty/u],
    [[{ name: "alpha" }], /public fields/u],
    [[{ ...binding, extra: null }], /public fields/u],
    [[{ name: "alpha", value: true }], /must be an object/u],
    [[{ name: "alpha", value: {} }], /missing required field kind/u],
    [[{ name: "alpha", value: { kind: "" } }], /kind must not be empty/u],
    [[{ name: "alpha", value: { kind: 7 } }], /kind must be a string/u],
    [[{ name: "alpha", value: { kind: "integer", value: Number.NaN } }], /finite number/u],
    [[{ name: "alpha", value: { kind: "string", value: "\ud800" } }], /well-formed Unicode/u],
    [[{ name: "alpha", value: { kind: "list", value: [undefined] } }], /must be an object/u],
    [[{ name: "alpha", value: { kind: "list", value: new Array<unknown>(1) } }], /dense array/u],
    [[{ name: "alpha", value: { kind: "map", value: new Date(0) } }], /plain object/u],
  ];
  for (const [variables, message] of rejectedVariables) {
    rejectPage(pageWithState({ ...runningState, variables }), message);
  }
  rejectPage(pageWithState({ ...runningState, scopes: "none" }), /dense array/u);
  rejectPage(pageWithState({ ...runningState, scopes: [null] }), /must be an object/u);
  rejectPage(pageWithState({ ...runningState, scopes: [{ scope: undefined }] }), /must be an object/u);

  const rejectedWaits: Array<[unknown, RegExp]> = [
    [{ ...wait, id: { ...wait.id, activation: 0 } }, /positive safe integer/u],
    [{ ...wait, id: { ...wait.id, elementId: "" } }, /must not be empty/u],
    [{ ...wait, id: { ...wait.id, role: "element" } }, /public fields/u],
    [{ ...wait, id: wait.id.elementId }, /must be an object/u],
    [{ ...wait, definition: "Called" }, /must be an object/u],
    [{ ...wait, input: "" }, /must not be empty/u],
    [{ ...wait, input: 7 }, /must be a string/u],
    [{ ...wait, detail: {} }, /missing required field kind/u],
    [{ ...wait, detail: null }, /must be an object/u],
    [{ ...wait, extra: null }, /public fields/u],
  ];
  for (const [openWait, message] of rejectedWaits) {
    rejectPage(pageWithState({ ...runningState, openWaits: [openWait] }), message);
  }
  const { definition: _definition, ...withoutDefinition } = wait;
  rejectPage(pageWithState({ ...runningState, openWaits: [withoutDefinition] }), /public fields/u);
});

test("refuses every member outside the public fields at each level", () => {
  const page = executionPublicationPage();
  rejectPage({ ...page, workflowId: "private-host-fact" }, /public fields/u);
  rejectPage({ ...page, runId: "private-host-fact" }, /public fields/u);
  rejectPage({ ...page, batches: [{ ...startBatch, committedAt: "2026-11-09T00:00:00.000Z" }] }, /public fields/u);
  rejectPage({ ...page, current: { ...page.current, committedAt: 1 } }, /public fields/u);
  assert.throws(
    () => decodeExecutionPublicationResult({ kind: "available", page, workflowId: "private" }, context),
    /public fields/u,
  );
});

test("decodes the request: a nonnegative cursor and a limit from 1 through 100, nothing else", () => {
  assert.deepEqual(decodeExecutionPublicationRequest({ afterRevision: 0 }), { afterRevision: 0 });
  assert.deepEqual(decodeExecutionPublicationRequest({ afterRevision: 5, limit: 1 }), { afterRevision: 5, limit: 1 });
  assert.deepEqual(decodeExecutionPublicationRequest({ afterRevision: 5, limit: 100 }), { afterRevision: 5, limit: 100 });
  const rejected: Array<[unknown, RegExp]> = [
    [{}, /public fields/u],
    [{ limit: 5 }, /public fields/u],
    [{ afterRevision: -1 }, /nonnegative safe integer/u],
    [{ afterRevision: 1.5 }, /nonnegative safe integer/u],
    [{ afterRevision: "0" }, /nonnegative safe integer/u],
    [{ afterRevision: 0, limit: 0 }, /positive safe integer/u],
    [{ afterRevision: 0, limit: 101 }, /from 1 through 100/u],
    [{ afterRevision: 0, limit: undefined }, /positive safe integer/u],
    [{ afterRevision: 0, cursor: "private" }, /public fields/u],
    [null, /must be an object/u],
  ];
  for (const [request, message] of rejected) {
    assert.throws(() => decodeExecutionPublicationRequest(request), message);
  }
});

test("decodes a revision-zero export with the page rules and a required head", () => {
  const publication = executionPublicationExport();
  assert.deepEqual(decodeExecutionPublicationExport(publication, publicationIdentity), publication);

  const complete = completedExecutionPublicationPage();
  const { requestedAfterRevision: _requested, pageThroughRevision: _through, ...body } = complete;
  const full = { format: "bpmn-lean.execution-publication", ...body };
  assert.deepEqual(decodeExecutionPublicationExport(full, publicationIdentity), full);

  const rejected: Array<[unknown, RegExp]> = [
    [{ ...publication, format: "bpmn-lean.execution-publication.v1" }, /unknown format/u],
    [{ ...publication, format: "bpmn-lean.operator-audit.v1" }, /unknown format/u],
    [{ ...publication, batches: [] }, /batches must be nonempty/u],
    [{ ...publication, batches: [{ ...startBatch, fromRevision: 1 }] }, /not contiguous/u],
    [{ ...publication, headRevision: 4 }, /do not reach pageThroughRevision/u],
    [{ ...publication, headRevision: 2 }, /do not reach pageThroughRevision/u],
    [{ ...publication, current: { ...publication.current, revision: 2 } }, /does not equal head/u],
    [{ ...publication, current: { ...publication.current, state: { ...runningState, instanceId: "other" } } }, /instanceId does not match/u],
    [{ ...publication, requestedAfterRevision: 0, pageThroughRevision: 3 }, /public fields/u],
    [{ ...publication, workflowId: "private" }, /public fields/u],
    [{ ...publication, definition: { ...publication.definition, profile: "other" } }, /definition identity does not match/u],
    [{ ...publication, processInstanceId: "other-instance" }, /Process-instance identity does not match/u],
  ];
  for (const [candidate, message] of rejected) {
    assert.throws(() => decodeExecutionPublicationExport(candidate, publicationIdentity), message);
  }
  const { current: _current, ...withoutCurrent } = publication;
  assert.throws(() => decodeExecutionPublicationExport(withoutCurrent, publicationIdentity), /public fields/u);
  assert.throws(() => decodeExecutionPublicationExport({ ...publication, current: null }, publicationIdentity),
    /must carry the state committed at its head/u);
  assert.throws(
    () => decodeExecutionPublicationExport(publication, { ...publicationIdentity, extra: true } as never),
    /public fields/u,
  );
});

test("exports the whole history without the page's batch limit", () => {
  const long = manyBatchPage(101);
  const { requestedAfterRevision: _requested, pageThroughRevision: _through, ...body } = long;
  const state = { ...completedState, status: "running" };
  const full = { format: "bpmn-lean.execution-publication", ...body, current: { revision: 101, state } };
  assert.deepEqual(decodeExecutionPublicationExport(full, publicationIdentity), full);
});

test("keeps the decoded members synchronized with the producer schemas", async () => {
  const read = async (name: string) => JSON.parse(await readFile(
    new URL(`../../../contracts/schemas/${name}`, import.meta.url),
    "utf8",
  )) as { $defs: Record<string, SchemaNode> };
  const publication = (await read("semantic-publication.schema.json")).$defs;
  const result = (await read("canonical-result.schema.json")).$defs;
  const keys = (definition: SchemaNode | undefined) => Object.keys(definition!.properties!).toSorted();

  const arms = publication.role!.oneOf!;
  assert.deepEqual(
    arms.map((arm) => arm.properties!.kind!.const).toSorted(),
    Object.values(ExecutionRoleKind).toSorted(),
  );
  assert.deepEqual(
    arms.find((arm) => arm.properties!.kind!.const === ExecutionRoleKind.Input)!.properties!.input!.enum!.toSorted(),
    Object.values(ExecutionInputKind).toSorted(),
  );

  const page = executionPublicationPage();
  const [record] = startBatch.transitions;
  assert.deepEqual(keys(publication.executionPublicationPage), Object.keys(page).toSorted());
  assert.deepEqual(keys(publication.committedTransitionBatch), Object.keys(startBatch).toSorted());
  assert.deepEqual(keys(publication.committedTransitionRecord), Object.keys(record).toSorted());
  assert.deepEqual(keys(publication.currentCommittedExecution), Object.keys(page.current!).toSorted());
  assert.deepEqual(keys(publication.executionPublicationExport), Object.keys(executionPublicationExport()).toSorted());
  assert.deepEqual(keys(result.state), [...Object.keys(runningState), "broadcasts", "failure"].toSorted());
  assert.deepEqual(keys(result.broadcast), ["name", "signalRef", "variables", "businessKey", "origin"].toSorted());
  assert.deepEqual(
    result.state!.required!.toSorted(),
    Object.keys(runningState).filter((key) => key !== "scopes").toSorted(),
  );
});
