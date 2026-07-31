import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type { SemanticOperation } from "@bpmn-lean/semantic-core";

import {
  compileSemanticProcessFixture,
  semanticProcessTestLimits,
} from "./semantic-process-compilation-test-support.ts";

const fixtureUrl = new URL(
  "../../../scenarios/subprocess-error-propagation/process.bpmn",
  import.meta.url,
);
const semanticProfile =
  "cibseven-2.2.0-subprocess-error-propagation-draft";

test("preserves exact Error identity and lowers one direct interrupting handler", async () => {
  const result = await compileSemanticProcessFixture(
    fixtureUrl,
    "subprocess-error-propagation-process",
    semanticProfile,
  );

  assert.deepEqual(
    result.checkedProcess.nodes.filter(({ kind }) =>
      kind === CheckedNodeKind.BoundaryErrorEvent ||
      kind === CheckedNodeKind.ErrorEndEvent
    ),
    [
      {
        kind: CheckedNodeKind.BoundaryErrorEvent,
        id: "BoundaryEvent_ScopedFailure",
        attachedToRef: "SubProcess_Work",
        error: {
          errorDefinitionId: "ErrorEventDefinition_CaughtScopedFailure",
          errorElementId: "Error_ScopedFailure",
          code: "ScopedFailure",
        },
        outputFlowId: "Flow_BoundaryToRecover",
      },
      {
        kind: CheckedNodeKind.ErrorEndEvent,
        id: "EndEvent_ScopedFailure",
        error: {
          errorDefinitionId: "ErrorEventDefinition_ThrownScopedFailure",
          errorElementId: "Error_ScopedFailure",
          code: "ScopedFailure",
        },
      },
    ],
  );
  assert.deepEqual(
    operationOfKind(
      result.semanticProcess.operations,
      SemanticOperationKind.ThrowError,
    ),
    {
      id: "operation:EndEvent_ScopedFailure",
      kind: SemanticOperationKind.ThrowError,
      origin: { kind: "bpmnElement", elementId: "EndEvent_ScopedFailure" },
      input: "place:Flow_TriggerErrorToErrorEnd",
      error: {
        errorDefinitionId: "ErrorEventDefinition_ThrownScopedFailure",
        errorElementId: "Error_ScopedFailure",
        code: "ScopedFailure",
      },
      handler: {
        attachedScopeId: "scope:SubProcess_Work",
        code: "ScopedFailure",
        output: "place:Flow_BoundaryToRecover",
        origin: {
          kind: "bpmnElement",
          boundaryEventId: "BoundaryEvent_ScopedFailure",
          errorDefinitionId: "ErrorEventDefinition_CaughtScopedFailure",
          errorElementId: "Error_ScopedFailure",
          sequenceFlowId: "Flow_BoundaryToRecover",
        },
      },
    },
  );
});

