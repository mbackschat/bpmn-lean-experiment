import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  classifyBpmnXml,
  inventoryCibBpmnCorpus,
} from "./cib-bpmn-breadth.ts";

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <!-- <bpmn:receiveTask id="Commented" /> -->
  <bpmn:process id="Process_1">
    <bpmn:receiveTask id="Receive_Addressed"
      messageRef="Message_1"
      operationRef="Operation_1" />
    <bpmn:receiveTask id="Receive_Instantiate" instantiate="true" />
    <bpmn:subProcess id="Ordinary">
      <bpmn:multiInstanceLoopCharacteristics isSequential="true">
        <bpmn:completionCondition>done</bpmn:completionCondition>
      </bpmn:multiInstanceLoopCharacteristics>
    </bpmn:subProcess>
    <bpmn:subProcess id="Event" triggeredByEvent="true">
      <bpmn:startEvent id="MessageStart">
        <bpmn:messageEventDefinition messageRef="Message_1" />
      </bpmn:startEvent>
    </bpmn:subProcess>
    <bpmn:callActivity id="Call" calledElement="Process_2" />
    <bpmn:intermediateThrowEvent id="SignalThrow">
      <bpmn:signalEventDefinition signalRef="Signal_1" />
    </bpmn:intermediateThrowEvent>
    <bpmn:intermediateThrowEvent id="NoneThrow" />
    <bpmn:task id="ParallelMultiInstance">
      <bpmn:multiInstanceLoopCharacteristics isSequential="false" />
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>`;

// `Boundary_Orphan` deliberately references a missing target, and
// `Boundary_None` deliberately carries no Event Definition, because both shapes
// occur in the pinned corpus and must not silently join a decision-relevant
// bucket. `Boundary_Timer` is the only non-interrupting event here, so a
// classifier that ignored `cancelActivity` would still match the total.
const boundaryFixture = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1">
    <serviceTask id="Service_1" />
    <userTask id="User_1" />
    <subProcess id="Sub_1" />
    <callActivity id="Call_1" calledElement="Process_2" />
    <boundaryEvent id="Boundary_Error" attachedToRef="Service_1">
      <errorEventDefinition errorRef="Error_1" />
    </boundaryEvent>
    <boundaryEvent id="Boundary_Timer" attachedToRef="User_1"
      cancelActivity="false">
      <timerEventDefinition><timeDuration>PT1S</timeDuration></timerEventDefinition>
    </boundaryEvent>
    <boundaryEvent id="Boundary_Message" attachedToRef="Sub_1">
      <messageEventDefinition messageRef="Message_1" />
    </boundaryEvent>
    <boundaryEvent id="Boundary_Compensation" attachedToRef="Call_1">
      <compensateEventDefinition />
    </boundaryEvent>
    <boundaryEvent id="Boundary_None" attachedToRef="Service_1" />
    <boundaryEvent id="Boundary_Orphan" attachedToRef="Absent_1">
      <signalEventDefinition signalRef="Signal_1" />
    </boundaryEvent>
  </process>
</definitions>`;

test("separates boundary Event triggers, interruption, and attachment hosts", () => {
  const classification = classifyBpmnXml(boundaryFixture);

  assert.deepEqual(classification.candidates.boundaryEvent, {
    occurrences: 6,
    interrupting: 5,
    nonInterrupting: 1,
    triggers: {
      compensation: 1,
      error: 1,
      message: 1,
      none: 1,
      signal: 1,
      timer: 1,
    },
    attachments: {
      callActivity: 1,
      serviceTask: 2,
      subProcess: 1,
      unresolved: 1,
      userTask: 1,
    },
  });
  // Exactly one attachment per Boundary Event, unlike triggers, which a
  // multiple-Event-Definition event contributes to more than once.
  assert.equal(
    Object.values(classification.candidates.boundaryEvent.attachments).reduce(
      (total, count) => total + count,
      0,
    ),
    classification.candidates.boundaryEvent.occurrences,
  );
});

