import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  GatewayDirection,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  compileBpmnToSemanticProcess,
} from "../dist/index.js";

const limits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

async function compileFixture(relativePath, sourceId, semanticProfile) {
  return compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(relativePath, import.meta.url)),
    sourceId,
    expectedSha256: undefined,
    semanticProfile,
    limits,
  });
}

test("emits the canonical checked graph and Semantic Process for the sequential source", async () => {
  const result = await compileFixture(
    "../../../scenarios/user-task-discovery-completion/process.bpmn",
    "sequential-user-task-process",
    "cibseven-2.2.0-user-task-draft",
  );

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.deepEqual(
    result.checkedProcess.nodes.map(({ kind, id }) => ({ kind, id })),
    [
      { kind: CheckedNodeKind.NoneEndEvent, id: "EndEvent_1" },
      { kind: CheckedNodeKind.NoneStartEvent, id: "StartEvent_1" },
      { kind: CheckedNodeKind.UserTask, id: "UserTask_Approve" },
    ],
  );
  assert.deepEqual(
    result.semanticProcess.operations.map(({ kind, id }) => ({ kind, id })),
    [
      {
        kind: SemanticOperationKind.Terminate,
        id: "operation:EndEvent_1",
      },
      {
        kind: SemanticOperationKind.Initiate,
        id: "operation:StartEvent_1",
      },
      {
        kind: SemanticOperationKind.AwaitUserTask,
        id: "operation:UserTask_Approve",
      },
    ],
  );
  assert.equal(
    result.semanticProcess.identity.compiler,
    SemanticProcessCompilerId.BpmnSourceSemanticProcess,
  );
  assert.deepEqual(
    result.semanticProcess.controlPlaces.map(({ id }) => id),
    ["place:Flow_StartToTask", "place:Flow_TaskToEnd"],
  );
});

test("lowers the balanced parallel source through duplicate and synchronize", async () => {
  const result = await compileFixture(
    "../../../scenarios/parallel-fork-join/process.bpmn",
    "parallel-two-user-tasks-process",
    "parallel-fork-join-draft",
  );

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.equal(result.checkedProcess.nodes.length, 6);
  assert.equal(result.checkedProcess.sequenceFlows.length, 6);
  const fork = result.checkedProcess.nodes.find(
    ({ id }) => id === "Gateway_Fork",
  );
  const join = result.checkedProcess.nodes.find(
    ({ id }) => id === "Gateway_Join",
  );
  assert.deepEqual(fork, {
    kind: CheckedNodeKind.ParallelGateway,
    id: "Gateway_Fork",
    direction: GatewayDirection.Diverging,
  });
  assert.deepEqual(join, {
    kind: CheckedNodeKind.ParallelGateway,
    id: "Gateway_Join",
    direction: GatewayDirection.Converging,
  });

  const duplicate = result.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.Duplicate,
  );
  const synchronize = result.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.Synchronize,
  );
  assert.deepEqual(duplicate.outputs, [
    "place:Flow_ForkToA",
    "place:Flow_ForkToB",
  ]);
  assert.deepEqual(synchronize.inputs, [
    "place:Flow_AToJoin",
    "place:Flow_BToJoin",
  ]);
  assert.equal(
    result.semanticProcess.controlPlaces.length,
    result.checkedProcess.sequenceFlows.length,
  );
});

test("retains PT1S in the checked graph and lowers one timer wait", async () => {
  const result = await compileFixture(
    "../../../scenarios/intermediate-catch-timer/process.bpmn",
    "intermediate-catch-timer-pt1s-process",
    "cibseven-2.2.0-intermediate-catch-timer-draft",
  );

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ id }) => id === "TimerCatch_PT1S",
    ),
    {
      kind: CheckedNodeKind.IntermediateCatchTimerEvent,
      id: "TimerCatch_PT1S",
      durationLiteral: "PT1S",
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitTimer,
    ),
    {
      id: "operation:TimerCatch_PT1S",
      kind: SemanticOperationKind.AwaitTimer,
      origin: {
        kind: "bpmnElement",
        elementId: "TimerCatch_PT1S",
      },
      input: "place:Flow_StartToTimer",
      output: "place:Flow_TimerToEnd",
      timer: {
        elementId: "TimerCatch_PT1S",
        durationMs: 1000,
      },
    },
  );
});

