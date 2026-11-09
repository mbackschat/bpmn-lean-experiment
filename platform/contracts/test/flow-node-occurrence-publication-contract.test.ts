import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decodeFlowNodeOccurrencePublicationPage,
  decodeFlowNodeOccurrencePublicationRequest,
  decodeFlowNodeOccurrencePublicationResult,
  FlowNodeOccurrencePublicationResultKind,
  FlowNodeOccurrenceRole,
  FlowNodeOccurrenceTerminalKind,
  flowNodeOccurrenceKeyText,
} from "@bpmn-lean/platform-contracts";

import {
  completeOccurrenceBatch,
  emptyOccurrenceBatch,
  endEvent,
  occurrencePage,
  positiveCursorPage,
  reviewTask,
  startEvent,
  startOccurrenceBatch,
} from "./flow-node-occurrence-publication-fixture.ts";
import { publicationIdentity } from "./execution-publication-fixture.ts";

const context = { ...publicationIdentity, afterRevision: 0 } as const;

type Request = { afterRevision?: number; limit?: number };

/** The slice of a JSON Schema node the synchronization test reads. */
type SchemaNode = {
  properties?: Record<string, SchemaNode>;
  enum?: string[];
};

function decodePage(page: unknown, request: Request = {}) {
  return decodeFlowNodeOccurrencePublicationPage(page, { ...context, ...request });
}

function rejectPage(page: unknown, message: RegExp, request: Request = {}): void {
  assert.throws(() => decodePage(page, request), message);
}

/** A page over revisions 0 to 1 whose one batch has the given transitions; the transition revision is 1. */
function singleStepPage(started: unknown, ended: unknown) {
  return {
    ...publicationIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 1,
    headRevision: 1,
    batches: [{
      commandId: "step",
      fromRevision: 0,
      throughRevision: 1,
      transitions: [{ revision: 1, started, ended }],
    }],
  };
}

/** A page over revisions 0 to 3 whose first batch carries the given transitions, in revisions 1 to 3. */
function pageWithTransitions(transitions: readonly unknown[]) {
  return {
    ...publicationIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 3,
    headRevision: 3,
    batches: [{ commandId: "steps", fromRevision: 0, throughRevision: 3, transitions }],
  };
}

const start = (occurrence: unknown) => ({ occurrence, owner: 0, sourceType: "task" });
const end = (occurrence: unknown, terminal = "completed") => ({ occurrence, terminal });

test("decodes the exact occurrence page, request, and every closed result arm", () => {
  const page = occurrencePage();
  assert.deepEqual(decodeFlowNodeOccurrencePublicationRequest({ afterRevision: 0, limit: 1 }), {
    afterRevision: 0,
    limit: 1,
  });
  assert.deepEqual(decodePage(page, { limit: 1 }), page);
  assert.deepEqual(decodePage(positiveCursorPage(), { afterRevision: 3 }), positiveCursorPage());
  assert.deepEqual(decodeFlowNodeOccurrencePublicationResult({
    kind: FlowNodeOccurrencePublicationResultKind.Available,
    page,
  }, context), { kind: "available", page });
  for (const kind of ["notFound", "unavailable", "gap", "integrityFailure"] as const) {
    assert.deepEqual(decodeFlowNodeOccurrencePublicationResult({ kind }, context), { kind });
  }
});

test("refuses a page on a non-available arm, a missing page and the retired notReady kind", () => {
  const page = occurrencePage();
  for (const kind of ["notFound", "unavailable", "gap", "integrityFailure"]) {
    assert.throws(() => decodeFlowNodeOccurrencePublicationResult({ kind, page }, context), /public fields/u);
  }
  assert.throws(() => decodeFlowNodeOccurrencePublicationResult({ kind: "available" }, context), /public fields/u);
  for (const kind of ["notReady", "future"]) {
    assert.throws(() => decodeFlowNodeOccurrencePublicationResult({ kind }, context), /unknown kind/u);
  }
  assert.throws(
    () => decodeFlowNodeOccurrencePublicationResult({ kind: "available", page: { ...page, headRevision: 2 } }, context),
    /range is inconsistent/u,
  );
});

