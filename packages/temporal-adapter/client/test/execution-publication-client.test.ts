import assert from "node:assert/strict";
import test from "node:test";

import { SemanticProcessCompilerId } from "@bpmn-lean/semantic-core";
import {
  QueryNotRegisteredError,
  WorkflowNotFoundError,
} from "@temporalio/client";
import {
  bpmnWorkflowPublicationSegmentDescriptorV1,
  bpmnWorkflowPublicationSegmentDirectoryV1,
  bpmnWorkflowPublicationSegmentQueryName,
  bpmnWorkflowPublicationSegmentSelectionQueryName,
  bpmnWorkflowPublicationSegmentsV1,
  workflowPublicationSegmentSha256,
} from "@bpmn-lean/temporal-protocol";

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

test("selects the retained segment that owns a cursor before the latest Run", async () => {
  const fixture = retainedSegmentFixture();
  const calls: unknown[] = [];
  const client = fakeClient({
    execution: {
      segmentQueries: true,
      query: async (name, request) => {
        calls.push({ name, request });
        assert.equal(name, bpmnWorkflowPublicationSegmentSelectionQueryName);
        return fixture.selection;
      },
    },
    "closed-run": {
      segmentQueries: true,
      query: async (name, request) => {
        calls.push({ name, request });
        assert.equal(name, bpmnWorkflowPublicationSegmentQueryName);
        return fixture.segmentResponse(request);
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
    { kind: "available", page: fixture.execution },
  );
  assert.equal(calls.length, 2);
});

test("rejects a selected-Run descriptor substitution", async () => {
  const fixture = retainedSegmentFixture();
  const client = fakeClient({
    execution: {
      segmentQueries: true,
      query: async () => fixture.selection,
    },
    "closed-run": {
      segmentQueries: true,
      query: async (_name, request) => ({
        ...fixture.segmentResponse(request),
        descriptor: {
          ...fixture.selected,
          sha256: "f".repeat(64),
        },
      }),
    },
  });

  await assert.rejects(
    observeTemporalExecutionPublication(
      client,
      "execution",
      expected,
      { afterRevision: 0, limit: 1 },
    ),
    /segment response identity mismatch/u,
  );
});

test("maps an unavailable selected closed Run to unavailable", async () => {
  const fixture = retainedSegmentFixture();
  const client = fakeClient({
    execution: {
      segmentQueries: true,
      query: async () => fixture.selection,
    },
    "closed-run": {
      segmentQueries: true,
      query: async () => {
        throw new WorkflowNotFoundError("not retained", "execution", "closed-run");
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
    { kind: "unavailable" },
  );
});

test("does not treat a generic selection failure as a legacy Workflow", async () => {
  let queries = 0;
  const client = fakeClient({
    execution: {
      segmentQueries: true,
      query: async () => {
        queries += 1;
        throw new Error("selection transport failed");
      },
    },
  });

  assert.deepEqual(
    await observeTemporalExecutionPublication(
      client,
      "execution",
      expected,
      { afterRevision: 0 },
    ),
    { kind: "unavailable" },
  );
  assert.equal(queries, 1);
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

function retainedSegmentFixture() {
  const execution = structuredClone(publicationPage());
  execution.headRevision = 3;
  execution.current = null;
  const flowNodeOccurrences = alignedOccurrencePage();
  const selected = {
    format: bpmnWorkflowPublicationSegmentDescriptorV1,
    runId: "closed-run",
    runOrdinal: 1,
    fromRevision: 0,
    throughRevision: 1,
    sha256: workflowPublicationSegmentSha256(
      execution.batches,
      flowNodeOccurrences.batches,
    ),
  } as const;
  const currentRun = {
    format: bpmnWorkflowPublicationSegmentDescriptorV1,
    runId: "current-run",
    runOrdinal: 2,
    fromRevision: 1,
    throughRevision: 3,
    sha256: "c".repeat(64),
  } as const;
  const originalCurrent = publicationPage().current;
  if (originalCurrent === null) assert.fail("publication fixture has no current fold");
  const current = { ...structuredClone(originalCurrent), revision: 3 };
  const snapshot = {
    definition,
    processId,
    processInstanceId,
    headRevision: 3,
    current,
    currentOpen: [],
  } as const;
  const selection = {
    protocol: bpmnWorkflowPublicationSegmentsV1,
    processInstanceId,
    afterRevision: 0,
    limit: 1,
    kind: "available",
    directory: {
      format: bpmnWorkflowPublicationSegmentDirectoryV1,
      segments: [selected],
    },
    selected,
    currentRun,
    snapshot,
  } as const;
  return {
    execution,
    selected,
    selection,
    segmentResponse: (request: unknown) => ({
      ...(request as Record<string, unknown>),
      kind: "available",
      execution: { kind: "available", page: execution },
      flowNodeOccurrences: { kind: "available", page: flowNodeOccurrences },
    }),
  };
}

function alignedOccurrencePage() {
  return {
    definition,
    processId,
    processInstanceId,
    requestedAfterRevision: 0,
    pageThroughRevision: 1,
    headRevision: 3,
    batches: [{
      commandId: "start",
      fromRevision: 0,
      throughRevision: 1,
      committedAtEpochMs: 1_000,
      transitions: [{
        revision: 1,
        lifecycle: {
          started: [{
            id: { processInstanceId, startRevision: 1, startIndex: 0 },
            processId,
            elementId: "Task_1",
            owner: {
              processInstanceId,
              definitionScopeId: "Scope_Process_1",
              activation: 1,
            },
          }],
          ended: [],
        },
      }],
    }],
    currentOpen: null,
  } as const;
}

type FakeHandle = Readonly<{
  segmentQueries?: boolean;
  query: (name: string, request: unknown) => Promise<unknown>;
}>;

function fakeClient(handles: Readonly<Record<string, FakeHandle>>): never {
  return {
    getHandle: (workflowId: string, runId?: string) => {
      const handle = handles[runId ?? workflowId];
      if (handle === undefined) return {
        query: async () => {
          throw new WorkflowNotFoundError("not found", workflowId, runId);
        },
      };
      return {
        query: async (name: string, request: unknown) => {
          if (name === bpmnWorkflowPublicationSegmentSelectionQueryName &&
            handle.segmentQueries !== true) {
            throw new QueryNotRegisteredError("not registered", 0 as never);
          }
          return handle.query(name, request);
        },
      };
    },
  } as never;
}
