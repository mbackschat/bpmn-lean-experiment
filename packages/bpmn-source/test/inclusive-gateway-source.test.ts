import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  GatewayDirection,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";

const profile = "bpmn-2.0.2-inclusive-gateway-selected-branches-draft";
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });
const source = await readFile(
  new URL(
    "../../../scenarios/inclusive-gateway-selected-branches/process.bpmn",
    import.meta.url,
  ),
  "utf8",
);
const permutedSource = await readFile(
  new URL("./fixtures/inclusive-gateway-selected-branches-permuted.bpmn", import.meta.url),
  "utf8",
);

function compile(bytes: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(bytes),
    sourceId: "inclusive-gateway-test",
    expectedSha256: undefined,
    semanticProfile: profile,
    limits,
  });
}

test("admits the structured Inclusive Gateway region and derives branch-local join inputs", async () => {
  const result = await compile(source);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }

  assert.deepEqual(
    result.checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.InclusiveGateway),
    [
      {
        kind: CheckedNodeKind.InclusiveGateway,
        id: "Join",
        direction: GatewayDirection.Converging,
        pairedGatewayId: "Split",
      },
      {
        kind: CheckedNodeKind.InclusiveGateway,
        id: "Split",
        direction: GatewayDirection.Diverging,
        candidateFlowIds: ["Flow_A", "Flow_B"],
        defaultFlowId: "Flow_Default",
      },
    ],
  );
  assert.deepEqual(
    result.semanticProcess.operations.filter(({ kind }) =>
      kind === SemanticOperationKind.SelectMany ||
      kind === SemanticOperationKind.SynchronizeSelected
    ),
    [
      {
        id: "operation:Join",
        kind: SemanticOperationKind.SynchronizeSelected,
        origin: { kind: "bpmnElement", elementId: "Join" },
        inputs: ["place:Flow_A_Join", "place:Flow_B_Join", "place:Flow_Default_Join"],
        output: "place:Flow_End",
        selectionKey: "Split",
      },
      {
        id: "operation:Split",
        kind: SemanticOperationKind.SelectMany,
        origin: { kind: "bpmnElement", elementId: "Split" },
        input: "place:Flow_Start",
        candidates: [
          {
            condition: { kind: "isPresent", variable: "takeA" },
            output: "place:Flow_A",
            expectedJoinInput: "place:Flow_A_Join",
            origin: { kind: "bpmnSequenceFlow", elementId: "Flow_A" },
          },
          {
            condition: { kind: "isPresent", variable: "takeB" },
            output: "place:Flow_B",
            expectedJoinInput: "place:Flow_B_Join",
            origin: { kind: "bpmnSequenceFlow", elementId: "Flow_B" },
          },
        ],
        defaultBranch: {
          output: "place:Flow_Default",
          expectedJoinInput: "place:Flow_Default_Join",
          origin: { kind: "bpmnSequenceFlow", elementId: "Flow_Default" },
        },
        selectionKey: "Split",
      },
    ],
  );
});

test("derives direction from arity and admits only exact XSD direction literals", async () => {
  const accepted = [
    source,
    source
      .replace('<bpmn:inclusiveGateway id="Split"', '<bpmn:inclusiveGateway id="Split" gatewayDirection="Unspecified"')
      .replace('<bpmn:inclusiveGateway id="Join"', '<bpmn:inclusiveGateway id="Join" gatewayDirection="Unspecified"'),
    source
      .replace('<bpmn:inclusiveGateway id="Split"', '<bpmn:inclusiveGateway id="Split" gatewayDirection="Diverging"')
      .replace('<bpmn:inclusiveGateway id="Join"', '<bpmn:inclusiveGateway id="Join" gatewayDirection="Converging"'),
  ];
  for (const candidate of accepted) {
    assert.equal((await compile(candidate)).status, BpmnCompilationStatus.Accepted);
  }

  const rejected = [
    source.replace('<bpmn:inclusiveGateway id="Split"', '<bpmn:inclusiveGateway id="Split" gatewayDirection="Converging"'),
    source.replace('<bpmn:inclusiveGateway id="Join"', '<bpmn:inclusiveGateway id="Join" gatewayDirection="Diverging"'),
    source.replace('<bpmn:inclusiveGateway id="Split"', '<bpmn:inclusiveGateway id="Split" gatewayDirection="Mixed"'),
    source.replace('<bpmn:inclusiveGateway id="Join"', '<bpmn:inclusiveGateway id="Join" gatewayDirection="Mixed"'),
    source.replace('<bpmn:inclusiveGateway id="Split"', '<bpmn:inclusiveGateway id="Split" gatewayDirection="diverging"'),
    source.replace('<bpmn:inclusiveGateway id="Join"', '<bpmn:inclusiveGateway id="Join" gatewayDirection="cOnVeRgInG"'),
  ];
  for (const candidate of rejected) {
    assert.equal((await compile(candidate)).status, BpmnCompilationStatus.Rejected);
  }
});

test("rejects topology outside the paired direct-task region", async () => {
  const crossBranch = source.replace('sourceRef="Task_A" targetRef="Join"', 'sourceRef="Task_A" targetRef="Task_B"');
  assert.equal((await compile(crossBranch)).status, BpmnCompilationStatus.Rejected);
});

test("rejects missing or conditional defaults and expression-language drift", async () => {
  const mutations = [
    source.replace(' default="Flow_Default"', ""),
    source.replace(
      '<bpmn:sequenceFlow id="Flow_Default" sourceRef="Split" targetRef="Task_Default" />',
      '<bpmn:sequenceFlow id="Flow_Default" sourceRef="Split" targetRef="Task_Default"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">false</bpmn:conditionExpression></bpmn:sequenceFlow>',
    ),
    source.replace(' expressionLanguage="urn:bpmn-lean:expression:simple-boolean:v1"', ""),
    source.replace(
      'xsi:type="bpmn:tFormalExpression">isPresent(takeA)',
      'xsi:type="bpmn:tFormalExpression" language="urn:bpmn-lean:expression:simple-boolean:v1">isPresent(takeA)',
    ),
  ];
  for (const mutation of mutations) {
    assert.equal((await compile(mutation)).status, BpmnCompilationStatus.Rejected);
  }
});

test("canonicalizes declaration and Gateway reference order", async () => {
  const original = await compile(source);
  const permuted = await compile(permutedSource);
  assert.equal(original.status, BpmnCompilationStatus.Accepted);
  assert.equal(permuted.status, BpmnCompilationStatus.Accepted);
  if (
    original.status !== BpmnCompilationStatus.Accepted ||
    permuted.status !== BpmnCompilationStatus.Accepted
  ) {
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
