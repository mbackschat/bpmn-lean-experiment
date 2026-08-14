import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeFlowNodeOccurrencePublicationPage,
  decodeFlowNodeOccurrencePublicationRequest,
  decodeFlowNodeOccurrencePublicationResult,
  flowNodeOccurrencePublicationIdentityForPublicProcessInstance,
  FlowNodeOccurrencePublicationResultKind,
} from "@bpmn-lean/platform-contracts";

import {
  occurrenceIdentity,
  occurrencePage,
  positiveCursorPage,
} from "./flow-node-occurrence-publication-fixture.ts";

test("decodes the exact occurrence page, request, and every closed result arm", () => {
  const page = occurrencePage();
  assert.deepEqual(decodeFlowNodeOccurrencePublicationRequest({
    afterRevision: 0,
    limit: 1,
  }), { afterRevision: 0, limit: 1 });
  assert.deepEqual(decodeFlowNodeOccurrencePublicationPage(page, {
    ...occurrenceIdentity,
    afterRevision: 0,
    limit: 1,
  }), page);
  assert.deepEqual(decodeFlowNodeOccurrencePublicationResult({
    kind: FlowNodeOccurrencePublicationResultKind.Available,
    page,
  }, { ...occurrenceIdentity, afterRevision: 0, limit: 1 }), {
    kind: "available",
    page,
  });
  for (const kind of ["notReady", "notFound", "unavailable", "gap"] as const) {
    assert.deepEqual(decodeFlowNodeOccurrencePublicationResult(
      { kind },
      { ...occurrenceIdentity, afterRevision: 0 },
    ), { kind });
  }
});

test("derives the Product 1 identity from one exact public Process instance", () => {
  assert.deepEqual(flowNodeOccurrencePublicationIdentityForPublicProcessInstance({
    processInstanceId: occurrenceIdentity.processInstanceId,
    definition: {
      processId: occurrenceIdentity.processId,
      version: 3,
      source: {
        kind: "bpmnSource",
        id: occurrenceIdentity.definition.sourceId,
        sha256: occurrenceIdentity.definition.sourceSha256,
        byteLength: 42,
        declaredEncoding: "UTF-8",
        decodedAs: "UTF-8",
      },
      semanticProfile: occurrenceIdentity.definition.semanticProfile,
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  }), occurrenceIdentity);
});

test("rejects nested identity substitutions and private occurrence anchors", () => {
  const page = occurrencePage();
  const transition = page.batches[0]!.transitions[0]!;
  const start = transition.lifecycle.started[0]!;
  assert.throws(() => decodeFlowNodeOccurrencePublicationPage({
    ...page,
    definition: { ...page.definition, sourceSha256: "b".repeat(64) },
  }, { ...occurrenceIdentity, afterRevision: 0 }), /definition identity/u);
  assert.throws(() => decodeFlowNodeOccurrencePublicationPage({
    ...page,
    batches: [{
      ...page.batches[0]!,
      transitions: [{
        ...transition,
        lifecycle: {
          ...transition.lifecycle,
          started: [{
            ...start,
            id: { ...start.id, processInstanceId: "substituted-host" },
            anchor: { kind: "wait", id: "private" },
          }, transition.lifecycle.started[1]],
        },
      }],
    }],
  }, { ...occurrenceIdentity, afterRevision: 0 }), /public fields|Process-instance/u);
});

test("rejects duplicate, order, range, time, integer, and unknown-field violations", () => {
  const page = occurrencePage();
  const transition = page.batches[0]!.transitions[0]!;
  const starts = transition.lifecycle.started;
  const invalid = [
    { ...page, anchor: "private" },
    { ...page, pageThroughRevision: 2 },
    {
      ...page,
      batches: [{ ...page.batches[0]!, committedAtEpochMs: Number.MAX_SAFE_INTEGER + 1 }],
    },
    {
      ...page,
      batches: [{
        ...page.batches[0]!,
        transitions: [{
          ...transition,
          lifecycle: {
            started: starts,
            ended: [
              { id: starts[1]!.id, terminal: "completed" },
              { id: starts[0]!.id, terminal: "completed" },
            ],
          },
        }],
      }],
      currentOpen: [],
    },
    {
      ...page,
      batches: [{
        ...page.batches[0]!,
        transitions: [{
          ...transition,
          lifecycle: {
            ...transition.lifecycle,
            ended: [transition.lifecycle.ended[0], transition.lifecycle.ended[0]],
          },
        }],
      }],
    },
    {
      ...page,
      batches: [{
        ...page.batches[0]!,
        transitions: [{
          ...transition,
          lifecycle: {
            ...transition.lifecycle,
            started: [starts[0], {
              ...starts[1],
              id: { ...starts[1]!.id, startIndex: Number.MAX_SAFE_INTEGER + 1 },
            }],
          },
        }],
      }],
    },
  ];
  for (const candidate of invalid) {
    assert.throws(() => decodeFlowNodeOccurrencePublicationPage(
      candidate,
      { ...occurrenceIdentity, afterRevision: 0 },
    ));
  }
  assert.throws(() => decodeFlowNodeOccurrencePublicationRequest({
    afterRevision: 0,
    limit: 101,
  }), /1 through 100/u);
  assert.throws(() => decodeFlowNodeOccurrencePublicationRequest({
    afterRevision: 0,
    workflowId: "private",
  }), /public fields/u);
});

test("accepts a positive-cursor visible suffix without inventing its unseen open anchor", () => {
  const page = positiveCursorPage();
  assert.deepEqual(decodeFlowNodeOccurrencePublicationPage(page, {
    ...occurrenceIdentity,
    afterRevision: 1,
  }), page);
  const unseenOpen = occurrencePage().currentOpen[0]!;
  const emptySuffixAtHead = {
    ...occurrenceIdentity,
    requestedAfterRevision: 2,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [],
    currentOpen: [unseenOpen],
  };
  assert.deepEqual(decodeFlowNodeOccurrencePublicationPage(emptySuffixAtHead, {
    ...occurrenceIdentity,
    afterRevision: 2,
  }), emptySuffixAtHead);
});

test("rejects nondecreasing-time and visible-start fold violations independently", () => {
  const first = occurrencePage();
  const second = positiveCursorPage().batches[0]!;
  const complete = {
    ...first,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [first.batches[0], second],
    currentOpen: [],
  };
  assert.deepEqual(decodeFlowNodeOccurrencePublicationPage(complete, {
    ...occurrenceIdentity,
    afterRevision: 0,
  }), complete);
  assert.throws(() => decodeFlowNodeOccurrencePublicationPage({
    ...complete,
    batches: [complete.batches[0], { ...complete.batches[1], committedAtEpochMs: 99 }],
  }, { ...occurrenceIdentity, afterRevision: 0 }), /regress/u);
  assert.throws(() => decodeFlowNodeOccurrencePublicationPage({
    ...positiveCursorPage(),
    requestedAfterRevision: 0,
    pageThroughRevision: 1,
    headRevision: 1,
    batches: [{
      ...second,
      fromRevision: 0,
      throughRevision: 1,
      transitions: [{ ...second.transitions[0], revision: 1 }],
    }],
  }, { ...occurrenceIdentity, afterRevision: 0 }), /terminal|start|contiguous/u);
});
