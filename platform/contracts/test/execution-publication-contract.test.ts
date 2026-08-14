import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeExecutionPublicationExport,
  decodeExecutionPublicationPage,
  decodeExecutionPublicationResult,
  executionPublicationIdentityForPublicProcessInstance,
  ExecutionPublicationResultKind,
} from "@bpmn-lean/platform-contracts";

import {
  executionPublicationExport,
  executionPublicationPage,
  publicationIdentity,
} from "./execution-publication-fixture.ts";

test("decodes one exact page and every closed result arm", () => {
  const page = executionPublicationPage();
  assert.deepEqual(decodeExecutionPublicationPage(page, {
    ...publicationIdentity,
    afterRevision: 0,
    limit: 1,
  }), page);
  assert.deepEqual(decodeExecutionPublicationResult({
    kind: ExecutionPublicationResultKind.Available,
    page,
  }, {
    ...publicationIdentity,
    afterRevision: 0,
    limit: 1,
  }), { kind: "available", page });
  for (const kind of ["notReady", "notFound", "unavailable", "gap"] as const) {
    assert.deepEqual(decodeExecutionPublicationResult({ kind }, {
      ...publicationIdentity,
      afterRevision: 0,
    }), { kind });
  }
});

test("derives the exact current admitted Product 2 identity without a host locator", () => {
  assert.deepEqual(executionPublicationIdentityForPublicProcessInstance({
    processInstanceId: "process-instance-1",
    definition: {
      processId: "PublicationProcess",
      version: 7,
      source: {
        kind: "bpmnSource",
        id: "publication-🚀.bpmn",
        sha256: "a".repeat(64),
        byteLength: 42,
        declaredEncoding: "UTF-8",
        decodedAs: "UTF-8",
      },
      semanticProfile: "cib-seven-2.2.0:publication-test",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  }), publicationIdentity);
});

test("rejects nested definition and current-instance substitutions", () => {
  const page = executionPublicationPage();
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...page,
      definition: { ...page.definition, sourceId: "other.bpmn" },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /definition identity/u,
  );
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...page,
      current: {
        ...page.current!,
        state: { ...page.current!.state, instanceId: "other-instance" },
      },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /instance/u,
  );
});

test("rejects malformed ranges, limits, duplicates, order, and private fields", () => {
  const page = executionPublicationPage();
  const batch = page.batches[0]!;
  const duplicate = { ...batch.transitions[0]!, revision: 2 };
  const invalidPages = [
    { ...page, pageThroughRevision: 2 },
    { ...page, batches: [{ ...batch, throughRevision: 2 }] },
    { ...page, batches: [{ ...batch, transitions: [batch.transitions[0], duplicate] }] },
    { ...page, workflowId: "private-host-fact" },
  ];
  for (const invalid of invalidPages) {
    assert.throws(
      () => decodeExecutionPublicationPage(invalid, {
        ...publicationIdentity,
        afterRevision: 0,
        limit: 1,
      }),
    );
  }
  assert.throws(
    () => decodeExecutionPublicationPage(page, {
      ...publicationIdentity,
      afterRevision: 0,
      limit: 0,
    }),
    /limit/u,
  );
  const state = page.current!.state;
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...page,
      current: {
        ...page.current!,
        state: {
          ...state,
          variables: state.variables.toReversed(),
        },
      },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /canonical/u,
  );
});