test("Error lowering is independent of every selected declaration order", async () => {
  const original = await compileSemanticProcessFixture(
    fixtureUrl,
    "subprocess-error-propagation-process",
    semanticProfile,
  );
  const xml = new TextDecoder().decode(await readFile(fixtureUrl));
  const triggerTask = `      <bpmn:userTask id="UserTask_TriggerError" name="Trigger Error">
        <bpmn:incoming>Flow_ForkToTriggerError</bpmn:incoming>
        <bpmn:outgoing>Flow_TriggerErrorToErrorEnd</bpmn:outgoing>
      </bpmn:userTask>`;
  const siblingTask = `      <bpmn:userTask id="UserTask_SiblingWork" name="Sibling Work">
        <bpmn:incoming>Flow_ForkToSiblingWork</bpmn:incoming>
        <bpmn:outgoing>Flow_SiblingWorkToNoneEnd</bpmn:outgoing>
      </bpmn:userTask>`;
  const errorEnd = `      <bpmn:endEvent id="EndEvent_ScopedFailure">
        <bpmn:incoming>Flow_TriggerErrorToErrorEnd</bpmn:incoming>
        <bpmn:errorEventDefinition
          id="ErrorEventDefinition_ThrownScopedFailure"
          errorRef="Error_ScopedFailure" />
      </bpmn:endEvent>`;
  const siblingEnd = `      <bpmn:endEvent id="EndEvent_SiblingWork">
        <bpmn:incoming>Flow_SiblingWorkToNoneEnd</bpmn:incoming>
      </bpmn:endEvent>`;
  const boundary = `    <bpmn:boundaryEvent
      id="BoundaryEvent_ScopedFailure"
      name="Scoped failure boundary"
      attachedToRef="SubProcess_Work"
      cancelActivity="true">
      <bpmn:outgoing>Flow_BoundaryToRecover</bpmn:outgoing>
      <bpmn:errorEventDefinition
        id="ErrorEventDefinition_CaughtScopedFailure"
        errorRef="Error_ScopedFailure" />
    </bpmn:boundaryEvent>`;
  const recoveryTask = `    <bpmn:userTask id="UserTask_Recover" name="Recover">
      <bpmn:incoming>Flow_BoundaryToRecover</bpmn:incoming>
      <bpmn:outgoing>Flow_RecoverToRecoveredEnd</bpmn:outgoing>
    </bpmn:userTask>`;
  const normalEnd = `    <bpmn:endEvent id="EndEvent_Normal">
      <bpmn:incoming>Flow_ScopeToNormalEnd</bpmn:incoming>
    </bpmn:endEvent>`;
  const recoveredEnd = `    <bpmn:endEvent id="EndEvent_Recovered">
      <bpmn:incoming>Flow_RecoverToRecoveredEnd</bpmn:incoming>
    </bpmn:endEvent>`;
  const errorRoot =
    '  <bpmn:error id="Error_ScopedFailure" name="Scoped failure" errorCode="ScopedFailure" />';
  const permuted = moveRootErrorLast(
    swapExact(
      swapExact(
        swapExact(
          swapExact(
            swapExact(
              swapExact(
                xml,
                "        <bpmn:outgoing>Flow_ForkToTriggerError</bpmn:outgoing>",
                "        <bpmn:outgoing>Flow_ForkToSiblingWork</bpmn:outgoing>",
              ),
              triggerTask,
              siblingTask,
            ),
            errorEnd,
            siblingEnd,
          ),
          '      <bpmn:sequenceFlow id="Flow_ForkToTriggerError" sourceRef="Gateway_ChildFork" targetRef="UserTask_TriggerError" />',
          '      <bpmn:sequenceFlow id="Flow_ForkToSiblingWork" sourceRef="Gateway_ChildFork" targetRef="UserTask_SiblingWork" />',
        ),
        boundary,
        recoveryTask,
      ),
      normalEnd,
      recoveredEnd,
    ),
    errorRoot,
  );
  const reordered = await compileText(permuted, "subprocess-error-permuted");
  assert.equal(reordered.status, BpmnCompilationStatus.Accepted);
  if (reordered.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("permuted Sub-Process Error profile was rejected");
  }
  assert.deepEqual(reordered.checkedProcess.nodes, original.checkedProcess.nodes);
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

test("rejects non-interrupting, misattached, unmatched, and malformed Error variants", async () => {
  const xml = new TextDecoder().decode(await readFile(fixtureUrl));
  const variants = [
    replaceExact(xml, 'cancelActivity="true"', 'cancelActivity="false"'),
    replaceExact(
      xml,
      'attachedToRef="SubProcess_Work"',
      'attachedToRef="UserTask_Recover"',
    ),
    replaceExact(
      xml,
      'errorRef="Error_ScopedFailure" />',
      'errorRef="Error_Unknown" />',
    ),
    replaceExact(xml, ' errorCode="ScopedFailure"', ""),
  ];

  for (const [index, variant] of variants.entries()) {
    const result = await compileText(variant, `subprocess-error-negative-${index}`);
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});

function operationOfKind<Kind extends SemanticOperationKind>(
  operations: ReadonlyArray<SemanticOperation>,
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const found = operations.find((candidate) => candidate.kind === kind);
  assert.ok(found !== undefined, `the program has no ${kind} operation`);
  return found as Extract<SemanticOperation, { kind: Kind }>;
}

function compileText(xml: string, sourceId: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml),
    sourceId,
    expectedSha256: undefined,
    semanticProfile,
    limits: semanticProcessTestLimits,
  });
}

function moveRootErrorLast(source: string, errorRoot: string): string {
  const withoutError = replaceExact(source, `${errorRoot}\n`, "");
  return replaceExact(
    withoutError,
    "</bpmn:definitions>",
    `${errorRoot}\n</bpmn:definitions>`,
  );
}

function replaceExact(source: string, before: string, after: string): string {
  assert.equal(source.includes(before), true);
  return source.replace(before, after);
}

function swapExact(source: string, left: string, right: string): string {
  assert.equal(source.includes(left), true);
  assert.equal(source.includes(right), true);
  const marker = "__BPMN_LEAN_DECLARATION_SWAP__";
  assert.equal(source.includes(marker), false);
  return source.replace(left, marker).replace(right, left).replace(marker, right);
}
