import assert from "node:assert/strict";
import { test } from "node:test";

import {
  completeWork,
  engineProcessWorkLocatorForCanonicalProcess,
} from "@bpmn-lean/engine-api";
import { VariableValueKind } from "@bpmn-lean/semantic-core";

test("forwards detached integer and ordered-list completion values", async () => {
  const calls: unknown[] = [];
  const client = {
    getHandle: () => ({
      executeUpdate: async (_name: string, options: unknown) => {
        calls.push(options);
        return "committed";
      },
      getUpdateHandle: () => ({ result: async () => "committed" }),
    }),
  } as never;
  const riskFlags = ["policy", "policy"];
  const result = await completeWork({
    temporalClient: client,
    locator: engineProcessWorkLocatorForCanonicalProcess("instance-1"),
    hostingProcessInstanceId: "instance-1",
    stimulus: {
      kind: "completeUserTaskInstance",
      commandId: "complete-review",
      taskId: {
        processInstanceId: "instance-1",
        elementId: "ReviewException",
        activation: 1,
      },
      submittedValues: [
        {
          name: "approvedAmount",
          value: { kind: VariableValueKind.Integer, value: 4250 },
        },
        {
          name: "riskFlags",
          value: { kind: VariableValueKind.StringList, value: riskFlags },
        },
      ],
    },
  });
  riskFlags[0] = "mutated";

  assert.deepEqual(result, {
    kind: "semantic",
    commandId: "complete-review",
    outcome: "committed",
  });
  assert.equal(calls.length, 1);
  const options = calls[0] as Readonly<{ args: readonly unknown[]; updateId: string }>;
  assert.deepEqual(options.args, [{
      kind: "completeUserTaskInstance",
      commandId: "complete-review",
      taskId: {
        processInstanceId: "instance-1",
        elementId: "ReviewException",
        activation: 1,
      },
      submittedValues: [
        { name: "approvedAmount", value: { kind: "integer", value: 4250 } },
        {
          name: "riskFlags",
          value: { kind: "stringList", value: ["policy", "policy"] },
        },
      ],
    }]);
  assert.match(options.updateId, /^bpmn-command-sha256:[0-9a-f]{64}$/u);
});

test("refuses malformed completion arrays before cloning or transport", () => {
  let transportCalls = 0;
  const client = {
    getHandle: () => {
      transportCalls += 1;
      throw new Error("transport must not be reached");
    },
  } as never;
  const taskId = {
    processInstanceId: "instance-1",
    elementId: "ReviewException",
    activation: 1,
  };
  const augmentedList = ["policy"];
  Object.assign(augmentedList, { privateCursor: 1 });
  const sparsePatch = new Array(1);
  const mutations = [
    sparsePatch,
    [{
      name: "riskFlags",
      value: { kind: VariableValueKind.StringList, value: augmentedList },
    }],
  ];

  for (const [index, submittedValues] of mutations.entries()) {
    assert.throws(() => completeWork({
      temporalClient: client,
      locator: engineProcessWorkLocatorForCanonicalProcess("instance-1"),
      hostingProcessInstanceId: "instance-1",
      stimulus: {
        kind: "completeUserTaskInstance",
        commandId: `malformed-${index}`,
        taskId,
        submittedValues,
      } as never,
    }), /well-formed completion stimulus/u);
  }
  assert.equal(transportCalls, 0);
});
