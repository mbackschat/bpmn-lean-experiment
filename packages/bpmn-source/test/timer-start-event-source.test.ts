/** Locks the exact top-level, payload-free Timer Start Event source slice. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnCompilationResult,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";

const timerStartProfile = SemanticProfileId.TimerStart;
const sourceUrl = new URL("./fixtures/timer-start-event.bpmn", import.meta.url);
const registeredSourceUrl = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);
const expectedSourceSha256 =
  "16ede7a6d5090be3a481ce7a4af97745bba96375272a59da66384091dd2c02b0";
const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

async function compile(bytes: Uint8Array): Promise<BpmnCompilationResult> {
  return await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "timer-start-event",
    expectedSha256: undefined,
    semanticProfile: timerStartProfile,
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

test("compiles and lowers the exact Timer Start Event source slice", async () => {
  const bytes = await readFile(sourceUrl);
  const result = requireAccepted(await compile(bytes));

  assert.deepEqual(
    result.checkedProcess.nodes.find(({ id }) => id === "TimerStart_PT1S"),
    {
      kind: CheckedNodeKind.TimerStartEvent,
      id: "TimerStart_PT1S",
      durationLiteral: "PT1S",
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.InitiateTimer,
    ),
    {
      id: "operation:TimerStart_PT1S",
      kind: SemanticOperationKind.InitiateTimer,
      origin: { kind: "bpmnElement", elementId: "TimerStart_PT1S" },
      timer: { durationMs: 1_000 },
      outputs: ["place:Flow_TimerStartToTask"],
    },
  );
  assert.deepEqual(Array.from(result.copyExactBytes()), Array.from(bytes));
});

test("keeps the registered Timer Start source byte-identical to the approved fixture", async () => {
  const [fixtureBytes, registeredBytes] = await Promise.all([
    readFile(sourceUrl),
    readFile(registeredSourceUrl),
  ]);

  assert.deepEqual(registeredBytes, fixtureBytes);
  assert.equal(
    createHash("sha256").update(registeredBytes).digest("hex"),
    expectedSourceSha256,
  );
});

test("derives origin and output only from arbitrary admitted source identities", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const changed = xml
    .replaceAll("Process_TimerStart", "Process_9f")
    .replaceAll("TimerStart_PT1S", "Start_7x")
    .replaceAll("Flow_TimerStartToTask", "Flow_z4")
    .replaceAll("UserTask_AfterTimer", "Task_k2")
    .replaceAll("Flow_TaskToEnd", "Flow_n8")
    .replaceAll("EndEvent_AfterTimer", "End_q3");
  assert.notEqual(changed, xml);

  const result = requireAccepted(await compile(new TextEncoder().encode(changed)));

  assert.equal(result.checkedProcess.processId, "Process_9f");
  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ kind }) => kind === CheckedNodeKind.TimerStartEvent,
    ),
    {
      kind: CheckedNodeKind.TimerStartEvent,
      id: "Start_7x",
      durationLiteral: "PT1S",
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.InitiateTimer,
    ),
    {
      id: "operation:Start_7x",
      kind: SemanticOperationKind.InitiateTimer,
      origin: { kind: "bpmnElement", elementId: "Start_7x" },
      timer: { durationMs: 1_000 },
      outputs: ["place:Flow_z4"],
    },
  );
});

test("rejects a generic Expression where Timer Start requires FormalExpression", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const genericExpression = xml.replace(
    ' xsi:type="bpmn:tFormalExpression"',
    "",
  );
  assert.notEqual(genericExpression, xml);

  const result = await compile(new TextEncoder().encode(genericExpression));

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

test("rejects every excluded Timer Start source shape", async (context) => {
  const xml = await readFile(sourceUrl, "utf8");

  for (const [name, mutation] of Object.entries(timerStartSourceMutations(xml))) {
    await context.test(name, async () => {
      assert.notEqual(mutation, xml, `${name} mutation matched nothing`);
      const result = await compile(new TextEncoder().encode(mutation));
      assert.equal(result.status, BpmnCompilationStatus.Rejected);
    });
  }
});

function timerStartSourceMutations(xml: string): Readonly<Record<string, string>> {
  const startOpening = '<bpmn:startEvent id="TimerStart_PT1S">';
  const timerDefinition = [
    "      <bpmn:timerEventDefinition>",
    '        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration>',
    "      </bpmn:timerEventDefinition>",
  ].join("\n");
  const startFlow = '<bpmn:sequenceFlow id="Flow_TimerStartToTask" sourceRef="TimerStart_PT1S" targetRef="UserTask_AfterTimer"/>';
  const userTask = [
    '    <bpmn:userTask id="UserTask_AfterTimer" name="Review">',
    "      <bpmn:incoming>Flow_TimerStartToTask</bpmn:incoming>",
    "      <bpmn:outgoing>Flow_TaskToEnd</bpmn:outgoing>",
    "    </bpmn:userTask>",
  ].join("\n");
  return {
    "missing Event Definition": xml.replace(`${timerDefinition}\n`, ""),
    "repeated Event Definition": xml.replace(
      timerDefinition,
      `${timerDefinition}\n${timerDefinition}`,
    ),
    "unresolved Event Definition reference": xml.replace(
      timerDefinition,
      "      <bpmn:eventDefinitionRef>TimerDefinition_Missing</bpmn:eventDefinitionRef>",
    ),
    "referenced Event Definition": xml
      .replace(
        timerDefinition,
        "      <bpmn:eventDefinitionRef>TimerDefinition_Shared</bpmn:eventDefinitionRef>",
      )
      .replace(
        "  <bpmn:process",
        `  <bpmn:timerEventDefinition id="TimerDefinition_Shared"><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration></bpmn:timerEventDefinition>\n  <bpmn:process`,
      ),
    "wrong Event Definition kind": xml.replaceAll(
      "timerEventDefinition",
      "signalEventDefinition",
    ).replace(
      '        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration>\n',
      "",
    ),
    "missing duration": xml.replace(
      '        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration>\n',
      "",
    ),
    "repeated duration": xml.replace(
      '        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration>',
      '        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration>\n        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration>',
    ),
    "empty duration": xml.replace(
      ">PT1S</bpmn:timeDuration>",
      "></bpmn:timeDuration>",
    ),
    "malformed duration": xml.replace(">PT1S<", ">PT1MAYBE<"),
    "wrong duration expression kind": xml.replace(
      'xsi:type="bpmn:tFormalExpression"',
      'xsi:type="bpmn:tExpression"',
    ),
    "timeDate instead of timeDuration": xml.replaceAll(
      "timeDuration",
      "timeDate",
    ),
    "timeCycle instead of timeDuration": xml.replaceAll(
      "timeDuration",
      "timeCycle",
    ),
    "Timer Event Definition carries an ID": xml.replace(
      "<bpmn:timerEventDefinition>",
      '<bpmn:timerEventDefinition id="TimerDefinition_Inline">',
    ),
    "explicit isInterrupting": xml.replace(
      startOpening,
      '<bpmn:startEvent id="TimerStart_PT1S" isInterrupting="true">',
    ),
    "parallelMultiple": xml.replace(
      startOpening,
      '<bpmn:startEvent id="TimerStart_PT1S" parallelMultiple="true">',
    ),
    "catch Event data output": xml.replace(
      timerDefinition,
      `<bpmn:dataOutput id="DataOutput_Start"/>\n${timerDefinition}`,
    ),
    "catch Event output set": xml.replace(
      timerDefinition,
      `<bpmn:outputSet id="OutputSet_Start"/>\n${timerDefinition}`,
    ),
    "catch Event data output association": xml.replace(
      timerDefinition,
      `<bpmn:dataOutput id="DataOutput_Start"/>\n      <bpmn:dataOutputAssociation id="Association_Start"><bpmn:targetRef>DataOutput_Start</bpmn:targetRef></bpmn:dataOutputAssociation>\n${timerDefinition}`,
    ),
    "incoming Sequence Flow": xml.replace(
      `    ${startFlow}`,
      `    ${startFlow}\n    <bpmn:sequenceFlow id="Flow_EndToStart" sourceRef="EndEvent_AfterTimer" targetRef="TimerStart_PT1S"/>`,
    ),
    "zero outgoing Sequence Flows": xml
      .replace("      <bpmn:outgoing>Flow_TimerStartToTask</bpmn:outgoing>\n", "")
      .replace(`    ${startFlow}\n`, ""),
    "multiple outgoing Sequence Flows": xml.replace(
      `    ${startFlow}`,
      `    ${startFlow}\n    <bpmn:sequenceFlow id="Flow_StartToEnd" sourceRef="TimerStart_PT1S" targetRef="EndEvent_AfterTimer"/>`,
    ),
    "conditional outgoing Sequence Flow": xml.replace(
      startFlow,
      '<bpmn:sequenceFlow id="Flow_TimerStartToTask" sourceRef="TimerStart_PT1S" targetRef="UserTask_AfterTimer"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">true()</bpmn:conditionExpression></bpmn:sequenceFlow>',
    ),
    "duplicate Sequence Flow identity": xml.replace(
      'id="Flow_TaskToEnd"',
      'id="Flow_TimerStartToTask"',
    ),
    "missing executable declaration": xml.replace(
      ' isExecutable="true"',
      "",
    ),
    "non-executable Process": xml.replace(
      'isExecutable="true"',
      'isExecutable="false"',
    ),
    "second executable Process": xml.replace(
      "</bpmn:definitions>",
      '  <bpmn:process id="Process_Second" isExecutable="true"/>\n</bpmn:definitions>',
    ),
    "extra root": xml.replace(
      "  <bpmn:process",
      '  <bpmn:signal id="Signal_Extra"/>\n  <bpmn:process',
    ),
    "additional None Start Event": xml.replace(
      userTask,
      `    <bpmn:startEvent id="ManualStart"/>\n${userTask}`,
    ),
    "additional Timer Start Event": xml.replace(
      userTask,
      `    <bpmn:startEvent id="TimerStart_Second">\n${timerDefinition}\n    </bpmn:startEvent>\n${userTask}`,
    ),
    "non-top-level Timer Start": nestedTimerStartDocument(xml, false),
    "Timer Start in an Event Sub-Process": nestedTimerStartDocument(xml, true),
    "nested ordinary Sub-Process": xml.replace(
      userTask,
      '    <bpmn:subProcess id="Nested"><bpmn:startEvent id="NestedStart"/><bpmn:endEvent id="NestedEnd"/><bpmn:sequenceFlow id="NestedFlow" sourceRef="NestedStart" targetRef="NestedEnd"/></bpmn:subProcess>\n' + userTask,
    ),
    "Event Sub-Process": xml.replace(
      userTask,
      '    <bpmn:subProcess id="Nested" triggeredByEvent="true"><bpmn:startEvent id="NestedStart"/></bpmn:subProcess>\n' + userTask,
    ),
    "extension element": xml
      .replace(
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n  xmlns:test="urn:bpmn-lean:test"',
      )
      .replace(
        "      <bpmn:outgoing>Flow_TimerStartToTask</bpmn:outgoing>",
        "      <bpmn:extensionElements><test:timer-policy/></bpmn:extensionElements>\n      <bpmn:outgoing>Flow_TimerStartToTask</bpmn:outgoing>",
      ),
    "parser warning": xml.replace(
      'targetRef="UserTask_AfterTimer"',
      'targetRef="MissingTask"',
    ),
    "foreign executable content": xml.replace(
      userTask,
      userTask.replaceAll("userTask", "serviceTask"),
    ),
  };
}

function nestedTimerStartDocument(
  xml: string,
  triggeredByEvent: boolean,
): string {
  const opening = triggeredByEvent
    ? '<bpmn:subProcess id="Nested" triggeredByEvent="true">'
    : '<bpmn:subProcess id="Nested">';
  return xml
    .replace(
      '    <bpmn:startEvent id="TimerStart_PT1S">',
      `    ${opening}\n      <bpmn:startEvent id="TimerStart_PT1S">`,
    )
    .replace(
      "    </bpmn:startEvent>\n    <bpmn:userTask",
      "      </bpmn:startEvent>\n    </bpmn:subProcess>\n    <bpmn:userTask",
    );
}
