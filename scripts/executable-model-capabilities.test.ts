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

test("classifies only an explicitly declared Multi-Instance User Task mode", () => {
  const sequential = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Sequential" isExecutable="true">
        <bpmn:userTask id="Review">
          <bpmn:multiInstanceLoopCharacteristics isSequential="true" />
        </bpmn:userTask>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.ok(sequential.includes("userTask"));
  assert.ok(sequential.includes("sequentialMultiInstanceUserTask"));
  const parallel = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Parallel" isExecutable="true">
        <bpmn:userTask id="Review">
          <bpmn:multiInstanceLoopCharacteristics isSequential="false" />
        </bpmn:userTask>
      </bpmn:process>
    </bpmn:definitions>
  `);
  assert.ok(parallel.includes("userTask"));
  assert.ok(parallel.includes("parallelMultiInstanceUserTask"));
  assert.ok(!parallel.includes("sequentialMultiInstanceUserTask"));
});

test("classifies the interrupting Timer by its sequential Multi-Instance host", () => {
  const capabilities = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Deadline" isExecutable="true">
        <bpmn:userTask id="Review">
          <bpmn:multiInstanceLoopCharacteristics isSequential="true" />
        </bpmn:userTask>
        <bpmn:boundaryEvent id="Deadline" attachedToRef="Review">
          <bpmn:timerEventDefinition />
        </bpmn:boundaryEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.ok(
    capabilities.includes(
      "interruptingSequentialMultiInstanceBoundaryTimerEvent",
    ),
  );
  assert.ok(!capabilities.includes("interruptingUserTaskBoundaryTimerEvent"));
  assert.throws(
    () => detectExecutableBpmnCapabilities(`
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="Process_Reminder" isExecutable="true">
          <bpmn:userTask id="Review">
            <bpmn:multiInstanceLoopCharacteristics isSequential="true" />
          </bpmn:userTask>
          <bpmn:boundaryEvent
            id="Reminder"
            attachedToRef="Review"
            cancelActivity="false">
            <bpmn:timerEventDefinition />
          </bpmn:boundaryEvent>
        </bpmn:process>
      </bpmn:definitions>
    `),
    /unclassified executable BPMN non-interrupting sequential Multi-Instance boundary Timer/u,
  );
});
