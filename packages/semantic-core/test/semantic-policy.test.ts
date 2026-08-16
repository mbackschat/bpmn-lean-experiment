import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectExecutionResultKind,
  StimulusKind,
  UserTaskLifecycleState,
  VariableValueKind,
  applyStimulus,
  compareCanonicalStrings,
  initialState,
  isWellFormedWireString,
  isWellFormedStimulus,
  isVariableValue,
  projectOpenUserTasks,
  sameStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  StartProcessStimulus,
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
    initialVariables: [
      {
        name: "requestTitle",
        value: { kind: VariableValueKind.String, value: "Review request" },
      },
    ],
  };
  const completion = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete",
    taskId: {
      processInstanceId: "Instance",
      elementId: "Task",
      activation: 1,
    },
    submittedValues: [
      {
        name: "answer",
        value: { kind: VariableValueKind.String, value: "yes" },
      },
    ],
  };

  assert.equal(isWellFormedStimulus(start), true);
  assert.equal(isWellFormedStimulus(completion), true);

  for (const malformed of [
    { ...start, commandId: "" },
    { ...start, unexpected: true },
    { ...start, initialVariables: undefined },
    {
      ...start,
      initialVariables: [
        start.initialVariables[0],
        start.initialVariables[0],
      ],
    },
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
    { ...completion, submittedValues: undefined },
    {
      ...completion,
      submittedValues: [
        completion.submittedValues[0],
        completion.submittedValues[0],
      ],
    },
    {
      ...completion,
      submittedValues: [
        {
          name: "before",
          value: { kind: VariableValueKind.Null },
        },
        completion.submittedValues[0],
      ],
    },
    null,
  ]) {
    assert.equal(isWellFormedStimulus(malformed), false);
  }
});

test("rejects sparse and augmented semantic arrays before iteration", () => {
  const sparseList = new Array<string>(1);
  Object.assign(sparseList, { compensatingExtra: "must-not-hide-hole" });
  const augmentedList = ["policy"];
  Object.defineProperty(augmentedList, "privateOrdinal", {
    value: 1,
    enumerable: false,
  });
  assert.equal(isVariableValue({
    kind: VariableValueKind.StringList,
    value: sparseList,
  }), false);
  assert.equal(isVariableValue({
    kind: VariableValueKind.StringList,
    value: augmentedList,
  }), false);

  const sparsePatch = new Array(1);
  const augmentedPatch = [{
    name: "answer",
    value: { kind: VariableValueKind.String, value: "yes" },
  }];
  Object.assign(augmentedPatch, { transportCursor: "private" });
  const taskId = {
    processInstanceId: "Instance",
    elementId: "Task",
    activation: 1,
  };
  assert.equal(isWellFormedStimulus({
    kind: StimulusKind.StartProcess,
    commandId: "sparse-start",
    processId: "Process",
    instanceId: "Instance",
    initialVariables: sparsePatch,
  }), false);
  assert.equal(isWellFormedStimulus({
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "augmented-completion",
    taskId,
    submittedValues: augmentedPatch,
  }), false);
  assert.equal(isWellFormedStimulus({
    kind: StimulusKind.CompleteEffect,
    commandId: "sparse-effect",
    effectId: { ...taskId, elementId: "Effect" },
    result: {
      kind: EffectExecutionResultKind.Success,
      localPatch: sparsePatch,
    },
  }), false);
});

test("compares complete semantic stimulus identity independently of transport IDs", () => {
  const start = {
    kind: StimulusKind.StartProcess,
    commandId: "start",
    processId: "Process",
    instanceId: "Instance",
    initialVariables: [
      {
        name: "requestTitle",
        value: { kind: VariableValueKind.String, value: "First" },
      },
    ],
  } as const satisfies StartProcessStimulus;
  const completion = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete",
    taskId: {
      processInstanceId: "Instance",
      elementId: "Task",
      activation: 1,
    },
    submittedValues: [
      {
        name: "answer",
        value: { kind: VariableValueKind.String, value: "yes" },
      },
    ],
  } as const satisfies CompleteUserTaskInstanceStimulus;

  assert.equal(sameStimulus(start, structuredClone(start)), true);
  assert.equal(
    sameStimulus(start, {
      ...start,
      initialVariables: [
        {
          name: "requestTitle",
          value: { kind: VariableValueKind.String, value: "Second" },
        },
      ],
    }),
    false,
  );

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
      ...completion,
      submittedValues: [
        {
          name: "answer",
          value: { kind: VariableValueKind.String, value: "no" },
        },
      ],
    }),
    false,
  );
  assert.equal(
    sameStimulus(completion, {
      kind: StimulusKind.StartProcess,
      commandId: "complete",
      processId: "Process",
      instanceId: "Instance",
      initialVariables: [],
    }),
    false,
  );
});
