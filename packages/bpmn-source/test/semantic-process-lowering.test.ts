import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  GatewayDirection,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  compileBpmnToSemanticProcess,
  lowerCheckedProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  CheckedNode,
  SemanticOperation,
} from "@bpmn-lean/semantic-core";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import { verifyDefinitionArtifacts } from "../../../scripts/contract-artifacts.ts";
import {
  compileSemanticProcessFixture,
  semanticProcessTestLimits as limits,
} from "./semantic-process-compilation-test-support.ts";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

function compileFixture(
  relativePath: string,
  sourceId: string,
  semanticProfile: string,
) {
  return compileSemanticProcessFixture(
    new URL(relativePath, import.meta.url),
    sourceId,
    semanticProfile,
  );
}

function operationOfKind<Kind extends SemanticOperationKind>(
  operations: ReadonlyArray<SemanticOperation>,
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const found = operations.find((candidate) => candidate.kind === kind);
  assert.ok(found !== undefined, `the program has no ${kind} operation`);
  return found as Extract<SemanticOperation, { kind: Kind }>;
}

function serviceTaskNode(
  nodes: ReadonlyArray<CheckedNode>,
  id: string,
): Extract<CheckedNode, { kind: CheckedNodeKind.ServiceTask }> {
  const found = nodes.find((candidate) => candidate.id === id);
  assert.ok(
    found?.kind === CheckedNodeKind.ServiceTask,
    `${id} is not a checked Service Task`,
  );
  return found;
}