test("classifies reusable breadth mechanisms without depending on namespace prefixes", () => {
  assert.deepEqual(classifyBpmnXml(fixture), {
    structurallyMalformed: false,
    broad: {
      callActivity: 1,
      intermediateThrowEvent: 2,
      messageEventDefinition: 1,
      multiInstanceLoopCharacteristics: 2,
      receiveTask: 2,
      signalEventDefinition: 1,
      subProcess: 2,
    },
    candidates: {
      boundaryEvent: {
        occurrences: 0,
        interrupting: 0,
        nonInterrupting: 0,
        triggers: {},
        attachments: {},
      },
      callActivity: {
        occurrences: 1,
        withCalledElement: 1,
        withoutCalledElement: 0,
      },
      eventSubProcess: {
        interruptingStarts: 1,
        nonInterruptingStarts: 0,
        occurrences: 1,
        triggers: {
          message: 1,
        },
      },
      intermediateThrowEvent: {
        occurrences: 2,
        triggers: {
          none: 1,
          signal: 1,
        },
      },
      multiInstance: {
        occurrences: 2,
        parallel: 1,
        sequential: 1,
        withCompletionCondition: 1,
        withLoopCardinality: 0,
      },
      ordinarySubProcess: {
        occurrences: 1,
      },
      receiveTask: {
        occurrences: 2,
        instantiateTrue: 1,
        withMessageRef: 1,
        withOperationRef: 1,
        withoutMessageRef: 1,
      },
    },
  });
});

test("labels malformed negative fixtures while retaining their lexical signal", () => {
  assert.deepEqual(
    classifyBpmnXml("<definitions><receiveTask></definitions>"),
    {
      structurallyMalformed: true,
      broad: { receiveTask: 1 },
      candidates: {
        boundaryEvent: {
          occurrences: 0,
          interrupting: 0,
          nonInterrupting: 0,
          triggers: {},
          attachments: {},
        },
        callActivity: {
          occurrences: 0,
          withCalledElement: 0,
          withoutCalledElement: 0,
        },
        eventSubProcess: {
          interruptingStarts: 0,
          nonInterruptingStarts: 0,
          occurrences: 0,
          triggers: {},
        },
        intermediateThrowEvent: { occurrences: 0, triggers: {} },
        multiInstance: {
          occurrences: 0,
          parallel: 0,
          sequential: 0,
          withCompletionCondition: 0,
          withLoopCardinality: 0,
        },
        ordinarySubProcess: { occurrences: 0 },
        receiveTask: {
          occurrences: 1,
          instantiateTrue: 0,
          withMessageRef: 0,
          withOperationRef: 0,
          withoutMessageRef: 1,
        },
      },
    },
  );
});

test("aggregates file and occurrence counts over both BPMN filename forms", async () => {
  const corpusRoot = await mkdtemp(path.join(tmpdir(), "cib-breadth-"));
  try {
    await mkdir(path.join(corpusRoot, "nested"));
    await Promise.all([
      writeFile(
        path.join(corpusRoot, "one.bpmn"),
        "<definitions><process><receiveTask/><receiveTask/></process></definitions>",
      ),
      writeFile(
        path.join(corpusRoot, "nested", "two.bpmn20.xml"),
        '<definitions><process><receiveTask messageRef="Message_1"/></process></definitions>',
      ),
      writeFile(path.join(corpusRoot, "ignored.xml"), "<receiveTask/>")
    ]);

    const report = await inventoryCibBpmnCorpus(corpusRoot);

    assert.equal(report.files, 2);
    assert.equal(report.structurallyMalformedFiles, 0);
    assert.deepEqual(report.broad.receiveTask, {
      files: 2,
      occurrences: 3,
    });
    assert.deepEqual(report.candidates["receiveTask.withMessageRef"], {
      files: 1,
      occurrences: 1,
    });
    assert.deepEqual(report.candidates["receiveTask.withoutMessageRef"], {
      files: 1,
      occurrences: 2,
    });
    assert.deepEqual(report.broad.complexGateway, {
      files: 0,
      occurrences: 0,
    });
  } finally {
    await rm(corpusRoot, { recursive: true });
  }
});
