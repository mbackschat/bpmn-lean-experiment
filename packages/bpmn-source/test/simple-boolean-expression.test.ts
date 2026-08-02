import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
  SimpleBooleanExpressionKind,
  compileBpmnToSemanticProcess,
  parseSimpleBooleanExpression,
} from "@bpmn-lean/bpmn-source";

const profile = "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft";
const language = "urn:bpmn-lean:expression:simple-boolean:v1";
const limits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

const validSource = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="Definitions_Choice"
  targetNamespace="urn:bpmn-lean:test"
  expressionLanguage="${language}">
  <bpmn:process id="Process_Choice" isExecutable="true">
    <bpmn:startEvent id="Start">
      <bpmn:outgoing>Flow_Start</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Choice" gatewayDirection="Diverging" default="Flow_Default">
      <bpmn:incoming>Flow_Start</bpmn:incoming>
      <bpmn:outgoing>Flow_Default</bpmn:outgoing>
      <bpmn:outgoing>Flow_Second</bpmn:outgoing>
      <bpmn:outgoing>Flow_First</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:userTask id="Task_First">
      <bpmn:incoming>Flow_First</bpmn:incoming>
      <bpmn:outgoing>Flow_First_End</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Task_Second">
      <bpmn:incoming>Flow_Second</bpmn:incoming>
      <bpmn:outgoing>Flow_Second_End</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Task_Default">
      <bpmn:incoming>Flow_Default</bpmn:incoming>
      <bpmn:outgoing>Flow_Default_End</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="End_First">
      <bpmn:incoming>Flow_First_End</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_Second">
      <bpmn:incoming>Flow_Second_End</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_Default">
      <bpmn:incoming>Flow_Default_End</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_Start" sourceRef="Start" targetRef="Choice" />
    <bpmn:sequenceFlow id="Flow_First" sourceRef="Choice" targetRef="Task_First">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">true</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Second" sourceRef="Choice" targetRef="Task_Second">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">isPresent(route)</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Default" sourceRef="Choice" targetRef="Task_Default" />
    <bpmn:sequenceFlow id="Flow_First_End" sourceRef="Task_First" targetRef="End_First" />
    <bpmn:sequenceFlow id="Flow_Second_End" sourceRef="Task_Second" targetRef="End_Second" />
    <bpmn:sequenceFlow id="Flow_Default_End" sourceRef="Task_Default" targetRef="End_Default" />
  </bpmn:process>
</bpmn:definitions>`;

async function compile(source: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(source),
    sourceId: "simple-boolean-choice",
    expectedSha256: undefined,
    semanticProfile: profile,
    limits,
  });
}

test("parses the complete Simple Boolean v1 source language", () => {
  assert.deepEqual(parseSimpleBooleanExpression("true"), {
    kind: SimpleBooleanExpressionKind.Literal,
    value: true,
  });
  assert.deepEqual(parseSimpleBooleanExpression("false"), {
    kind: SimpleBooleanExpressionKind.Literal,
    value: false,
  });
  assert.deepEqual(parseSimpleBooleanExpression("isPresent(route)"), {
    kind: SimpleBooleanExpressionKind.IsPresent,
    variable: "route",
  });
  assert.deepEqual(parseSimpleBooleanExpression("isNull(route.value-1)"), {
    kind: SimpleBooleanExpressionKind.IsNull,
    variable: "route.value-1",
  });
  assert.deepEqual(
    parseSimpleBooleanExpression('stringEquals(route,"say \\"yes\\"")'),
    {
      kind: SimpleBooleanExpressionKind.StringEquals,
      variable: "route",
      value: 'say "yes"',
    },
  );
});

test("rejects syntax aliases, invalid Unicode, and values outside the v1 bounds", () => {
  const invalid = [
    " true",
    "true ",
    "TRUE",
    "isPresent(1route)",
    "isPresent(route/value)",
    'stringEquals(route,"\\u0061")',
    `isPresent(${"a".repeat(65)})`,
    `stringEquals(route,"${"a".repeat(129)}")`,
    `stringEquals(route,"${"\ud800"}")`,
  ];

  for (const source of invalid) {
    assert.equal(parseSimpleBooleanExpression(source), undefined, source);
  }
});

test("retains declaration order and lowers the exact conditional choice", async () => {
  const result = await compile(validSource);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ kind }) => kind === CheckedNodeKind.ExclusiveGateway,
    ),
    {
      kind: CheckedNodeKind.ExclusiveGateway,
      id: "Choice",
      direction: "diverging",
      candidateFlowIds: ["Flow_First", "Flow_Second"],
      defaultFlowId: "Flow_Default",
    },
  );
  assert.deepEqual(
    result.checkedProcess.sequenceFlows.find(
      ({ id }) => id === "Flow_First",
    )?.condition,
    { language, body: "true" },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.Choose,
    ),
    {
      id: "operation:Choice",
      kind: SemanticOperationKind.Choose,
      origin: {
        kind: "bpmnElement",
        elementId: "Choice",
      },
      input: "place:Flow_Start",
      candidates: [
        {
          condition: {
            kind: SimpleBooleanExpressionKind.Literal,
            value: true,
          },
          output: "place:Flow_First",
          origin: {
            kind: "bpmnSequenceFlow",
            elementId: "Flow_First",
          },
        },
        {
          condition: {
            kind: SimpleBooleanExpressionKind.IsPresent,
            variable: "route",
          },
          output: "place:Flow_Second",
          origin: {
            kind: "bpmnSequenceFlow",
            elementId: "Flow_Second",
          },
        },
      ],
      defaultOutput: "place:Flow_Default",
      defaultOrigin: {
        kind: "bpmnSequenceFlow",
        elementId: "Flow_Default",
      },
    },
  );
});

test("compiles the content-bound standards-profile scenario", async () => {
  const source = await readFile(
    new URL(
      "../../../scenarios/exclusive-gateway-simple-boolean/process.bpmn",
      import.meta.url,
    ),
  );
  const result = await compileBpmnToSemanticProcess({
    bytes: source,
    sourceId: "simple-boolean-exclusive-gateway-process",
    expectedSha256:
      "a57b7fe4919ff3cf0806f22e16fc05f4c37ecd326ffc97d8d66cbf693b53c21b",
    semanticProfile: profile,
    limits,
  });

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status === BpmnCompilationStatus.Accepted) {
    assert.equal(
      result.semanticProcess.processId,
      "Process_SimpleBooleanChoice",
    );
  }
});

test("rejects implicit XPath, per-expression override, and invalid default conditions", async () => {
  const mutations = [
    validSource.replace(` expressionLanguage="${language}"`, ""),
    validSource.replace(language, "http://www.w3.org/1999/XPath"),
    validSource.replace(
      'xsi:type="bpmn:tFormalExpression">true',
      `xsi:type="bpmn:tFormalExpression" language="${language}">true`,
    ),
    validSource.replace(
      '<bpmn:sequenceFlow id="Flow_Default" sourceRef="Choice" targetRef="Task_Default" />',
      '<bpmn:sequenceFlow id="Flow_Default" sourceRef="Choice" targetRef="Task_Default"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">false</bpmn:conditionExpression></bpmn:sequenceFlow>',
    ),
  ];

  for (const source of mutations) {
    const result = await compile(source);
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});

test("rejects non-XSD Exclusive Gateway direction literals", async () => {
  for (const direction of ["diverging", "DiVeRgInG"]) {
    const result = await compile(
      validSource.replace('gatewayDirection="Diverging"', `gatewayDirection="${direction}"`),
    );
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});
