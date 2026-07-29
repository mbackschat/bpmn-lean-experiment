/**
 * Specifies the production Update identity contract independently of Temporal's payload-blind Update-ID deduplication.
 *
 * Exact typed encodings guard field coverage; fixed SHA-256 values guard the digest boundary; the seeded command-ID-only mutation must collapse the discriminating payload pair.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectExecutionResultKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type { Stimulus } from "@bpmn-lean/semantic-core";
import {
  canonicalStimulusEncoding,
  canonicalTimerFiringEncoding,
  contentBoundUpdateId,
  timerFiringCommandId,
  timerFiringStimulus,
} from "@bpmn-lean/temporal-adapter";

const completion = {
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-task",
  taskId: {
    processInstanceId: "Instance_1",
    elementId: "Task_1",
    activation: 1,
  },
} as const;

test("canonically encodes every typed stimulus field", () => {
  assert.equal(
    canonicalStimulusEncoding({
      kind: StimulusKind.StartProcess,
      commandId: "start-process",
      processId: "Process_1",
      instanceId: "Instance_1",
    }),
    '["startProcess","start-process","Process_1","Instance_1"]',
  );
  assert.equal(
    canonicalStimulusEncoding(completion),
    '["completeUserTaskInstance","complete-task",["Instance_1","Task_1",1]]',
  );
  assert.throws(
    () => canonicalStimulusEncoding({ ...completion, extra: true }),
    /well-formed semantic stimulus/,
  );
});

test("derives fixed SHA-256 Update IDs from exact canonical content", () => {
  assert.equal(
    contentBoundUpdateId(completion),
    "bpmn-command-sha256:6a8b84fc4b7902b4987fa232c449287ea5d01f921ae0931dad0400a78b39c72f",
  );
  assert.equal(
    contentBoundUpdateId({
      kind: StimulusKind.StartProcess,
      commandId: "start-process",
      processId: "Process_1",
      instanceId: "Instance_1",
    }),
    "bpmn-command-sha256:4e983b4226cdde1bd1e933ed9dffa08479839d0ef6c259b73252198f8ebbe0fd",
  );
});

test("content-binds the typed BPMN Error command without coercing null", () => {
  const stimulus = {
    kind: StimulusKind.CompleteEffect,
    commandId:
      "complete-effect-sha256:49ddf71a5f8e23b59c039a65bd64a2ed16232c31a47790b2273e1b05c3c971d5",
    effectId: {
      processInstanceId: "Instance_1",
      elementId: "CreateRelationshipLinkTask",
      activation: 1,
    },
    result: {
      kind: EffectExecutionResultKind.BpmnError,
      code: "LinkLimitReachedError",
      message: "Link limit reached",
      localPatch: [{
        name: "newLinkId",
        value: { kind: VariableValueKind.Null },
      }],
    },
  } as const satisfies Stimulus;
  assert.equal(
    canonicalStimulusEncoding(stimulus),
    '["completeEffect","complete-effect-sha256:49ddf71a5f8e23b59c039a65bd64a2ed16232c31a47790b2273e1b05c3c971d5",["Instance_1","CreateRelationshipLinkTask",1],["bpmnError","LinkLimitReachedError",["some","Link limit reached"],[["newLinkId",["null"]]]]]',
  );
  assert.equal(
    contentBoundUpdateId(stimulus),
    "bpmn-command-sha256:01a0ceb7728092785d29d40533f67a3a200f95705793e95cce03947ee4d8e3ac",
  );
});

test("derives the scenario-identical timer command inside the Workflow boundary", () => {
  const timer = {
    id: {
      processInstanceId: "Instance_1",
      elementId: "TimerCatch_PT1S",
      activation: 1,
    },
    deadlineMs: 1000,
  };
  assert.equal(
    canonicalTimerFiringEncoding(timer.id, timer.deadlineMs),
    '["fireTimer",["Instance_1","TimerCatch_PT1S",1],1000]',
  );
  assert.equal(
    timerFiringCommandId(timer.id, timer.deadlineMs),
    "fire-timer-sha256:6abd9ffaf10c2bcefd54580956fd16ca64043ce25367c6f8a5b697033bca5c3b",
  );
  assert.deepEqual(timerFiringStimulus(timer), {
    kind: "fireTimer",
    commandId:
      "fire-timer-sha256:6abd9ffaf10c2bcefd54580956fd16ca64043ce25367c6f8a5b697033bca5c3b",
    timerId: timer.id,
    logicalTimeMs: 1000,
  });
});

test("the command-ID-only mutation collapses the payload-conflict witness", () => {
  const conflicting = {
    ...completion,
    taskId: {
      ...completion.taskId,
      activation: 2,
    },
  };
  const requireSeparated = (
    updateIdForStimulus: (stimulus: Stimulus) => string,
  ): void => {
    assert.notEqual(
      updateIdForStimulus(completion),
      updateIdForStimulus(conflicting),
      "different semantic payloads must have different Update IDs",
    );
  };

  assert.doesNotThrow(() => requireSeparated(contentBoundUpdateId));
  assert.throws(
    () => requireSeparated((stimulus: Stimulus) => stimulus.commandId),
    /different semantic payloads must have different Update IDs/,
  );
});
