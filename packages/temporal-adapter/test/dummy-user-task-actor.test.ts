/**
 * Locks the MVP dummy actor as a foreground client of exact task detail and completion ingress.
 * Its delay is host work: no test dependency or actor branch may mutate Workflow state directly.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  UserTaskLifecycleState,
  VariableValueKind,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  OpenUserTask,
} from "@bpmn-lean/semantic-core";
import {
  DummyUserTaskActorEventKind,
  DummyUserTaskActorResultKind,
  DummyUserTaskRefusalCode,
  ProcessCommandResultKind,
  projectUserTaskDetail,
  runDummyUserTaskActor,
} from "@bpmn-lean/temporal-adapter";
import type {
  DummyUserTaskActorEvent,
  DummyUserTaskActorPort,
  UserTaskDetail,
} from "@bpmn-lean/temporal-adapter";

const task = {
  id: {
    processInstanceId: "Instance_1",
    elementId: "UserTask_Approve",
    activation: 1,
  },
  name: "Approve",
  state: UserTaskLifecycleState.Active,
} as const satisfies OpenUserTask;

const detail = {
  task,
  inputVariables: [
    {
      name: "requestTitle",
      value: {
        kind: VariableValueKind.String,
        value: "Quarterly access review",
      },
    },
  ],
} as const satisfies UserTaskDetail;

const response = {
  elementId: "UserTask_Approve",
  delayMs: 3_000,
  inputVariableNames: ["requestTitle"],
  submittedValues: [
    {
      name: "decision",
      value: {
        kind: VariableValueKind.String,
        value: "approved",
      },
    },
    {
      name: "reviewNote",
      value: { kind: VariableValueKind.Null },
    },
  ],
} as const;

test("projects only caller-selected committed Process variables", () => {
  const state = {
    ...initialState,
    control: {
      kind: ControlStateKind.Running,
      instanceId: task.id.processInstanceId,
    },
    userTaskWaits: [
      {
        id: task.id,
        name: task.name,
        output: "place:Flow_TaskToEnd",
      },
    ],
    variables: {
      process: {
        bindings: [
          {
            name: "requestTitle",
            value: {
              kind: VariableValueKind.String,
              value: "Quarterly access review",
            },
          },
          {
            name: "secret",
            value: {
              kind: VariableValueKind.String,
              value: "not selected",
            },
          },
        ],
      },
      activities: [],
    },
  } as const;

  assert.deepEqual(
    projectUserTaskDetail(state, {
      taskId: task.id,
      inputVariableNames: ["missing", "requestTitle"],
    }),
    detail,
  );
  assert.throws(
    () => projectUserTaskDetail(state, {
      taskId: task.id,
      inputVariableNames: ["requestTitle", "missing"],
    }),
    /canonical input-variable names/,
  );
});

test("keeps the exact task active around a host delay and submits through the real port", async () => {
  const events: DummyUserTaskActorEvent[] = [];
  let detailReads = 0;
  let completions = 0;
  const port: DummyUserTaskActorPort = {
    listOpenUserTasks: async () => [task],
    readUserTaskDetail: async () => {
      detailReads += 1;
      return detail;
    },
    submitCompletion: async (stimulus) => {
      completions += 1;
      assert.equal(detailReads, 2);
      assert.deepEqual(stimulus.taskId, task.id);
      assert.deepEqual(stimulus.submittedValues, response.submittedValues);
      return {
        kind: ProcessCommandResultKind.Semantic,
        commandId: stimulus.commandId,
        outcome: CommandOutcome.Committed,
      };
    },
  };

  const result = await runDummyUserTaskActor(
    response,
    port,
    async (delayMs) => assert.equal(delayMs, 3_000),
    (event) => events.push(event),
  );

  assert.equal(result.kind, DummyUserTaskActorResultKind.Submitted);
  assert.equal(completions, 1);
  assert.deepEqual(
    events.map(({ kind }) => kind),
    [
      DummyUserTaskActorEventKind.TaskReady,
      DummyUserTaskActorEventKind.DelayStarted,
      DummyUserTaskActorEventKind.DelayFinished,
      DummyUserTaskActorEventKind.CompletionResolved,
    ],
  );
});

test("refuses simultaneous tasks without waiting or submitting", async () => {
  let waited = false;
  const secondTask = {
    ...task,
    id: { ...task.id, elementId: "UserTask_Other" },
  } as const satisfies OpenUserTask;
  const port: DummyUserTaskActorPort = {
    listOpenUserTasks: async () => [task, secondTask],
    readUserTaskDetail: async () => detail,
    submitCompletion: async () => {
      throw new Error("completion must not run");
    },
  };

  const result = await runDummyUserTaskActor(
    response,
    port,
    async () => {
      waited = true;
    },
    () => undefined,
  );

  assert.deepEqual(result, {
    kind: DummyUserTaskActorResultKind.Refused,
    code: DummyUserTaskRefusalCode.MultipleOpenUserTasks,
    evidence: "Dummy actor requires exactly one open User Task; observed 2.",
  });
  assert.equal(waited, false);
});

test("refuses a task that changes during the delay", async () => {
  let reads = 0;
  const port: DummyUserTaskActorPort = {
    listOpenUserTasks: async () => [task],
    readUserTaskDetail: async () => {
      reads += 1;
      return reads === 1 ? detail : null;
    },
    submitCompletion: async () => {
      throw new Error("completion must not run");
    },
  };

  const result = await runDummyUserTaskActor(
    response,
    port,
    async () => undefined,
    () => undefined,
  );

  assert.equal(result.kind, DummyUserTaskActorResultKind.Refused);
  if (result.kind !== DummyUserTaskActorResultKind.Refused) {
    throw new Error("expected dummy actor refusal");
  }
  assert.equal(result.code, DummyUserTaskRefusalCode.TaskChangedDuringDelay);
});

test("rejects malformed response configuration before reading Workflow state", async () => {
  let reads = 0;
  const port: DummyUserTaskActorPort = {
    listOpenUserTasks: async () => {
      reads += 1;
      return [task];
    },
    readUserTaskDetail: async () => detail,
    submitCompletion: async () => ({
      kind: ProcessCommandResultKind.Semantic,
      commandId: "unused",
      outcome: CommandOutcome.Committed,
    }),
  };

  await assert.rejects(
    runDummyUserTaskActor(
      { ...response, delayMs: 0 },
      port,
      async () => undefined,
      () => undefined,
    ),
    /delayMs must be a positive safe integer/,
  );
  assert.equal(reads, 0);
});