test("gives an input that began and ended no occurrence an aligned batch with no transitions", () => {
  const onlyEmpty = {
    ...publicationIdentity,
    requestedAfterRevision: 3,
    pageThroughRevision: 4,
    headRevision: 4,
    batches: [emptyOccurrenceBatch],
  };
  assert.deepEqual(decodePage(onlyEmpty, { afterRevision: 3 }), onlyEmpty);
  const fromStart = { ...onlyEmpty, requestedAfterRevision: 0, pageThroughRevision: 1, headRevision: 1, batches: [
    { ...emptyOccurrenceBatch, fromRevision: 0, throughRevision: 1 },
  ] };
  assert.deepEqual(decodePage(fromStart), fromStart);
  rejectPage({ ...onlyEmpty, batches: [{ ...emptyOccurrenceBatch, throughRevision: 3 }] }, /range is empty/u, { afterRevision: 3 });
  rejectPage({ ...onlyEmpty, batches: [{ ...emptyOccurrenceBatch, transitions: "none" }] }, /transitions must be a dense array/u, { afterRevision: 3 });
});

test("pages a cursor at the head as an empty page", () => {
  const atHead = { ...occurrencePage(), requestedAfterRevision: 3, batches: [] };
  assert.deepEqual(decodePage(atHead, { afterRevision: 3 }), atHead);
  rejectPage({ ...atHead, requestedAfterRevision: 4 }, /range is inconsistent/u, { afterRevision: 4 });
  rejectPage({ ...atHead, batches: [emptyOccurrenceBatch] }, /batch count contradicts its range/u, { afterRevision: 3 });
});

test("refuses the retired members: current-open occurrences, commit time and private anchors", () => {
  const page = occurrencePage();
  const [transition] = startOccurrenceBatch.transitions;
  rejectPage({ ...page, currentOpen: [] }, /public fields/u);
  rejectPage({ ...page, anchor: "private" }, /public fields/u);
  rejectPage({ ...page, batches: [{ ...startOccurrenceBatch, committedAtEpochMs: 100 }] }, /public fields/u);
  rejectPage({
    ...page,
    batches: [{ ...startOccurrenceBatch, transitions: [{ ...transition, lifecycle: { started: [], ended: [] } }] }],
  }, /public fields/u);
  const [first] = transition.started;
  rejectPage(pageWithTransitions([{ ...transition, started: [{ ...first, anchor: { kind: "wait", id: "private" } }] }]),
    /public fields/u);
  rejectPage(pageWithTransitions([{
    ...transition,
    started: [{ ...first, id: { processInstanceId: "process-instance-1", startRevision: 1, startIndex: 0 } }],
  }]), /public fields/u);
});

test("binds the page to the expected definition and Process-instance identity", () => {
  const page = occurrencePage();
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
  rejectPage({ ...page, definition: { ...definition, compiler: "bpmn-source-semantic-process" } }, /public fields/u);
  rejectPage({ ...page, definition: { ...definition, ref: { ...definition.ref, sha256: "A".repeat(64) } } }, /lowercase SHA-256/u);

  const overlay = { id: "overlay-🚀", sha256: "c".repeat(64) };
  const overlaid = { ...definition, sourceOverlay: overlay };
  const overlaidPage = { ...page, definition: overlaid };
  const overlaidContext = { ...context, definition: overlaid };
  assert.deepEqual(decodeFlowNodeOccurrencePublicationPage(overlaidPage, overlaidContext), overlaidPage);
  assert.throws(
    () => decodeFlowNodeOccurrencePublicationPage({ ...overlaidPage, definition: { ...overlaid, sourceOverlay: null } }, overlaidContext),
    /definition identity does not match/u,
  );
});

