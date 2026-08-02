import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
  callActivityDefinitionBindingValid,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  callCompletionEdges,
  isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

const profile = "bpmn-2.0.2-called-process-call-activity-draft";
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });
const source = await readFile(
  new URL("./fixtures/call-activity-called-process.bpmn", import.meta.url),
  "utf8",
);
const permutedSource = await readFile(
  new URL("./fixtures/call-activity-called-process-permuted.bpmn", import.meta.url),
  "utf8",
);

function compile(bytes: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(bytes),
    sourceId: "call-activity-test",
    expectedSha256: undefined,
    semanticProfile: profile,
    limits,
  });
}

function operationOfKind<Kind extends SemanticOperationKind>(
  operations: ReadonlyArray<SemanticOperation>,
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const operation = operations.find(
    (candidate): candidate is Extract<SemanticOperation, { kind: Kind }> =>
      candidate.kind === kind,
  );
  assert.ok(operation !== undefined, `expected one ${kind} operation`);
  return operation;
}

test("admits the exact in-document called Process association", async () => {
  const result = await compile(source);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  assert.equal(
    callActivityDefinitionBindingValid(result.checkedProcess, result.semanticProcess),
    true,
  );
  assert.deepEqual(result.checkedProcess.definitionScopes, [
    { id: "scope:CalledProcess", parentScopeId: null, originElementId: "CalledProcess" },
    { id: "scope:CallerProcess", parentScopeId: null, originElementId: "CallerProcess" },
  ]);
  assert.deepEqual(
    result.checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.CallActivity),
    [{ kind: CheckedNodeKind.CallActivity, id: "Call_CalledProcess", calledProcessId: "CalledProcess" }],
  );
  assert.deepEqual(
    result.semanticProcess.operations.filter(({ kind }) =>
      kind === SemanticOperationKind.Initiate ||
      kind === SemanticOperationKind.InvokeProcess ||
      kind === SemanticOperationKind.ReturnProcess
    ),
    [
      {
        id: "operation:Call_CalledProcess",
        kind: SemanticOperationKind.InvokeProcess,
        origin: { kind: "bpmnElement", elementId: "Call_CalledProcess" },
        input: "place:Flow_Caller_Start_Call",
        calledProcessId: "CalledProcess",
        calledRootScopeId: "scope:CalledProcess",
        calledEntry: "place:Flow_Called_Start_Task",
        returnOperationId: "operation:return-process:Call_CalledProcess",
      },
      {
        id: "operation:CallerStart",
        kind: SemanticOperationKind.Initiate,
        origin: { kind: "bpmnElement", elementId: "CallerStart" },
        output: "place:Flow_Caller_Start_Call",
      },
      {
        id: "operation:return-process:Call_CalledProcess",
        kind: SemanticOperationKind.ReturnProcess,
        origin: { kind: "bpmnElement", elementId: "Call_CalledProcess" },
        calledProcessId: "CalledProcess",
        calledRootScopeId: "scope:CalledProcess",
        callerOutput: "place:Flow_Caller_Call_Task",
      },
    ],
  );
  assert.equal(
    result.semanticProcess.operations.some(({ id }) => id === "operation:CalledStart"),
    false,
  );
  assert.equal(
    result.semanticProcess.operations.some(({ id }) =>
      id === "operation:complete-scope:scope:CalledProcess"
    ),
    false,
  );
  const operationScope = new Map(
    result.semanticProcess.operationScopes.map(({ operationId, scopeId }) =>
      [operationId, scopeId] as const
    ),
  );
  assert.deepEqual(callCompletionEdges(result.semanticProcess.operations, operationScope), [
    { source: "operation:CalledEnd", target: "operation:return-process:Call_CalledProcess" },
  ]);
});