test("validates internal-operation, state, and public-position classes recursively", () => {
  const page = executionPublicationPage();
  const root = page.current!.scopes[0]!;
  const token = {
    sequenceFlowId: "Flow_Join",
    owner: root.id,
    multiplicity: 1,
  } as const;
  const internal = {
    revision: 2,
    logicalTimeMs: 0,
    transition: {
      kind: "internalOperation",
      operationId: "duplicate-fork",
      operationKind: "duplicate",
      origin: { kind: "bpmnElement", elementId: "Fork" },
      owner: root.id,
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [token],
      enteredScopes: [],
      exitedScopes: [],
    },
  } as const;
  const internalPage = {
    ...page,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [{
      ...page.batches[0]!,
      throughRevision: 2,
      transitions: [page.batches[0]!.transitions[0]!, internal],
    }],
    current: {
      ...page.current!,
      revision: 2,
      controlTokens: [token],
    },
  };
  assert.deepEqual(
    decodeExecutionPublicationPage(internalPage, {
      ...publicationIdentity,
      afterRevision: 0,
    }),
    internalPage,
  );

  assert.throws(
    () => decodeExecutionPublicationPage({
      ...internalPage,
      batches: [{
        ...internalPage.batches[0]!,
        transitions: [
          internalPage.batches[0]!.transitions[0]!,
          {
            ...internal,
            transition: { ...internal.transition, operationKind: "futureOperation" },
          },
        ],
      }],
    }, { ...publicationIdentity, afterRevision: 0 }),
    /operationKind/u,
  );
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...internalPage,
      current: {
        ...internalPage.current,
        state: { ...internalPage.current.state, status: "paused" },
      },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /status/u,
  );
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...internalPage,
      current: {
        ...internalPage.current,
        controlTokens: [{ ...token, multiplicity: Number.MAX_SAFE_INTEGER + 1 }],
      },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /safe integer/u,
  );
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...internalPage,
      current: {
        ...internalPage.current,
        controlTokens: [{
          ...token,
          owner: { ...token.owner, definitionScopeId: "missing-scope" },
        }],
      },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /live scope/u,
  );
});

test("rejects unknown stimuli, closed-arm extras, and page batch overrun", () => {
  const page = executionPublicationPage();
  const first = page.batches[0]!.transitions[0]!;
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...page,
      batches: [{
        ...page.batches[0]!,
        transitions: [{
          ...first,
          transition: {
            kind: "externalStimulus",
            stimulus: { kind: "futureStimulus", commandId: "start-publication" },
          },
        }],
      }],
    }, { ...publicationIdentity, afterRevision: 0 }),
    /unknown stimulus kind/u,
  );
  assert.throws(
    () => decodeExecutionPublicationResult({ kind: "gap", page }, {
      ...publicationIdentity,
      afterRevision: 0,
    }),
    /public fields/u,
  );

  const second = {
    revision: 2,
    logicalTimeMs: 0,
    transition: {
      kind: "externalStimulus",
      stimulus: {
        kind: "completeUserTaskInstance",
        commandId: "complete-task",
        taskId: {
          processInstanceId: publicationIdentity.processInstanceId,
          elementId: "Task",
          activation: 1,
        },
        submittedValues: [],
      },
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [],
      enteredScopes: [],
      exitedScopes: [],
    },
  } as const;
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...page,
      pageThroughRevision: 2,
      headRevision: 2,
      batches: [
        page.batches[0],
        {
          commandId: "complete-task",
          fromRevision: 1,
          throughRevision: 2,
          transitions: [second],
        },
      ],
      current: { ...page.current!, revision: 2 },
    }, { ...publicationIdentity, afterRevision: 0, limit: 1 }),
    /exceeds the requested batch limit/u,
  );
});

test("requires a revision-zero contiguous export and a matching head", () => {
  const publication = executionPublicationExport();
  assert.deepEqual(
    decodeExecutionPublicationExport(publication, publicationIdentity),
    publication,
  );
  assert.throws(
    () => decodeExecutionPublicationExport({
      ...publication,
      batches: [{ ...publication.batches[0], fromRevision: 1 }],
    }, publicationIdentity),
    /revision zero|fromRevision/u,
  );
  assert.throws(
    () => decodeExecutionPublicationExport({
      ...publication,
      current: { ...publication.current, revision: 2 },
    }, publicationIdentity),
    /current|head/u,
  );
});
