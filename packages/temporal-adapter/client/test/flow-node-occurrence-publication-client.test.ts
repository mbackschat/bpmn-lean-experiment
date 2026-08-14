import assert from "node:assert/strict";
import test from "node:test";

import { SemanticProcessCompilerId } from "@bpmn-lean/semantic-core";
import { WorkflowNotFoundError } from "@temporalio/client";

import {
  observeTemporalFlowNodeOccurrences,
} from "../dist/flow-node-occurrence-publication-client.js";

const definition = {
  compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
  semanticProfile: "profile-occurrences",
  sourceId: "source-occurrences",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;
const processId = "Process_1";
const processInstanceId = "Instance_1";
const expected = { definition, processId, processInstanceId } as const;
const owner = {
  processInstanceId,
  definitionScopeId: "Scope_Process_1",
  activation: 1,
} as const;

test("queries the exact occurrence address and validates the public transport page", async () => {
  const calls: unknown[] = [];
  const page = occurrencePage();
  const client = fakeClient({
    execution: {
      query: async (name, request) => {
        calls.push({ name, request });
        return { kind: "available", page };
      },
    },
  });
  assert.deepEqual(
    await observeTemporalFlowNodeOccurrences(
      client,
      "execution",
      expected,
      { afterRevision: 0, limit: 1 },
    ),
    { kind: "available", page },
  );
  assert.deepEqual(calls, [{
    name: "bpmn-flow-node-occurrences",
    request: { afterRevision: 0, limit: 1 },
  }]);
});

test("fails closed on identity, range, cursor, private-anchor, and shape substitutions", async () => {
  const mutations: Array<(page: ReturnType<typeof occurrencePage>) => void> = [
    (page) => { page.definition.semanticProfile = "other-profile"; },
    (page) => { page.definition.sourceSha256 = "b".repeat(64); },
    (page) => { page.processId = "Other_Process"; },
    (page) => { page.processInstanceId = "Other_Instance"; },
    (page) => { page.requestedAfterRevision = 1; },
    (page) => { page.pageThroughRevision = 0; },
    (page) => { Object.assign(page, { privateAnchor: "forbidden" }); },
    (page) => {
      Object.assign(
        page.batches[0].transitions[0].lifecycle.started[0],
        { anchor: { kind: "wait" } },
      );
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const page = structuredClone(occurrencePage());
    mutate(page);
    await assert.rejects(
      observeTemporalFlowNodeOccurrences(
        fakeClient({
          execution: {
            query: async () => ({ kind: "available", page }),
          },
        }),
        "execution",
        expected,
        { afterRevision: 0, limit: 1 },
      ),
      /malformed flow-node occurrence publication transport result/u,
      `mutation ${index} must fail closed`,
    );
  }
});

test("preserves every closed result arm and separates transport failures", async () => {
  const client = fakeClient({
    missing: {
      query: async () => {
        throw new WorkflowNotFoundError("not found", "missing", undefined);
      },
    },
    unavailable: { query: async () => { throw new Error("transport"); } },
    starting: { query: async () => ({ kind: "notReady" }) },
    gap: { query: async () => ({ kind: "gap" }) },
  });
  assert.deepEqual(
    await observeTemporalFlowNodeOccurrences(
      client,
      "missing",
      expected,
      { afterRevision: 0 },
    ),
    { kind: "notFound" },
  );
  assert.deepEqual(
    await observeTemporalFlowNodeOccurrences(
      client,
      "unavailable",
      expected,
      { afterRevision: 0 },
    ),
    { kind: "unavailable" },
  );
  assert.deepEqual(
    await observeTemporalFlowNodeOccurrences(
      client,
      "starting",
      expected,
      { afterRevision: 17 },
    ),
    { kind: "notReady" },
  );
  assert.deepEqual(
    await observeTemporalFlowNodeOccurrences(
      client,
      "gap",
      expected,
      { afterRevision: 17 },
    ),
    { kind: "gap" },
  );
});

test("accepts a representation-free positive cursor and rejects malformed requests before Query", async () => {
  const positive = occurrencePage();
  positive.requestedAfterRevision = 1;
  positive.pageThroughRevision = 1;
  positive.batches = [];
  positive.currentOpen[0].id.startIndex = 9;
  positive.currentOpen[0].elementId = "Unseen_Prefix_Element";
  const calls: unknown[] = [];
  const client = fakeClient({
    execution: {
      query: async (name, request) => {
        calls.push({ name, request });
        return { kind: "available", page: positive };
      },
    },
  });
  assert.deepEqual(
    await observeTemporalFlowNodeOccurrences(
      client,
      "execution",
      expected,
      { afterRevision: 1 },
    ),
    { kind: "available", page: positive },
  );
  for (const request of [
    { afterRevision: -1 },
    { afterRevision: 0, limit: 0 },
    { afterRevision: 0, limit: 101 },
    { afterRevision: 0, extra: true },
  ]) {
    await assert.rejects(
      observeTemporalFlowNodeOccurrences(
        client,
        "execution",
        expected,
        request as never,
      ),
      /malformed flow-node occurrence publication request/u,
    );
  }
  assert.equal(calls.length, 1);
});

function occurrencePage() {
  const started = {
    id: {
      processInstanceId,
      startRevision: 1,
      startIndex: 0,
    },
    processId,
    elementId: "Task_1",
    owner,
  };
  return {
    definition: structuredClone(definition),
    processId,
    processInstanceId,
    requestedAfterRevision: 0,
    pageThroughRevision: 1,
    headRevision: 1,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 1,
      committedAtEpochMs: 1_000,
      transitions: [{
        revision: 1,
        lifecycle: { started: [started], ended: [] },
      }],
    }],
    currentOpen: [{ ...started, startedAtEpochMs: 1_000 }],
  };
}

type FakeHandle = Readonly<{
  query: (name: string, request: unknown) => Promise<unknown>;
}>;

function fakeClient(handles: Readonly<Record<string, FakeHandle>>): never {
  return {
    getHandle: (workflowId: string) => handles[workflowId] ?? {
      query: async () => {
        throw new WorkflowNotFoundError("not found", workflowId, undefined);
      },
    },
  } as never;
}
