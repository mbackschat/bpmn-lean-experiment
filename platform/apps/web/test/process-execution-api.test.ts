import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeCanonicalExecutionPublicationExport,
  serializeExecutionPublicationExport,
} from "@bpmn-lean/platform-contracts";
import type {
  ExecutionPublicationPage,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import {
  ProcessExecutionApiClient,
  ProcessExecutionProtocolError,
  ProcessExecutionUnavailableError,
} from "../src/process-execution-api.ts";

const definition = {
  processId: "Process_1",
  version: 1,
  source: {
    kind: "bpmnSource",
    id: "source-publication",
    sha256: "a".repeat(64),
    byteLength: 512,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "profile-publication",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;

const instance = {
  processInstanceId: "Instance_1",
  definition,
} as const satisfies PublicProcessInstanceIdentity;

const identity = {
  definition: {
    compiler: "bpmn-source-semantic-process",
    semanticProfile: definition.semanticProfile,
    sourceId: definition.source.id,
    sourceSha256: definition.source.sha256,
    sourceOverlay: null,
  },
  processId: definition.processId,
  processInstanceId: instance.processInstanceId,
} as const;

const rootScope = {
  processInstanceId: instance.processInstanceId,
  definitionScopeId: "Scope_Process_1",
  activation: 1,
} as const;

const startBatch = {
  commandId: "command-start",
  fromRevision: 0,
  throughRevision: 2,
  transitions: [{
    revision: 1,
    logicalTimeMs: 0,
    transition: {
      kind: "externalStimulus",
      stimulus: {
        kind: "startProcess",
        commandId: "command-start",
        processId: identity.processId,
        instanceId: identity.processInstanceId,
        initialVariables: [],
      },
    },
    positionDelta: emptyDelta(),
  }, {
    revision: 2,
    logicalTimeMs: 0,
    transition: {
      kind: "internalOperation",
      operationId: "Operation_Start",
      operationKind: "initiate",
      origin: { kind: "bpmnElement", elementId: "StartEvent_1" },
      owner: rootScope,
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [{ sequenceFlowId: "Flow_1", owner: rootScope, multiplicity: 1 }],
      enteredScopes: [{ id: rootScope, parent: null, bpmnElementId: identity.processId }],
      exitedScopes: [],
    },
  }],
} as const;

const current = {
  revision: 2,
  state: {
    kind: "state",
    instanceId: identity.processInstanceId,
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
  },
  controlTokens: [{ sequenceFlowId: "Flow_1", owner: rootScope, multiplicity: 1 }],
  scopes: [{ id: rootScope, parent: null, bpmnElementId: identity.processId }],
} as const;

function page(): ExecutionPublicationPage {
  return {
    ...identity,
    requestedAfterRevision: 0,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [startBatch],
    current,
  };
}

function emptyDelta() {
  return {
    consumedTokens: [],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  } as const;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

test("reads one complete publication only from contiguous HTTP pages", async () => {
  const requests: string[] = [];
  const api = new ProcessExecutionApiClient("https://platform.test/ignored", async (input) => {
    requests.push(String(input));
    return jsonResponse(page());
  });

  const result = await api.getComplete(instance);

  assert.equal(result.headRevision, 2);
  assert.equal(result.current.revision, 2);
  assert.deepEqual(result.batches, [startBatch]);
  assert.deepEqual(requests, [
    "https://platform.test/api/v1/process-instances/Instance_1/execution?afterRevision=0&limit=100",
  ]);
});

test("rejects absent semantic owners and recursive private or duplicate fields", async () => {
  const absentOwner = structuredClone(page()) as any;
  absentOwner.batches[0].transitions[1].positionDelta.enteredScopes = [];
  absentOwner.batches[0].transitions[1].positionDelta.producedTokens = [];
  const cases = [
    JSON.stringify(absentOwner),
    JSON.stringify({
      ...page(),
      current: {
        ...current,
        state: { ...current.state, workflowId: "private-workflow" },
      },
    }),
    JSON.stringify(page()).replace(
      '"definitionScopeId":"Scope_Process_1"',
      '"definitionScopeId":"Scope_Process_1","definitionScopeId":"Private_Scope"',
    ),
  ];

  for (const body of cases) {
    const api = new ProcessExecutionApiClient("https://platform.test", async () => new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await assert.rejects(api.getComplete(instance), ProcessExecutionProtocolError);
  }
});

test("treats a gapped 503 as one fail-closed unavailable outcome", async () => {
  const api = new ProcessExecutionApiClient("https://platform.test", async () => jsonResponse({
    error: {
      code: "executionPublicationUnavailable",
      message: "The committed execution publication is unavailable.",
    },
  }, 503));

  await assert.rejects(
    api.getComplete(instance),
    (error: unknown) => error instanceof ProcessExecutionUnavailableError &&
      error.message === "The committed execution publication is unavailable.",
  );
});

test("validates canonical export metadata while returning untouched exact bytes", async () => {
  const publication = {
    format: "bpmn-lean.execution-publication.v1",
    ...identity,
    headRevision: 2,
    batches: [startBatch],
    current,
  } as const;
  const bytes = serializeExecutionPublicationExport(publication, identity);
  assert.deepEqual(decodeCanonicalExecutionPublicationExport(bytes, identity), publication);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const api = new ProcessExecutionApiClient("https://platform.test", async () => new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="execution-Instance_1.json"',
    },
  }));

  const download = await api.getExport(instance);

  assert.equal(download.filename, "execution-Instance_1.json");
  assert.deepEqual(download.bytes, bytes);
});

test("a delayed response cannot satisfy a superseded complete-history request", async () => {
  const first = Promise.withResolvers<Response>();
  let call = 0;
  const api = new ProcessExecutionApiClient("https://platform.test", async () => {
    call += 1;
    return call === 1 ? await first.promise : jsonResponse(page());
  });
  const abandoned = api.getComplete(instance);
  api.invalidate();
  const currentRequest = api.getComplete(instance);
  first.resolve(jsonResponse(page()));

  await assert.rejects(abandoned, ProcessExecutionUnavailableError);
  assert.equal((await currentRequest).headRevision, 2);
});

function exportResponse(): Response {
  const bytes = serializeExecutionPublicationExport({
    format: "bpmn-lean.execution-publication.v1",
    ...identity,
    headRevision: 2,
    batches: [startBatch],
    current,
  }, identity);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, { headers: {
    "content-type": "application/json",
    "content-disposition": 'attachment; filename="execution-Instance_1.json"',
  } });
}

for (const firstKind of ["publication", "export"] as const) {
  test(`concurrent publication and export succeed when ${firstKind} starts first`, async () => {
    const publicationResponse = Promise.withResolvers<Response>();
    const downloadResponse = Promise.withResolvers<Response>();
    const api = new ProcessExecutionApiClient("https://platform.test", async (input) =>
      new URL(String(input)).pathname.endsWith("/export")
        ? downloadResponse.promise : publicationResponse.promise);
    const publication = firstKind === "publication" ? api.getComplete(instance) : null;
    const download = api.getExport(instance);
    const results = Promise.all([publication ?? api.getComplete(instance), download]);
    downloadResponse.resolve(exportResponse());
    publicationResponse.resolve(jsonResponse(page()));
    const [snapshot, exported] = await results;
    assert.equal(snapshot.headRevision, 2);
    assert.equal(exported.filename, "execution-Instance_1.json");
    assert.equal(decodeCanonicalExecutionPublicationExport(exported.bytes, identity).headRevision, 2);
  });
}

for (const kind of ["publication", "export"] as const) {
  test(`a newer ${kind} request supersedes only the previous request of its kind`, async () => {
    const first = Promise.withResolvers<Response>();
    let calls = 0;
    const response = () => kind === "publication" ? jsonResponse(page()) : exportResponse();
    const api = new ProcessExecutionApiClient("https://platform.test", async () =>
      ++calls === 1 ? first.promise : response());
    const read = () => kind === "publication" ? api.getComplete(instance) : api.getExport(instance);
    const rejected = assert.rejects(read(), ProcessExecutionUnavailableError);
    const currentRequest = read();
    first.resolve(response());
    await rejected;
    await currentRequest;
  });
}

test("invalidating the selected instance supersedes both publication and export requests", async () => {
  const publicationResponse = Promise.withResolvers<Response>();
  const downloadResponse = Promise.withResolvers<Response>();
  const api = new ProcessExecutionApiClient("https://platform.test", async (input) =>
    new URL(String(input)).pathname.endsWith("/export")
      ? downloadResponse.promise : publicationResponse.promise);
  const publicationRejected = assert.rejects(api.getComplete(instance), ProcessExecutionUnavailableError);
  const downloadRejected = assert.rejects(api.getExport(instance), ProcessExecutionUnavailableError);
  api.invalidate();
  publicationResponse.resolve(jsonResponse(page()));
  downloadResponse.resolve(exportResponse());
  await Promise.all([publicationRejected, downloadRejected]);
});
