/**
 * Specifies the production Update identity contract independently of Temporal's payload-blind Update-ID deduplication.
 *
 * Exact typed encodings guard field coverage; fixed SHA-256 values guard the digest boundary; the seeded command-ID-only mutation must collapse the discriminating payload pair.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalStimulusEncoding,
  contentBoundUpdateId,
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
