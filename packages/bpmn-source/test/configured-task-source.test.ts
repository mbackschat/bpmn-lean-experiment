/** Locks the exact registered configured generic Task source profile. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  BpmnSourceDiagnosticCode,
  CheckedNodeKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  EffectOperation,
  EffectProtocol,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type {
  AcceptedBpmnCompilation,
  BpmnCompilationResult,
} from "@bpmn-lean/bpmn-source";

const sourceUrl = new URL("./fixtures/configured-task.bpmn", import.meta.url);
const configuredTaskProfile = SemanticProfileId.ConfiguredTask;
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });
const descriptor = Object.freeze({
  protocol: EffectProtocol.Activity,
  operation: EffectOperation.Probe,
});

async function compile(
  bytes: Uint8Array,
  semanticProfile: string = configuredTaskProfile,
) {
  return await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "configured-task-source-test",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits,
  });
}

function requireAccepted(result: BpmnCompilationResult): AcceptedBpmnCompilation {
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result;
}

test("compiles the exact registered configured generic Task", async () => {
  const bytes = await readFile(sourceUrl);
  const result = requireAccepted(await compile(bytes));

  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ kind }) => kind === CheckedNodeKind.ConfiguredTask,
    ),
    {
      kind: CheckedNodeKind.ConfiguredTask,
      id: "ConfiguredTask_Probe",
      descriptor,
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind, origin }) =>
        kind === SemanticOperationKind.AwaitEffect &&
        origin.elementId === "ConfiguredTask_Probe",
    ),
    {
      id: "operation:ConfiguredTask_Probe",
      kind: SemanticOperationKind.AwaitEffect,
      origin: { kind: "bpmnElement", elementId: "ConfiguredTask_Probe" },
      input: "place:Flow_StartToConfigured",
      output: "place:Flow_ConfiguredToUser",
      effect: {
        elementId: "ConfiguredTask_Probe",
        descriptor,
        inputMappings: [],
        outputMappings: [],
      },
      bpmnErrorRoute: null,
    },
  );
  assert.deepEqual(
    result.semanticProcess.operationScopes.find(
      ({ operationId }) => operationId === "operation:ConfiguredTask_Probe",
    ),
    {
      operationId: "operation:ConfiguredTask_Probe",
      scopeId: "scope:Process_ConfiguredTask",
    },
  );
  assert.deepEqual(Array.from(result.copyExactBytes()), Array.from(bytes));
});

test("admits an alternate prefix bound to the exact extension namespace", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const alternatePrefix = source
    .replaceAll("bpmnLean", "engineExtension")
    .replace(
      '<bpmn:task id="ConfiguredTask_Probe">',
      '<bpmn:task id="ConfiguredTask_Probe" name="Probe">',
    );
  assert.notEqual(alternatePrefix, source);

  const result = requireAccepted(
    await compile(new TextEncoder().encode(alternatePrefix)),
  );

  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ kind }) => kind === CheckedNodeKind.ConfiguredTask,
    ),
    {
      kind: CheckedNodeKind.ConfiguredTask,
      id: "ConfiguredTask_Probe",
      descriptor,
    },
  );
});

test("derives configured identity and endpoints from arbitrary source IDs", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const changed = source
    .replaceAll("ConfiguredTask_Probe", "Task_q7")
    .replaceAll("Flow_StartToConfigured", "Flow_j3")
    .replaceAll("Flow_ConfiguredToUser", "Flow_k4");
  assert.notEqual(changed, source);

  const result = requireAccepted(await compile(new TextEncoder().encode(changed)));
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ origin }) => origin.elementId === "Task_q7",
    ),
    {
      id: "operation:Task_q7",
      kind: SemanticOperationKind.AwaitEffect,
      origin: { kind: "bpmnElement", elementId: "Task_q7" },
      input: "place:Flow_j3",
      output: "place:Flow_k4",
      effect: {
        elementId: "Task_q7",
        descriptor,
        inputMappings: [],
        outputMappings: [],
      },
      bpmnErrorRoute: null,
    },
  );
});

test("retains the exact Task type refusal under a non-selected profile", async () => {
  const result = await compile(
    await readFile(sourceUrl),
    SemanticProfileId.UserTask,
  );

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(result.diagnostics[0]?.code, BpmnSourceDiagnosticCode.UnsupportedElementType);
  assert.deepEqual(result.diagnostics[0]?.element, {
    id: "ConfiguredTask_Probe",
    type: "bpmn:Task",
    containmentPath: "definitions/rootElements[0]/flowElements[1]",
    subject: null,
    requiredCapability: "executeElementType",
  });
});

test("rejects excluded configured Task source shapes", async (context) => {
  const source = await readFile(sourceUrl, "utf8");

  for (const [name, mutation] of Object.entries(configuredTaskMutations(source))) {
    await context.test(name, async () => {
      assert.notEqual(mutation, source, `${name} mutation matched nothing`);
      const result = await compile(new TextEncoder().encode(mutation));
      assert.equal(result.status, BpmnCompilationStatus.Rejected);
    });
  }
});

function configuredTaskMutations(source: string): Readonly<Record<string, string>> {
  const definition =
    '        <bpmnLean:taskDefinition type="urn:bpmn-lean:task-handler:probe-v1" />';
  const container = [
    "      <bpmn:extensionElements>",
    definition,
    "      </bpmn:extensionElements>\n",
  ].join("\n");
  return {
    "plain Abstract Task": source.replace(container, ""),
    "empty extension container": source.replace(`${definition}\n`, ""),
    "wrong extension namespace": source.replace(
      "urn:bpmn-lean:bpmn:extensions:v1",
      "urn:bpmn-lean:bpmn:extensions:v2",
    ),
    "wrong extension local name": source.replaceAll(
      "taskDefinition",
      "otherDefinition",
    ),
    "wrong handler type": source.replace(
      "urn:bpmn-lean:task-handler:probe-v1",
      "urn:bpmn-lean:task-handler:other-v1",
    ),
    "empty handler type": source.replace(
      "urn:bpmn-lean:task-handler:probe-v1",
      "",
    ),
    "missing handler type": source.replace(
      ' type="urn:bpmn-lean:task-handler:probe-v1"',
      "",
    ),
    "duplicate task definition": source.replace(
      definition,
      `${definition}\n${definition}`,
    ),
    "extra definition attribute": source.replace(
      " />",
      ' extra="value" />',
    ),
    "extra definition body": source.replace(
      definition,
      '        <bpmnLean:taskDefinition type="urn:bpmn-lean:task-handler:probe-v1">payload</bpmnLean:taskDefinition>',
    ),
    "extra extension child": source.replace(
      definition,
      `${definition}\n        <bpmnLean:taskDefinition type="urn:bpmn-lean:task-handler:other-v1" />`,
    ),
    "unsupported inherited Task property": source.replace(
      '<bpmn:task id="ConfiguredTask_Probe">',
      '<bpmn:task id="ConfiguredTask_Probe" isForCompensation="true">',
    ),
    "reversed Task order": source
      .replace(
        'sourceRef="StartEvent_1" targetRef="ConfiguredTask_Probe"',
        'sourceRef="StartEvent_1" targetRef="UserTask_Review"',
      )
      .replace(
        'sourceRef="ConfiguredTask_Probe" targetRef="UserTask_Review"',
        'sourceRef="UserTask_Review" targetRef="ConfiguredTask_Probe"',
      )
      .replace(
        'sourceRef="UserTask_Review" targetRef="EndEvent_1"',
        'sourceRef="ConfiguredTask_Probe" targetRef="EndEvent_1"',
      ),
    "configured Task outgoing arity": source.replace(
      '    <bpmn:sequenceFlow id="Flow_UserToEnd"',
      '    <bpmn:sequenceFlow id="Flow_ConfiguredExtra" sourceRef="ConfiguredTask_Probe" targetRef="EndEvent_1" />\n    <bpmn:sequenceFlow id="Flow_UserToEnd"',
    ),
    "conditional Sequence Flow": source.replace(
      '    <bpmn:sequenceFlow id="Flow_UserToEnd" sourceRef="UserTask_Review" targetRef="EndEvent_1" />',
      '    <bpmn:sequenceFlow id="Flow_UserToEnd" sourceRef="UserTask_Review" targetRef="EndEvent_1"><bpmn:conditionExpression>true</bpmn:conditionExpression></bpmn:sequenceFlow>',
    ),
    "extra root definition": source.replace(
      "  <bpmn:process",
      '  <bpmn:error id="Error_Extra" />\n  <bpmn:process',
    ),
    "extra Process": source.replace(
      "  <bpmn:process",
      '  <bpmn:process id="Process_Extra" isExecutable="false" />\n  <bpmn:process',
    ),
  };
}
