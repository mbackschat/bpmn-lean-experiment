/**
 * The catalog variants an admitted program claims, read through the kernel reader and `admit` under the profile, so
 * the claims are the IL table's and never a reading of the BPMN text.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { UnclassifiedProgramError, programCapabilities } from "./kernel-capabilities.ts";
import { kernelAdmittedProgram, readCaseSource } from "./kernel-program.ts";
import { projectRoot } from "./pipeline-target-support.ts";

const profile = "cibseven-2.2.0";

const definitions = (body: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  xmlns:bpmnLean="urn:bpmn-lean:bpmn:extensions:v1" id="Definitions_Claims" targetNamespace="urn:bpmn-lean:test:claims">
<bpmn:signal id="Signal_Go" name="go"/>
<bpmn:process id="Process_Claims" isExecutable="true">
  <bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="W"/>
  ${body}
  <bpmn:sequenceFlow id="f2" sourceRef="W" targetRef="E"/><bpmn:endEvent id="E"/>
</bpmn:process></bpmn:definitions>`;

async function claimsOf(xml: string): Promise<ReadonlyArray<string>> {
  const bytes = new TextEncoder().encode(xml);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const admitted = kernelAdmittedProgram(await readCaseSource({ relativePath: "inline.bpmn", bytes, sha256, overlay: null }, profile));
  assert.ok(admitted.status === "accepted", admitted.status === "rejected" ? admitted.refusal : "");
  return programCapabilities(admitted.program);
}

const retained = (relativePath: string): string => readFileSync(path.join(projectRoot, relativePath), "utf8");

test("a Task claims its configured variant only with a BPMN Lean task definition, not with any extension", async () => {
  assert.deepEqual(await claimsOf(definitions(`<bpmn:task id="W"><bpmn:extensionElements>
    <bpmnLean:taskDefinition type="urn:bpmn-lean:task-handler:probe-v1"/></bpmn:extensionElements></bpmn:task>`)),
  ["configuredTask", "noneEndEvent", "noneStartEvent", "process", "sequenceFlow"]);
  assert.deepEqual(await claimsOf(definitions(`<bpmn:task id="W"><bpmn:extensionElements><camunda:inputOutput>
    <camunda:outputParameter name="n">one</camunda:outputParameter></camunda:inputOutput></bpmn:extensionElements></bpmn:task>`)),
  ["abstractTask", "noneEndEvent", "noneStartEvent", "process", "sequenceFlow"]);
});

test("a looping User Task claims the loop beside its mode, and its boundary Timer the host's looping variant", async () => {
  assert.deepEqual(await claimsOf(definitions(`<bpmn:userTask id="W"><bpmn:multiInstanceLoopCharacteristics isSequential="true">
    <bpmn:loopCardinality>2</bpmn:loopCardinality></bpmn:multiInstanceLoopCharacteristics></bpmn:userTask>
    <bpmn:boundaryEvent id="B" attachedToRef="W"><bpmn:timerEventDefinition><bpmn:timeDuration>PT1H</bpmn:timeDuration>
    </bpmn:timerEventDefinition></bpmn:boundaryEvent><bpmn:sequenceFlow id="f3" sourceRef="B" targetRef="E"/>`)), [
    "interruptingSequentialMultiInstanceBoundaryTimerEvent", "multiInstanceActivity", "noneEndEvent", "noneStartEvent",
    "process", "sequenceFlow", "sequentialMultiInstanceUserTask", "userTask",
  ]);
});

test("an Event Sub-Process's start claims with it, and a Compensation one marks its Service Task as the handler", async () => {
  const claims = await claimsOf(retained("scenarios/compensation/travel-cancellation.bpmn"));
  assert.ok(claims.includes("compensationHandlerServiceTask"), claims.join(", "));
  const outer = await claimsOf(retained("scenarios/open-rows/compensation-context-live-outer/esp-reads-and-writes-outer.bpmn"));
  assert.ok(outer.includes("eventSubProcess") && outer.includes("compensationEventSubProcess"), outer.join(", "));
});

test("an admitted construct without a catalog variant fails the program, naming every such construct", async () => {
  const xml = definitions(`<bpmn:intermediateThrowEvent id="W"><bpmn:signalEventDefinition signalRef="Signal_Go"/>
    </bpmn:intermediateThrowEvent><bpmn:sequenceFlow id="f3" sourceRef="W" targetRef="T"/>
    <bpmn:intermediateCatchEvent id="T"><bpmn:signalEventDefinition signalRef="Signal_Go"/></bpmn:intermediateCatchEvent>
    <bpmn:sequenceFlow id="f4" sourceRef="T" targetRef="E"/>`);
  await assert.rejects(claimsOf(xml), (error: Error) => error instanceof UnclassifiedProgramError &&
    error.message.includes("signal catch") && error.message.includes("signal intermediate throw"));
});