test("retains the exact Service Task binding and lowers one effect wait", async () => {
  const result = await compileFixture(
    "../../../scenarios/service-task-effect/process.bpmn",
    "service-task-effect-phase-zero-probe",
    "cibseven-2.2.0-service-task-effect-draft",
  );

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ id }) => id === "ServiceTask_Record",
    ),
    {
      kind: CheckedNodeKind.ServiceTask,
      id: "ServiceTask_Record",
      implementation: "urn:bpmn-lean:effect:probe-v1",
      inputMappings: [],
      outputMappings: [],
      sourceBinding: {
        delegateExpressionAttribute: {
          namespace: "http://camunda.org/schema/1.0/bpmn",
          value: "${bpmnLeanEffectHandler}",
        },
        asyncBeforeAttribute: {
          namespace: "http://camunda.org/schema/1.0/bpmn",
          value: "true",
        },
      },
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitEffect,
    ),
    {
      id: "operation:ServiceTask_Record",
      kind: SemanticOperationKind.AwaitEffect,
      origin: {
        kind: "bpmnElement",
        elementId: "ServiceTask_Record",
      },
      input: "place:Flow_StartToService",
      output: "place:Flow_ServiceToEnd",
      effect: {
        elementId: "ServiceTask_Record",
        descriptor: {
          protocol: "urn:bpmn-lean:effect:probe-v1",
          handler: "bpmnLeanEffectHandler",
        },
        inputMappings: [],
        outputMappings: [],
      },
    },
  );
});

test("rejects every incomplete or altered Service Task binding", async () => {
  const bytes = await readFile(
    new URL(
      "../../../scenarios/service-task-effect/process.bpmn",
      import.meta.url,
    ),
  );
  const xml = new TextDecoder().decode(bytes);
  const mutations = [
    xml.replace(
      ' implementation="urn:bpmn-lean:effect:probe-v1"',
      "",
    ),
    xml.replace(
      'implementation="urn:bpmn-lean:effect:probe-v1"',
      'implementation="urn:bpmn-lean:effect:other"',
    ),
    xml.replace(
      'camunda:delegateExpression="${bpmnLeanEffectHandler}"',
      'camunda:delegateExpression="${otherHandler}"',
    ),
    xml.replace(
      'camunda:delegateExpression="${bpmnLeanEffectHandler}"',
      'camunda:delegateExpression="${bpmnLeanEffectHandler.method()}"',
    ),
    xml.replace(
      'camunda:delegateExpression="${bpmnLeanEffectHandler}"',
      'camunda:delegateExpression="${bpmnLeanEffectHandler.property}"',
    ),
    xml.replace(' camunda:asyncBefore="true"', ""),
    xml.replace(
      'camunda:asyncBefore="true"',
      'camunda:asyncBefore="false"',
    ),
    xml.replace(
      'xmlns:camunda="http://camunda.org/schema/1.0/bpmn"',
      'xmlns:camunda="urn:hostile:camunda"',
    ),
    xml.replace(
      'camunda:asyncBefore="true"',
      'camunda:asyncBefore="true" camunda:class="OtherDelegate"',
    ),
    xml.replace(
      "      <bpmn:incoming>Flow_StartToService</bpmn:incoming>",
      [
        "      <bpmn:extensionElements>",
        '        <camunda:field name="unexpected"/>',
        "      </bpmn:extensionElements>",
        "      <bpmn:incoming>Flow_StartToService</bpmn:incoming>",
      ].join("\n"),
    ),
  ];

  for (const mutation of mutations) {
    const result = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(mutation),
      sourceId: "invalid-service-task",
      expectedSha256: undefined,
      semanticProfile: "cibseven-2.2.0-service-task-effect-draft",
      limits,
    });

    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});

test("rejects a gateway direction that contradicts its checked arity", async () => {
  const bytes = await readFile(
    new URL(
      "../../../scenarios/parallel-fork-join/process.bpmn",
      import.meta.url,
    ),
  );
  const xml = new TextDecoder().decode(bytes);
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(
      xml.replace(
        'id="Gateway_Fork" gatewayDirection="Diverging"',
        'id="Gateway_Fork" gatewayDirection="Converging"',
      ),
    ),
    sourceId: "invalid-parallel-direction",
    expectedSha256: undefined,
    semanticProfile: "parallel-fork-join-draft",
    limits,
  });

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(result.checkedProcess, undefined);
  assert.equal(result.semanticProcess, undefined);
});

test("rejects timer forms outside the exact PT1S literal profile", async () => {
  const bytes = await readFile(
    new URL(
      "../../../scenarios/intermediate-catch-timer/process.bpmn",
      import.meta.url,
    ),
  );
  const xml = new TextDecoder().decode(bytes);
  for (const mutation of [
    xml.replace("PT1S", "PT2S"),
    xml.replace("timeDuration", "timeCycle"),
    xml.replace(
      "<bpmn:timeDuration xsi:type=\"bpmn:tFormalExpression\">PT1S</bpmn:timeDuration>",
      "",
    ),
  ]) {
    const result = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(mutation),
      sourceId: "invalid-timer",
      expectedSha256: undefined,
      semanticProfile: "cibseven-2.2.0-intermediate-catch-timer-draft",
      limits,
    });

    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});