test("canonicalizes both Process roots, flow elements, and reference declaration order", async () => {
  const original = await compile(source);
  const permuted = await compile(permutedSource);
  assert.equal(original.status, BpmnCompilationStatus.Accepted);
  assert.equal(permuted.status, BpmnCompilationStatus.Accepted);
  if (original.status !== BpmnCompilationStatus.Accepted || permuted.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  assert.notEqual(original.source.sha256, permuted.source.sha256);
  assert.deepEqual(
    { ...original.checkedProcess, identity: { ...original.checkedProcess.identity, sourceSha256: "digest" } },
    { ...permuted.checkedProcess, identity: { ...permuted.checkedProcess.identity, sourceSha256: "digest" } },
  );
  assert.deepEqual(
    { ...original.semanticProcess, identity: { ...original.semanticProcess.identity, sourceSha256: "digest" } },
    { ...permuted.semanticProcess, identity: { ...permuted.semanticProcess.identity, sourceSha256: "digest" } },
  );
});

test("derives the called binding from the QName instead of a fixture constant", async () => {
  const original = await compile(source);
  const changed = await compile(
    source
      .replace('calledElement="tns:CalledProcess"', 'calledElement="tns:AlternateProcess"')
      .replace('id="CalledProcess" isExecutable="true"', 'id="AlternateProcess" isExecutable="true"'),
  );
  assert.equal(original.status, BpmnCompilationStatus.Accepted);
  assert.equal(changed.status, BpmnCompilationStatus.Accepted);
  if (original.status !== BpmnCompilationStatus.Accepted || changed.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  const originalCall = original.checkedProcess.nodes.find(({ kind }) =>
    kind === CheckedNodeKind.CallActivity
  );
  const changedCall = changed.checkedProcess.nodes.find(({ kind }) =>
    kind === CheckedNodeKind.CallActivity
  );
  assert.equal(originalCall?.kind, CheckedNodeKind.CallActivity);
  assert.equal(changedCall?.kind, CheckedNodeKind.CallActivity);
  assert.notEqual(originalCall?.calledProcessId, changedCall?.calledProcessId);
  assert.notEqual(
    operationOfKind(
      original.semanticProcess.operations,
      SemanticOperationKind.InvokeProcess,
    ).calledProcessId,
    operationOfKind(
      changed.semanticProcess.operations,
      SemanticOperationKind.InvokeProcess,
    ).calledProcessId,
  );
});

test("rejects foreign-namespace and malformed lexical QNames before local-name resolution", async () => {
  const mutations = [
    source
      .replace('xmlns:tns="urn:bpmn-lean:test:call-activity"', 'xmlns:tns="urn:bpmn-lean:test:call-activity" xmlns:evil="urn:foreign"')
      .replace('calledElement="tns:CalledProcess"', 'calledElement="evil:CalledProcess"'),
    source.replace('calledElement="tns:CalledProcess"', 'calledElement="tns:Bad Name"'),
    source.replace('calledElement="tns:CalledProcess"', 'calledElement="tns:Bad:Name"'),
    source.replace('calledElement="tns:CalledProcess"', 'calledElement="1bad:CalledProcess"'),
    source.replace(' calledElement="tns:CalledProcess"', ""),
    source.replace('calledElement="tns:CalledProcess"', 'calledElement="CalledProcess"'),
    source.replace('calledElement="tns:CalledProcess"', 'calledElement="unknown:CalledProcess"'),
    source.replace('calledElement="tns:CalledProcess"', 'calledElement="tns:CallerProcess"'),
  ];
  for (const mutation of mutations) {
    assert.equal((await compile(mutation)).status, BpmnCompilationStatus.Rejected);
  }
});

test("keeps standalone forest admission separate from checked-definition binding", async () => {
  const result = await compile(source);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  const permuted: SemanticProcessProgram = {
    ...result.semanticProcess,
    processId: "CalledProcess",
    definitionScopes: result.semanticProcess.definitionScopes.map((scope) => ({
      ...scope,
      originElementId: scope.originElementId === "CallerProcess"
        ? "CalledProcess"
        : "CallerProcess",
    })),
    operations: result.semanticProcess.operations.map((operation) => {
      switch (operation.kind) {
        case SemanticOperationKind.InvokeProcess:
        case SemanticOperationKind.ReturnProcess:
          return { ...operation, calledProcessId: "CallerProcess" };
        default:
          return operation;
      }
    }),
  };
  assert.equal(isWellFormedSemanticProcessProgram(permuted), true);
  assert.equal(callActivityDefinitionBindingValid(result.checkedProcess, permuted), false);
});

test("rejects broken invocation ownership and return pairing structurally", async () => {
  const result = await compile(source);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  const wrongEntry: SemanticProcessProgram = {
    ...result.semanticProcess,
    operations: result.semanticProcess.operations.map((operation) =>
      operation.kind === SemanticOperationKind.InvokeProcess
        ? { ...operation, calledEntry: operation.input }
        : operation
    ),
  };
  const wrongReturn: SemanticProcessProgram = {
    ...result.semanticProcess,
    operations: result.semanticProcess.operations.map((operation) =>
      operation.kind === SemanticOperationKind.InvokeProcess
        ? { ...operation, returnOperationId: "operation:missing-return" }
        : operation
    ),
  };
  assert.equal(isWellFormedSemanticProcessProgram(wrongEntry), false);
  assert.equal(isWellFormedSemanticProcessProgram(wrongReturn), false);
});

test("rejects cross-Process control flow instead of bypassing generic graph admission", async () => {
  const crossProcess = source.replace(
    'id="Flow_Called_Task_End" sourceRef="CalledTask" targetRef="CalledEnd"',
    'id="Flow_Called_Task_End" sourceRef="CalledTask" targetRef="CallerEnd"',
  );
  assert.equal((await compile(crossProcess)).status, BpmnCompilationStatus.Rejected);
});