test("emits the canonical checked graph and Semantic Process for the sequential source", async () => {
  const result = await compileFixture(
    "../../../scenarios/user-task-discovery-completion/process.bpmn",
    "sequential-user-task-process",
    "cibseven-2.2.0-user-task-process-data-draft",
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
        kind: SemanticOperationKind.ReachNoneEnd,
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
      {
        kind: SemanticOperationKind.CompleteScope,
        id: "operation:complete-scope:scope:Process_SequentialUserTask",
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

test("every registered profile lowers with observable internal choice rejected", async () => {
  const result = await compileFixture(
    "../../../scenarios/user-task-discovery-completion/process.bpmn",
    "internal-scheduling-mode-profile-census",
    SemanticProfileId.UserTask,
  );

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  for (const semanticProfile of Object.values(SemanticProfileId)) {
    const program = lowerCheckedProcess({
      ...result.checkedProcess,
      identity: {
        ...result.checkedProcess.identity,
        semanticProfile,
      },
    });
    assert.equal(
      (program as unknown as Record<string, unknown>).internalSchedulingMode,
      "rejectObservableChoice",
      semanticProfile,
    );
  }
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

  const duplicate = operationOfKind(
    result.semanticProcess.operations,
    SemanticOperationKind.Duplicate,
  );
  const synchronize = operationOfKind(
    result.semanticProcess.operations,
    SemanticOperationKind.Synchronize,
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

test("admits timer and User Task composition only through its selected profile", async () => {
  const result = await compileFixture(
    "../../../scenarios/timer-user-task-composition/process.bpmn",
    "timer-user-task-composition-process",
    "bpmn-2.0.2-timer-user-task-composition-draft",
  );

  assert.deepEqual(
    result.semanticProcess.operations.map(({ kind }) => kind),
    [
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.Initiate,
      SemanticOperationKind.AwaitTimer,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.CompleteScope,
    ],
  );

  for (const semanticProfile of [
    "cibseven-2.2.0-intermediate-catch-timer-draft",
    "cibseven-2.2.0-user-task-process-data-draft",
    "unknown-profile",
  ]) {
    const rejected = await compileBpmnToSemanticProcess({
      bytes: await readFile(
        new URL(
          "../../../scenarios/timer-user-task-composition/process.bpmn",
          import.meta.url,
        ),
      ),
      sourceId: "timer-user-task-composition-process",
      expectedSha256: undefined,
      semanticProfile,
      sourceOverlay: null,
      limits,
    });
    assert.equal(rejected.status, BpmnCompilationStatus.Rejected);
  }
});

test("derives the reverse linear order from graph facts instead of a named model", async () => {
  const reverseSource = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions_ReverseComposition" targetNamespace="https://bpmn-lean.local/test">
  <bpmn:process id="Process_TimerUserTaskComposition" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_StartToTask</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="UserTask_Approve" name="Approve">
      <bpmn:incoming>Flow_StartToTask</bpmn:incoming>
      <bpmn:outgoing>Flow_TaskToTimer</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:intermediateCatchEvent id="TimerCatch_PT1S">
      <bpmn:incoming>Flow_TaskToTimer</bpmn:incoming>
      <bpmn:outgoing>Flow_TimerToEnd</bpmn:outgoing>
      <bpmn:timerEventDefinition>
        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration>
      </bpmn:timerEventDefinition>
    </bpmn:intermediateCatchEvent>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_TimerToEnd</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_StartToTask" sourceRef="StartEvent_1" targetRef="UserTask_Approve"/>
    <bpmn:sequenceFlow id="Flow_TaskToTimer" sourceRef="UserTask_Approve" targetRef="TimerCatch_PT1S"/>
    <bpmn:sequenceFlow id="Flow_TimerToEnd" sourceRef="TimerCatch_PT1S" targetRef="EndEvent_1"/>
  </bpmn:process>
</bpmn:definitions>`;
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(reverseSource),
    sourceId: "reverse-timer-user-task-composition",
    expectedSha256: undefined,
    semanticProfile: "bpmn-2.0.2-timer-user-task-composition-draft",
    sourceOverlay: null,
    limits,
  });

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("reverse composition was not admitted");
  }
  const start = operationOfKind(
    result.semanticProcess.operations,
    SemanticOperationKind.Initiate,
  );
  const task = operationOfKind(
    result.semanticProcess.operations,
    SemanticOperationKind.AwaitUserTask,
  );
  const timer = operationOfKind(
    result.semanticProcess.operations,
    SemanticOperationKind.AwaitTimer,
  );
  assert.equal(start.output, task.input);
  assert.equal(task.output, timer.input);
});

test("rejects an existing exact source under a capability-incompatible profile", async () => {
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(
      new URL(
        "../../../scenarios/parallel-fork-join/process.bpmn",
        import.meta.url,
      ),
    ),
    sourceId: "parallel-two-user-tasks-process",
    expectedSha256: undefined,
    semanticProfile:
      "cibseven-2.2.0-intermediate-catch-timer-draft",
    sourceOverlay: null,
    limits,
  });

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

test("keeps the exact Service Task binding outside the neutral checked graph", async () => {
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
      descriptor: {
        protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: "urn:bpmn-lean:effect-operation:probe-v1",
      },
      inputMappings: [],
      outputMappings: [],
      bpmnErrorRoute: null,
    },
  );
  assert.doesNotMatch(
    JSON.stringify(result.checkedProcess),
    /camunda|bpmnLeanEffectHandler/,
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
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation: "urn:bpmn-lean:effect-operation:probe-v1",
        },
        inputMappings: [],
        outputMappings: [],
      },
      bpmnErrorRoute: null,
    },
  );
  assert.doesNotMatch(
    JSON.stringify(result.semanticProcess),
    /camunda|bpmnLeanEffectHandler/,
  );
});

test("retains and lowers the exact mapped-boundary-Error route", async () => {
  const result = await compileFixture(
    "../../../scenarios/mapped-boundary-error-service-task/process.bpmn",
    "mapped-boundary-error-service-task",
    "cibseven-2.0.0-mapped-boundary-error-service-task-draft",
  );

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  const task = serviceTaskNode(
    result.checkedProcess.nodes,
    "MappedBoundaryEffectTask",
  );
  assert.deepEqual(task.descriptor, {
    protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
    operation: "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1",
  });
  assert.deepEqual(task.bpmnErrorRoute, {
    boundaryEventId: "BoundaryEvent_MappedBusinessError",
    boundaryEventName: "Mapped Business Error Boundary",
    attachedToRef: "MappedBoundaryEffectTask",
    errorDefinitionId: "ErrorEventDefinition_MappedBusinessError",
    errorElementId: "Error_MappedBusinessError",
    errorName: "Mapped Business Error",
    code: "MappedBusinessError",
    outputFlowId: "Flow_ErrorToReviewMappedError",
  });
  assert.deepEqual(
    operationOfKind(
      result.semanticProcess.operations,
      SemanticOperationKind.AwaitEffect,
    ).bpmnErrorRoute,
    {
      code: "MappedBusinessError",
      output: "place:Flow_ErrorToReviewMappedError",
      origin: {
        kind: "bpmnElement",
        boundaryEventId: "BoundaryEvent_MappedBusinessError",
        errorDefinitionId: "ErrorEventDefinition_MappedBusinessError",
        errorElementId: "Error_MappedBusinessError",
        sequenceFlowId: "Flow_ErrorToReviewMappedError",
      },
    },
  );
  await assert.doesNotReject(
    verifyDefinitionArtifacts(projectRoot, {
      checkedProcess: result.checkedProcess,
      semanticProcess: result.semanticProcess,
    }),
  );
});

test("rejects executable drift outside the exact boundary-error profile", async () => {
  const bytes = await readFile(
    new URL(
      "../../../scenarios/mapped-boundary-error-service-task/process.bpmn",
      import.meta.url,
    ),
  );
  const xml = new TextDecoder().decode(bytes);
  const mutations = [
    xml.replace(
      "#{mappedBoundaryErrorHandler}",
      "${mappedBoundaryErrorHandler}",
    ),
    xml.replace(
      "#{mappedBoundaryErrorHandler}",
      "#{mappedBoundaryErrorHandler.execute()}",
    ),
    xml.replace(
      "#{mappedBoundaryErrorHandler}",
      "#{mappedBoundaryErrorHandler.property}",
    ),
    xml.replace(
      'camunda:delegateExpression="#{mappedBoundaryErrorHandler}"',
      'camunda:delegateExpression="#{mappedBoundaryErrorHandler}" camunda:class="example.Hostile"',
    ),
    xml.replace(
      "</bpmn:extensionElements>",
      "<camunda:properties /></bpmn:extensionElements>",
    ),
    xml.replace(
      'attachedToRef="MappedBoundaryEffectTask"',
      'attachedToRef="ReviewMappedError"',
    ),
    xml.replace(
      'attachedToRef="MappedBoundaryEffectTask"',
      'attachedToRef="MappedBoundaryEffectTask" cancelActivity="false"',
    ),
    xml.replace("MappedBusinessError", "UnexpectedError"),
    xml.replace(
      "http://camunda.org/schema/1.0/bpmn",
      "https://example.invalid/camunda",
    ),
  ];

  for (const [index, source] of mutations.entries()) {
    assert.notEqual(source, xml);
    const result = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(source),
      sourceId: `boundary-error-hostile-${index}`,
      expectedSha256: undefined,
      semanticProfile: "cibseven-2.0.0-mapped-boundary-error-service-task-draft",
      sourceOverlay: null,
      limits,
    });
    assert.equal(
      result.status,
      BpmnCompilationStatus.Rejected,
      `mutation ${index} must reject`,
    );
  }
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
      sourceOverlay: null,
      limits,
    });

    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});

test("rejects Parallel Gateway directions that contradict arity or XSD lexical form", async () => {
  const bytes = await readFile(
    new URL(
      "../../../scenarios/parallel-fork-join/process.bpmn",
      import.meta.url,
    ),
  );
  const xml = new TextDecoder().decode(bytes);
  for (const direction of ["Converging", "diverging", "DiVeRgInG"]) {
    const result = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(
        xml.replace(
          'id="Gateway_Fork" gatewayDirection="Diverging"',
          `id="Gateway_Fork" gatewayDirection="${direction}"`,
        ),
      ),
      sourceId: "invalid-parallel-direction",
      expectedSha256: undefined,
      semanticProfile: "parallel-fork-join-draft",
      sourceOverlay: null,
      limits,
    });

    assert.equal(result.status, BpmnCompilationStatus.Rejected);
    assert.equal(result.checkedProcess, undefined);
    assert.equal(result.semanticProcess, undefined);
  }
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
      sourceOverlay: null,
      limits,
    });

    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});