test("keeps revisions contiguous across steps, batches and the page range", () => {
  const complete = {
    ...publicationIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 7,
    headRevision: 7,
    batches: [startOccurrenceBatch, emptyOccurrenceBatch, completeOccurrenceBatch],
  };
  assert.deepEqual(decodePage(complete), complete);
  rejectPage({ ...complete, batches: [startOccurrenceBatch, { ...emptyOccurrenceBatch, fromRevision: 2 }, completeOccurrenceBatch] },
    /fromRevision is not contiguous/u);
  rejectPage({ ...complete, batches: [startOccurrenceBatch, emptyOccurrenceBatch] }, /do not reach pageThroughRevision/u);
  rejectPage({ ...complete, batches: [] }, /batch count contradicts its range/u);
  rejectPage({ ...complete, pageThroughRevision: 8 }, /range is inconsistent/u);
  rejectPage({ ...complete, headRevision: 0 }, /positive safe integer/u);
  rejectPage({ ...complete, batches: "none" }, /dense array/u);
  rejectPage({ ...complete, batches: [{ ...startOccurrenceBatch, commandId: "" }, emptyOccurrenceBatch, completeOccurrenceBatch] },
    /commandId must not be empty/u);
});

test("keeps each step's revision inside its batch and in increasing order", () => {
  const [first, second] = startOccurrenceBatch.transitions;
  const inside = pageWithTransitions([first, second]);
  assert.deepEqual(decodePage(inside), inside);
  const skipping = pageWithTransitions([{ ...first, revision: 2 }, { ...second, revision: 3 }]);
  assert.deepEqual(decodePage(skipping), skipping);
  const outside = /outside its batch or out of order/u;
  rejectPage(pageWithTransitions([{ ...first, revision: 0 }]), /positive safe integer/u);
  rejectPage(pageWithTransitions([{ ...first, revision: 4 }]), outside);
  rejectPage(pageWithTransitions([{ ...first, revision: 2 }, { ...second, revision: 2 }]), outside);
  rejectPage(pageWithTransitions([second, first]), outside);
  rejectPage(pageWithTransitions([{ ...first, revision: 1.5 }]), /positive safe integer/u);
});

test("requires every step to begin or end an occurrence and every fact to be exact", () => {
  rejectPage(singleStepPage([], []), /must start or end at least one occurrence/u);
  rejectPage(singleStepPage("none", []), /must start or end at least one occurrence/u);
  rejectPage(singleStepPage([], new Array<unknown>(1)), /must start or end at least one occurrence/u);

  const rejectedStarts: Array<[unknown, RegExp]> = [
    [{ ...start(startEvent), owner: -1 }, /nonnegative safe integer/u],
    [{ ...start(startEvent), owner: 1.5 }, /nonnegative safe integer/u],
    [{ ...start(startEvent), sourceType: "" }, /must not be empty/u],
    [{ ...start(startEvent), sourceType: null }, /must be a string/u],
    [{ ...start(startEvent), terminal: "completed" }, /public fields/u],
    [{ occurrence: startEvent, owner: 0 }, /public fields/u],
    [{ owner: 0, sourceType: "task" }, /public fields/u],
  ];
  for (const [fact, message] of rejectedStarts) rejectPage(singleStepPage([fact], []), message);

  const rejectedEnds: Array<[unknown, RegExp]> = [
    [{ occurrence: startEvent, terminal: "failed" }, /terminal is unknown/u],
    [{ occurrence: startEvent, terminal: "terminated" }, /terminal is unknown/u],
    [{ occurrence: startEvent }, /public fields/u],
    [{ ...end(startEvent), owner: 0 }, /public fields/u],
  ];
  for (const [fact, message] of rejectedEnds) rejectPage(singleStepPage([], [fact]), message);

  for (const terminal of Object.values(FlowNodeOccurrenceTerminalKind)) {
    const page = singleStepPage([], [end(startEvent, terminal)]);
    assert.deepEqual(decodePage(page), page);
  }
});

