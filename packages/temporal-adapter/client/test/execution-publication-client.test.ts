import assert from "node:assert/strict";
import test from "node:test";

import { SemanticProcessCompilerId } from "@bpmn-lean/semantic-core";
import { WorkflowNotFoundError } from "@temporalio/client";

import {
  observeTemporalExecutionPublication,
} from "../dist/execution-publication-client.js";

const definition = {
  compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
  semanticProfile: "profile-publication",
  sourceId: "source-publication",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;
const processId = "Process_1";
const processInstanceId = "Instance_1";
const expected = { definition, processId, processInstanceId } as const;

test("queries the exact address and strictly validates the public transport page", async () => {
  const calls: unknown[] = [];
  const page = publicationPage();
  const client = fakeClient({
    execution: {
      query: async (name, request) => {
        calls.push({ name, request });
        return { kind: "available", page };
      },
    },
  });
  assert.deepEqual(
    await observeTemporalExecutionPublication(
      client,
      "execution",
      expected,
      { afterRevision: 0, limit: 1 },
    ),
    { kind: "available", page },
  );
  assert.deepEqual(calls, [{
    name: "bpmn-execution-publication",
    request: { afterRevision: 0, limit: 1 },
  }]);
});

test("rejects malformed range, identity, and extra content", async () => {
  const page = publicationPage();
  const malformed = [
    { ...page, processInstanceId: "other" },
    {
      ...page,
      pageThroughRevision: 0,
      headRevision: 0,
      batches: [],
      current: null,
    },
    {
      ...page,
      batches: [{ ...page.batches[0], throughRevision: 2 }],
    },
    { ...page, headRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...page, extra: true },
  ];
  for (const [index, candidate] of malformed.entries()) {
    await assert.rejects(
      observeTemporalExecutionPublication(
        fakeClient({
          execution: {
            query: async () => ({ kind: "available", page: candidate }),
          },
        }),
        "execution",
        expected,
        { afterRevision: 0 },
      ),
      /malformed execution publication transport result/u,
      `mutation ${index} must fail closed`,
    );
  }
});

test("maps unknown and unavailable transport separately and accepts notReady for any cursor", async () => {
  const client = fakeClient({
    missing: {
      query: async () => {
        throw new WorkflowNotFoundError("not found", "missing", undefined);
      },
    },
    unavailable: { query: async () => { throw new Error("transport"); } },
    starting: { query: async () => ({ kind: "notReady" }) },
  });
  assert.deepEqual(
    await observeTemporalExecutionPublication(
      client,
      "missing",
      expected,
      { afterRevision: 0 },
    ),
    { kind: "notFound" },
  );
  assert.deepEqual(
    await observeTemporalExecutionPublication(
      client,
      "unavailable",
      expected,
      { afterRevision: 0 },
    ),
    { kind: "unavailable" },
  );
  assert.deepEqual(
    await observeTemporalExecutionPublication(
      client,
      "starting",
      expected,
      { afterRevision: 17 },
    ),
    { kind: "notReady" },
  );
});

test("rejects malformed requests before issuing a Query", async () => {
  let queried = false;
  const client = fakeClient({
    execution: { query: async () => { queried = true; return { kind: "notReady" }; } },
  });
  for (const request of [
    { afterRevision: -1 },
    { afterRevision: 0, limit: 0 },
    { afterRevision: 0, limit: 101 },
    { afterRevision: 0, extra: true },
  ]) {
    await assert.rejects(
      observeTemporalExecutionPublication(
        client,
        "execution",
        expected,
        request as never,
      ),
      /malformed execution publication request/u,
    );
  }
  assert.equal(queried, false);
});

function publicationPage() {
  const state = {
    kind: "state",
    instanceId: processInstanceId,
    status: "running",
    activeWaits: [],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    variables: [],
    enabledInteractions: [],
    logicalTimeMs: 0,
  } as const;
  const emptyDelta = {
    consumedTokens: [],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  } as const;
  return {
    definition,
    processId,
    processInstanceId,
    requestedAfterRevision: 0,
    pageThroughRevision: 1,
    headRevision: 1,
    batches: [{
      commandId: "start",
      fromRevision: 0,
      throughRevision: 1,
      transitions: [{
        revision: 1,
        logicalTimeMs: 0,
        transition: {
          kind: "externalStimulus",
          stimulus: {
            kind: "startProcess",
            commandId: "start",
            processId,
            instanceId: processInstanceId,
            initialVariables: [],
          },
        },
        positionDelta: emptyDelta,
      }],
    }],
    current: {
      revision: 1,
      state,
      controlTokens: [],
      scopes: [],
    },
  } as const;
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
