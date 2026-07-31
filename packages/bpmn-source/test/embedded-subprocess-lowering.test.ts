import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type { SemanticOperation } from "@bpmn-lean/semantic-core";

import {
  compileSemanticProcessFixture,
  semanticProcessTestLimits,
} from "./semantic-process-compilation-test-support.ts";

const fixtureUrl = new URL(
  "../../../scenarios/embedded-subprocess-completion/process.bpmn",
  import.meta.url,
);
const semanticProfile =
  "cibseven-2.2.0-embedded-subprocess-completion-draft";

function operationOfKind<Kind extends SemanticOperationKind>(
  operations: ReadonlyArray<SemanticOperation>,
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const found = operations.find((candidate) => candidate.kind === kind);
  assert.ok(found !== undefined, `the program has no ${kind} operation`);
  return found as Extract<SemanticOperation, { kind: Kind }>;
}

test("preserves one embedded definition scope and lowers normal completion", async () => {
  const result = await compileSemanticProcessFixture(
    fixtureUrl,
    "embedded-subprocess-completion-process",
    semanticProfile,
  );

  assert.deepEqual(result.checkedProcess.definitionScopes, [
    {
      id: "scope:Process_EmbeddedSubProcess",
      parentScopeId: null,
      originElementId: "Process_EmbeddedSubProcess",
    },
    {
      id: "scope:SubProcess_Work",
      parentScopeId: "scope:Process_EmbeddedSubProcess",
      originElementId: "SubProcess_Work",
    },
  ]);
  assert.deepEqual(
    result.semanticProcess.operations.map(({ kind }) => kind),
    [
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.Duplicate,
      SemanticOperationKind.Initiate,
      SemanticOperationKind.EnterScope,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.CompleteScope,
      SemanticOperationKind.CompleteScope,
    ],
  );
  assert.deepEqual(
    operationOfKind(
      result.semanticProcess.operations,
      SemanticOperationKind.EnterScope,
    ),
    {
      id: "operation:SubProcess_Work",
      kind: SemanticOperationKind.EnterScope,
      origin: { kind: "bpmnElement", elementId: "SubProcess_Work" },
      input: "place:Flow_OuterStartToScope",
      childEntry: "place:Flow_ChildStartToFork",
      childScopeId: "scope:SubProcess_Work",
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.filter(
      ({ kind }) => kind === SemanticOperationKind.CompleteScope,
    ),
    [
      {
        id: "operation:complete-scope:scope:Process_EmbeddedSubProcess",
        kind: SemanticOperationKind.CompleteScope,
        origin: {
          kind: "bpmnElement",
          elementId: "Process_EmbeddedSubProcess",
        },
        scopeId: "scope:Process_EmbeddedSubProcess",
        parentOutput: null,
      },
      {
        id: "operation:complete-scope:scope:SubProcess_Work",
        kind: SemanticOperationKind.CompleteScope,
        origin: { kind: "bpmnElement", elementId: "SubProcess_Work" },
        scopeId: "scope:SubProcess_Work",
        parentOutput: "place:Flow_ScopeToAfter",
      },
    ],
  );
});

test("embedded scope lowering is independent of child and flow declaration order", async () => {
  const original = await compileSemanticProcessFixture(
    fixtureUrl,
    "embedded-subprocess-completion-process",
    semanticProfile,
  );
  const xml = new TextDecoder().decode(await readFile(fixtureUrl));
  const taskA = `      <bpmn:userTask id="UserTask_ChildA" name="Child A">
        <bpmn:incoming>Flow_ChildForkToA</bpmn:incoming>
        <bpmn:outgoing>Flow_ChildAToEnd</bpmn:outgoing>
      </bpmn:userTask>`;
  const taskB = `      <bpmn:userTask id="UserTask_ChildB" name="Child B">
        <bpmn:incoming>Flow_ChildForkToB</bpmn:incoming>
        <bpmn:outgoing>Flow_ChildBToEnd</bpmn:outgoing>
      </bpmn:userTask>`;
  const permuted = swapExact(
    swapExact(
      swapExact(
        xml,
        "        <bpmn:outgoing>Flow_ChildForkToA</bpmn:outgoing>",
        "        <bpmn:outgoing>Flow_ChildForkToB</bpmn:outgoing>",
      ),
      taskA,
      taskB,
    ),
    '      <bpmn:sequenceFlow id="Flow_ChildForkToA" sourceRef="Gateway_ChildFork" targetRef="UserTask_ChildA"/>',
    '      <bpmn:sequenceFlow id="Flow_ChildForkToB" sourceRef="Gateway_ChildFork" targetRef="UserTask_ChildB"/>',
  );
  const reordered = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(permuted),
    sourceId: "embedded-subprocess-completion-permuted",
    expectedSha256: undefined,
    semanticProfile,
    limits: semanticProcessTestLimits,
  });

  assert.equal(reordered.status, BpmnCompilationStatus.Accepted);
  if (reordered.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("permuted embedded Sub-Process was rejected");
  }
  assert.deepEqual(
    reordered.semanticProcess.operations,
    original.semanticProcess.operations,
  );
  assert.deepEqual(
    reordered.semanticProcess.operationScopes,
    original.semanticProcess.operationScopes,
  );
  assert.deepEqual(
    reordered.semanticProcess.controlPlaceScopes,
    original.semanticProcess.controlPlaceScopes,
  );
});

test("rejects event scope and cross-scope flow variants", async () => {
  const xml = new TextDecoder().decode(await readFile(fixtureUrl));
  const variants = [
    xml.replace(
      '<bpmn:subProcess id="SubProcess_Work">',
      '<bpmn:subProcess id="SubProcess_Work" triggeredByEvent="true">',
    ),
    xml.replace(
      'sourceRef="SubProcess_Work" targetRef="UserTask_AfterScope"',
      'sourceRef="UserTask_ChildA" targetRef="UserTask_AfterScope"',
    ),
  ];

  for (const variant of variants) {
    const result = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(variant),
      sourceId: "embedded-subprocess-negative",
      expectedSha256: undefined,
      semanticProfile,
      limits: semanticProcessTestLimits,
    });
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});

function swapExact(source: string, left: string, right: string): string {
  assert.equal(source.includes(left), true);
  assert.equal(source.includes(right), true);
  const marker = "__BPMN_LEAN_DECLARATION_SWAP__";
  assert.equal(source.includes(marker), false);
  return source.replace(left, marker).replace(right, left).replace(marker, right);
}
