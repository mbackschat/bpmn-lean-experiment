import assert from "node:assert/strict";
import { test } from "node:test";

import {
  StimulusKind,
  UserTaskLifecycleState,
  applyStimulus,
  compareCanonicalStrings,
  initialState,
  isWellFormedWireString,
  isWellFormedStimulus,
  projectOpenUserTasks,
  sameStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
} from "@bpmn-lean/semantic-core";
import {
  semanticProcessFor,
  loadCase,
} from "./user-task-fixture.ts";
import { requiredAt } from "./canonical-observations.ts";

test("uses the wire's Unicode scalar-value string contract", () => {
  assert.ok(compareCanonicalStrings("\u{E000}", "\u{10000}") < 0);
  assert.ok(compareCanonicalStrings("e\u{301}", "\u{E9}") < 0);
  assert.equal(isWellFormedWireString("\u{10000}"), true);
  assert.equal(isWellFormedWireString("\uD800"), false);
});

test("projects open User Tasks directly from current semantic state", async () => {
  const { scenario } = await loadCase(
    "scenario.json",
    "cibseven-evidence.json",
  );
  const model = semanticProcessFor(scenario);

  assert.deepEqual(projectOpenUserTasks(initialState), []);

  const started = applyStimulus(
    model,
    initialState,
    requiredAt(scenario.stimuli, 0, "scenario stimuli"),
  );
  assert.deepEqual(projectOpenUserTasks(started.state), [
    {
      id: {
        processInstanceId: "Instance_1",
        elementId: "UserTask_Approve",
        activation: 1,
      },
      name: "Approve",
      state: UserTaskLifecycleState.Active,
    },
  ]);

  const completed = applyStimulus(
    model,
    started.state,
    requiredAt(scenario.stimuli, 1, "scenario stimuli"),
  );
  assert.deepEqual(projectOpenUserTasks(completed.state), []);
});

test("owns exact structural well-formedness for every current stimulus", () => {
  const start = {
    kind: StimulusKind.StartProcess,
    commandId: "start",
    processId: "Process",
    instanceId: "Instance",
  };
  const completion = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete",
    taskId: {
      processInstanceId: "Instance",
      elementId: "Task",
      activation: 1,
    },
  };

  assert.equal(isWellFormedStimulus(start), true);
  assert.equal(isWellFormedStimulus(completion), true);

  for (const malformed of [
    { ...start, commandId: "" },
    { ...start, unexpected: true },
    { ...completion, kind: "unknown" },
    {
      ...completion,
      taskId: { ...completion.taskId, activation: 0 },
    },
    {
      ...completion,
      taskId: {
        ...completion.taskId,
        activation: Number.MAX_SAFE_INTEGER + 1,
      },
    },
    {
      ...completion,
      taskId: { ...completion.taskId, elementId: "\uD800" },
    },
    {
      ...completion,
      taskId: { ...completion.taskId, hostTaskId: "host-only" },
    },
    null,
  ]) {
    assert.equal(isWellFormedStimulus(malformed), false);
  }
});

test("compares complete semantic stimulus identity independently of transport IDs", () => {
  const completion = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete",
    taskId: {
      processInstanceId: "Instance",
      elementId: "Task",
      activation: 1,
    },
  } as const satisfies CompleteUserTaskInstanceStimulus;

  assert.equal(sameStimulus(completion, structuredClone(completion)), true);
  assert.equal(
    sameStimulus(completion, {
      ...completion,
      taskId: { ...completion.taskId, activation: 2 },
    }),
    false,
  );
  assert.equal(
    sameStimulus(completion, {
      kind: StimulusKind.StartProcess,
      commandId: "complete",
      processId: "Process",
      instanceId: "Instance",
    }),
    false,
  );
});
