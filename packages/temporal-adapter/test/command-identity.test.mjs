/**
 * Specifies the production Update identity contract independently of Temporal's payload-blind Update-ID deduplication.
 *
 * Exact typed encodings guard field coverage; fixed SHA-256 values guard the digest boundary; the seeded command-ID-only mutation must collapse the discriminating payload pair.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalStimulusEncoding,
  canonicalTimerFiringEncoding,
  contentBoundUpdateId,
  timerFiringCommandId,
  timerFiringStimulus,
} from "../dist/index.js";

const completion = {
  kind: "completeUserTaskInstance",
  commandId: "complete-task",
  taskId: {
    processInstanceId: "Instance_1",
    elementId: "Task_1",
    activation: 1,
  },
};

test("canonically encodes every typed stimulus field", () => {
  assert.equal(
    canonicalStimulusEncoding({
      kind: "startProcess",
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
      kind: "startProcess",
      commandId: "start-process",
      processId: "Process_1",
      instanceId: "Instance_1",
    }),
    "bpmn-command-sha256:4e983b4226cdde1bd1e933ed9dffa08479839d0ef6c259b73252198f8ebbe0fd",
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
  const requireSeparated = (updateIdForStimulus) => {
    assert.notEqual(
      updateIdForStimulus(completion),
      updateIdForStimulus(conflicting),
      "different semantic payloads must have different Update IDs",
    );
  };

  assert.doesNotThrow(() => requireSeparated(contentBoundUpdateId));
  assert.throws(
    () => requireSeparated((stimulus) => stimulus.commandId),
    /different semantic payloads must have different Update IDs/,
  );
});