test("requires an exact occurrence key", () => {
  const rejected: Array<[unknown, RegExp]> = [
    [{ ...startEvent, activation: 0 }, /positive safe integer/u],
    [{ ...startEvent, activation: 1.5 }, /positive safe integer/u],
    [{ ...startEvent, activation: Number.MAX_SAFE_INTEGER + 1 }, /positive safe integer/u],
    [{ ...startEvent, role: "body" }, /role is unknown/u],
    [{ ...startEvent, elementId: "" }, /must not be empty/u],
    [{ ...startEvent, processInstanceId: "" }, /must not be empty/u],
    [{ ...startEvent, anchor: "private" }, /public fields/u],
    [{ processInstanceId: "process-instance-1", startRevision: 1, startIndex: 0 }, /public fields/u],
    [{ elementId: "StartEvent_1", activation: 1, role: "element" }, /public fields/u],
    ["StartEvent_1", /must be an object/u],
  ];
  for (const [key, message] of rejected) rejectPage(singleStepPage([start(key)], []), message);
  for (const role of Object.values(FlowNodeOccurrenceRole)) {
    const page = singleStepPage([start({ ...startEvent, role })], []);
    assert.deepEqual(decodePage(page), page);
  }
});

// An occurrence of a called instance keeps that instance's id in its key, as an open wait of the canonical state does
// (`canonical-result.schema.json#/$defs/state`: "the instance and its called instances").
test("accepts an occurrence of a called instance, whose key names its own process instance", () => {
  const called = { ...reviewTask, processInstanceId: "called-instance-9" };
  const page = singleStepPage([start(called)], []);
  assert.deepEqual(decodePage(page), page);
});

test("shows no occurrence starting or ending twice in a page, but lets a page end one it did not see begin", () => {
  const twice = /starts an occurrence again/u;
  rejectPage(pageWithTransitions([
    { revision: 1, started: [start(startEvent)], ended: [] },
    { revision: 2, started: [start(startEvent)], ended: [] },
  ]), twice);
  rejectPage(singleStepPage([start(startEvent), start(startEvent)], []), twice);
  rejectPage(pageWithTransitions([
    { revision: 1, started: [], ended: [end(startEvent)] },
    { revision: 2, started: [start(startEvent)], ended: [] },
  ]), twice);
  rejectPage(pageWithTransitions([
    { revision: 1, started: [], ended: [end(reviewTask)] },
    { revision: 2, started: [], ended: [end(reviewTask, "cancelled")] },
  ]), /ends an occurrence again/u);
  rejectPage(singleStepPage([], [end(reviewTask), end(reviewTask)]), /ends an occurrence again/u);

  const across = {
    ...publicationIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 4,
    headRevision: 4,
    batches: [
      { commandId: "first", fromRevision: 0, throughRevision: 2, transitions: [{ revision: 1, started: [start(endEvent)], ended: [] }] },
      { commandId: "second", fromRevision: 2, throughRevision: 4, transitions: [{ revision: 3, started: [start(endEvent)], ended: [] }] },
    ],
  };
  rejectPage(across, twice);

  const beganAndEnded = singleStepPage([start(startEvent)], [end(startEvent)]);
  assert.deepEqual(decodePage(beganAndEnded), beganAndEnded);
  const unseen = singleStepPage([], [end(reviewTask)]);
  assert.deepEqual(decodePage(unseen), unseen);
  const distinct = singleStepPage([
    start(startEvent),
    start({ ...startEvent, activation: 2 }),
    start({ ...startEvent, role: "multiInstanceBody" }),
  ], []);
  assert.deepEqual(decodePage(distinct), distinct);
});

test("binds the page to the requested cursor and batch limit", () => {
  const page = positiveCursorPage();
  assert.deepEqual(decodePage(page, { afterRevision: 3, limit: 2 }), page);
  rejectPage(page, /exceeds the requested batch limit/u, { afterRevision: 3, limit: 1 });
  rejectPage(page, /cursor does not match the request/u, { afterRevision: 0 });
  rejectPage(occurrencePage(), /cursor does not match the request/u, { afterRevision: 3 });

  const many = {
    ...publicationIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 51,
    headRevision: 51,
    batches: Array.from({ length: 51 }, (_, index) => ({
      commandId: `command-${index + 1}`,
      fromRevision: index,
      throughRevision: index + 1,
      transitions: [],
    })),
  };
  rejectPage(many, /exceeds the requested batch limit/u);
  assert.deepEqual(decodePage(many, { limit: 51 }), many);

  for (const limit of [0, 101, 1.5, -1]) {
    assert.throws(() => decodePage(page, { afterRevision: 3, limit }), /limit/u, String(limit));
  }
  assert.throws(
    () => decodeFlowNodeOccurrencePublicationPage(page, { ...context, afterRevision: 3, cursor: "private" } as never),
    /decode context must contain exactly its public fields/u,
  );
});

