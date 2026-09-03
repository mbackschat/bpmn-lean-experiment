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

test("distinguishes a payload-bearing Message catch from a payload-free catch", () => {
  const payloadCatch = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Payload" isExecutable="true">
        <bpmn:intermediateCatchEvent id="Catch_Payload">
          <bpmn:dataOutput id="Payload" />
          <bpmn:dataOutputAssociation>
            <bpmn:sourceRef>Payload</bpmn:sourceRef>
            <bpmn:targetRef>StoredPayload</bpmn:targetRef>
          </bpmn:dataOutputAssociation>
          <bpmn:outputSet><bpmn:dataOutputRefs>Payload</bpmn:dataOutputRefs></bpmn:outputSet>
          <bpmn:messageEventDefinition />
        </bpmn:intermediateCatchEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);
  const payloadFreeCatch = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_PayloadFree" isExecutable="true">
        <bpmn:intermediateCatchEvent id="Catch_PayloadFree">
          <bpmn:messageEventDefinition />
        </bpmn:intermediateCatchEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.equal(payloadCatch.includes("messagePayloadCatchEvent"), true);
  assert.equal(
    payloadFreeCatch.includes("messagePayloadCatchEvent"),
    false,
  );
  assert.throws(
    () => detectExecutableBpmnCapabilities(`
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="Process_PartialPayload" isExecutable="true">
          <bpmn:intermediateCatchEvent id="Catch_PartialPayload">
            <bpmn:dataOutput id="Payload" />
            <bpmn:messageEventDefinition />
          </bpmn:intermediateCatchEvent>
        </bpmn:process>
      </bpmn:definitions>
    `),
    /unclassified executable BPMN Message Catch Event payload mediation/u,
  );
});

test("classifies the complete single-key Message correlation shape", () => {
  const capabilities = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:correlationProperty id="CorrelationProperty_Reference">
        <bpmn:correlationPropertyRetrievalExpression messageRef="Message_Confirmed">
          <bpmn:messagePath>payload</bpmn:messagePath>
        </bpmn:correlationPropertyRetrievalExpression>
      </bpmn:correlationProperty>
      <bpmn:process id="Process_Correlation" isExecutable="true">
        <bpmn:intermediateCatchEvent id="Catch_Initial">
          <bpmn:messageEventDefinition messageRef="Message_Confirmed" />
        </bpmn:intermediateCatchEvent>
        <bpmn:intermediateCatchEvent id="Catch_Confirmed">
          <bpmn:messageEventDefinition messageRef="Message_Confirmed" />
        </bpmn:intermediateCatchEvent>
        <bpmn:correlationSubscription correlationKeyRef="CorrelationKey_Reference">
          <bpmn:correlationPropertyBinding correlationPropertyRef="CorrelationProperty_Reference">
            <bpmn:dataPath>property:Property_Reference</bpmn:dataPath>
          </bpmn:correlationPropertyBinding>
        </bpmn:correlationSubscription>
      </bpmn:process>
      <bpmn:collaboration id="Collaboration_Correlation">
        <bpmn:conversation id="Conversation_Correlation">
          <bpmn:correlationKey id="CorrelationKey_Reference">
            <bpmn:correlationPropertyRef>CorrelationProperty_Reference</bpmn:correlationPropertyRef>
          </bpmn:correlationKey>
        </bpmn:conversation>
      </bpmn:collaboration>
    </bpmn:definitions>
  `);

  assert.equal(capabilities.includes("messageKeyCorrelation"), true);
  assert.throws(
    () => detectExecutableBpmnCapabilities(`
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:correlationProperty id="CorrelationProperty_Reference" />
        <bpmn:process id="Process_PartialCorrelation" isExecutable="true" />
      </bpmn:definitions>
    `),
    /unclassified executable BPMN Message key-correlation shape/u,
  );
  assert.throws(
    () => detectExecutableBpmnCapabilities(`
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:correlationProperty id="CorrelationProperty_Reference">
          <bpmn:correlationPropertyRetrievalExpression messageRef="Message_Confirmed">
            <bpmn:messagePath>payload</bpmn:messagePath>
          </bpmn:correlationPropertyRetrievalExpression>
        </bpmn:correlationProperty>
        <bpmn:process id="Process_Correlation" isExecutable="true">
          <bpmn:correlationSubscription correlationKeyRef="CorrelationKey_Reference">
            <bpmn:correlationPropertyBinding correlationPropertyRef="CorrelationProperty_Reference">
              <bpmn:dataPath>property:Property_Reference</bpmn:dataPath>
            </bpmn:correlationPropertyBinding>
          </bpmn:correlationSubscription>
        </bpmn:process>
        <bpmn:collaboration id="Collaboration_Correlation">
          <bpmn:conversation id="Conversation_Correlation">
            <bpmn:correlationKey id="CorrelationKey_Reference">
              <bpmn:correlationPropertyRef>CorrelationProperty_Reference</bpmn:correlationPropertyRef>
            </bpmn:correlationKey>
          </bpmn:conversation>
        </bpmn:collaboration>
      </bpmn:definitions>
    `),
    /unclassified executable BPMN Message key-correlation shape/u,
  );
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

test("classifies only an interrupting Message Boundary Event on a User Task", () => {
  const interrupting = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Withdrawal" isExecutable="true">
        <bpmn:userTask id="Review" />
        <bpmn:boundaryEvent id="Withdrawal" attachedToRef="Review">
          <bpmn:messageEventDefinition />
        </bpmn:boundaryEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.ok(
    interrupting.includes("interruptingUserTaskBoundaryMessageEvent"),
  );
  assert.throws(
    () => detectExecutableBpmnCapabilities(`
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="Process_Reminder" isExecutable="true">
          <bpmn:userTask id="Review" />
          <bpmn:boundaryEvent
            id="Reminder"
            attachedToRef="Review"
            cancelActivity="false">
            <bpmn:messageEventDefinition />
          </bpmn:boundaryEvent>
        </bpmn:process>
      </bpmn:definitions>
    `),
    /unclassified executable BPMN non-interrupting User Task boundary Message/u,
  );
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
