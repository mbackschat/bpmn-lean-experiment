import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectExecutableBpmnCapabilities,
} from "./executable-model-capabilities.ts";

test("distinguishes Timer Start from an Intermediate Catch Timer", () => {
  const timerStart = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Start" isExecutable="true">
        <bpmn:startEvent id="Start"><bpmn:timerEventDefinition /></bpmn:startEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);
  const timerCatch = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Catch" isExecutable="true">
        <bpmn:intermediateCatchEvent id="Catch"><bpmn:timerEventDefinition /></bpmn:intermediateCatchEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.ok(timerStart.includes("timerStartEvent"));
  assert.ok(!timerStart.includes("intermediateCatchTimerEvent"));
  assert.ok(timerCatch.includes("intermediateCatchTimerEvent"));
  assert.ok(!timerCatch.includes("timerStartEvent"));
});

test("distinguishes boundary variants by interruption and attached element", () => {
  const capabilities = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Boundaries" isExecutable="true">
        <bpmn:userTask id="Review" />
        <bpmn:subProcess id="WorkPackage" />
        <bpmn:boundaryEvent id="Reminder" attachedToRef="Review" cancelActivity="false">
          <bpmn:timerEventDefinition />
        </bpmn:boundaryEvent>
        <bpmn:boundaryEvent id="Deadline" attachedToRef="WorkPackage">
          <bpmn:timerEventDefinition />
        </bpmn:boundaryEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.ok(capabilities.includes("nonInterruptingUserTaskBoundaryTimerEvent"));
  assert.ok(capabilities.includes("interruptingSubProcessBoundaryTimerEvent"));
  assert.ok(!capabilities.includes("interruptingUserTaskBoundaryTimerEvent"));
});
