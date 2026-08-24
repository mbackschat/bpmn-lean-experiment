import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyScenarioVariableValueContract } from "./contract-artifacts.ts";

const profile = "bpmn-2.0.2-sequential-multi-instance-user-task-draft";

function startScenario(items: ReadonlyArray<string>) {
  return {
    profile,
    stimuli: [{
      kind: "startProcess",
      initialVariables: [{
        name: "DataObjectReference_InputItems",
        value: { kind: "stringList", value: items },
      }],
    }],
  };
}

test("admits the exact sequential Multi-Instance Process-start list domain", () => {
  assert.doesNotThrow(() =>
    verifyScenarioVariableValueContract(
      startScenario(Array.from({ length: 16 }, (_, index) => `item-${index}`)),
    )
  );
});

test("admits only the operation-bound Process input name and cardinality", () => {
  for (const initialVariables of [
    [],
    [{
      name: "DataObject_InputItems",
      value: { kind: "stringList", value: ["item"] },
    }],
    [
      {
        name: "DataObjectReference_InputItems",
        value: { kind: "stringList", value: ["item"] },
      },
      {
        name: "DataObjectReference_Extra",
        value: { kind: "stringList", value: ["item"] },
      },
    ],
  ]) {
    assert.throws(
      () =>
        verifyScenarioVariableValueContract({
          profile,
          stimuli: [{ kind: "startProcess", initialVariables }],
        }),
      /exactly one DataObjectReference_InputItems stringList binding/u,
    );
  }
});

test("admits only the task-local scalar result and an empty escalation patch", () => {
  assert.doesNotThrow(() =>
    verifyScenarioVariableValueContract({
      profile,
      stimuli: [{
        kind: "completeUserTaskInstance",
        taskId: { elementId: "UserTask_Review" },
        submittedValues: [{
          name: "DataOutput_CurrentResult",
          value: { kind: "string", value: "accepted" },
        }],
      }, {
        kind: "completeUserTaskInstance",
        taskId: { elementId: "UserTask_Escalation" },
        submittedValues: [],
      }],
    })
  );

  for (const submittedValues of [
    [],
    [{
      name: "DataOutput_Results",
      value: { kind: "string", value: "accepted" },
    }],
    [{
      name: "DataOutput_CurrentResult",
      value: { kind: "stringList", value: ["accepted"] },
    }],
  ]) {
    assert.throws(
      () =>
        verifyScenarioVariableValueContract({
          profile,
          stimuli: [{
            kind: "completeUserTaskInstance",
            taskId: { elementId: "UserTask_Review" },
            submittedValues,
          }],
        }),
      /exactly one DataOutput_CurrentResult string binding/u,
    );
  }

  assert.throws(
    () =>
      verifyScenarioVariableValueContract({
        profile,
        stimuli: [{
          kind: "completeUserTaskInstance",
          taskId: { elementId: "UserTask_Escalation" },
          submittedValues: [{
            name: "DataOutput_CurrentResult",
            value: { kind: "string", value: "must-not-commit" },
          }],
        }],
      }),
    /non-review User Task completion requires an empty patch/u,
  );
});

test("rejects a sequential Multi-Instance list on the completion surface", () => {
  const completion = {
    profile,
    stimuli: [{
      kind: "completeUserTaskInstance",
      taskId: { elementId: "UserTask_Review" },
      submittedValues: [{
        name: "DataOutput_CurrentResult",
        value: { kind: "stringList", value: ["wrong-surface"] },
      }],
    }],
  };
  assert.throws(
    () => verifyScenarioVariableValueContract(completion),
    /exactly one DataOutput_CurrentResult string binding/u,
  );
});

test("rejects the seventeenth sequential Multi-Instance input item", () => {
  assert.throws(
    () =>
      verifyScenarioVariableValueContract(
        startScenario(Array.from({ length: 17 }, () => "item")),
      ),
    /at most 16 members/u,
  );
});

test("rejects an input item one byte beyond the profile bound", () => {
  assert.throws(
    () =>
      verifyScenarioVariableValueContract(
        startScenario(["x".repeat(513)]),
      ),
    /exceeds 512 UTF-8 bytes/u,
  );
});

test("counts JSON escapes in the canonical collection bound", () => {
  const escaped = Array.from({ length: 16 }, () => '"'.repeat(512));
  assert.ok(escaped.every((item) => Buffer.byteLength(item, "utf8") === 512));
  assert.throws(
    () => verifyScenarioVariableValueContract(startScenario(escaped)),
    /canonical stringList exceeds 8192 UTF-8 bytes/u,
  );
});