test("decodes the request: a nonnegative cursor and a limit from 1 through 100, nothing else", () => {
  assert.deepEqual(decodeFlowNodeOccurrencePublicationRequest({ afterRevision: 0 }), { afterRevision: 0 });
  assert.deepEqual(decodeFlowNodeOccurrencePublicationRequest({ afterRevision: 4, limit: 100 }), {
    afterRevision: 4,
    limit: 100,
  });
  const rejected: Array<[unknown, RegExp]> = [
    [{}, /public fields/u],
    [{ afterRevision: -1 }, /nonnegative safe integer/u],
    [{ afterRevision: 0, limit: 0 }, /positive safe integer/u],
    [{ afterRevision: 0, limit: 101 }, /from 1 through 100/u],
    [{ afterRevision: 0, workflowId: "private" }, /public fields/u],
    [[], /must be an object/u],
  ];
  for (const [request, message] of rejected) {
    assert.throws(() => decodeFlowNodeOccurrencePublicationRequest(request), message);
  }
});

test("derives a canonical occurrence key text that separates every key member", () => {
  assert.equal(
    flowNodeOccurrenceKeyText(startEvent),
    '["process-instance-1","StartEvent_1",1,"element"]',
  );
  const texts = new Set([
    flowNodeOccurrenceKeyText(startEvent),
    flowNodeOccurrenceKeyText({ ...startEvent, activation: 2 }),
    flowNodeOccurrenceKeyText({ ...startEvent, role: "multiInstanceBody" }),
    flowNodeOccurrenceKeyText({ ...startEvent, processInstanceId: "other" }),
    flowNodeOccurrenceKeyText({ ...startEvent, elementId: "StartEvent_1\",1,\"element" }),
    flowNodeOccurrenceKeyText({ ...startEvent, processInstanceId: "process-instance-1\",\"StartEvent_1", elementId: "x" }),
  ]);
  assert.equal(texts.size, 6);
  assert.equal(flowNodeOccurrenceKeyText({ ...startEvent }), flowNodeOccurrenceKeyText(startEvent));
});

test("keeps role, terminal and member names synchronized with the producer schema", async () => {
  const { $defs: schema } = JSON.parse(await readFile(
    new URL("../../../contracts/schemas/flow-node-occurrence-publication.schema.json", import.meta.url),
    "utf8",
  )) as { $defs: Record<string, SchemaNode> };
  const keys = (definition: SchemaNode | undefined) => Object.keys(definition!.properties!).toSorted();

  assert.deepEqual(
    schema.occurrenceKey!.properties!.role!.enum!.toSorted(),
    Object.values(FlowNodeOccurrenceRole).toSorted(),
  );
  assert.deepEqual(
    schema.flowNodeOccurrenceEnd!.properties!.terminal!.enum!.toSorted(),
    Object.values(FlowNodeOccurrenceTerminalKind).toSorted(),
  );
  const [first, second] = startOccurrenceBatch.transitions;
  assert.deepEqual(keys(schema.flowNodeOccurrencePage), Object.keys(occurrencePage()).toSorted());
  assert.deepEqual(keys(schema.flowNodeOccurrenceBatch), Object.keys(startOccurrenceBatch).toSorted());
  assert.deepEqual(keys(schema.flowNodeOccurrenceTransition), Object.keys(first).toSorted());
  assert.deepEqual(keys(schema.flowNodeOccurrenceStart), Object.keys(first.started[0]).toSorted());
  assert.deepEqual(keys(schema.flowNodeOccurrenceEnd), Object.keys(second.ended[0]).toSorted());
  assert.deepEqual(keys(schema.occurrenceKey), Object.keys(startEvent).toSorted());
});
