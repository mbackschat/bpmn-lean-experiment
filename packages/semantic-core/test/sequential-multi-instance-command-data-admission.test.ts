/**
 * The Sequential Multi-Instance profile has task-local data contracts rather than one undifferentiated
 * value-kind domain. Process start accepts exactly the operation's input DataObjectReference, the
 * repeated review task accepts exactly its scalar DataOutput, and the escalation task accepts no data.
 * Every negative here reaches the public command boundary so rejection must preserve the exact state.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";

import {
  fireOuterTimer,
  instanceId,
  reviewData,
  reviewProgram,
  start,
} from "./sequential-multi-instance-fixture.ts";

test("Process start accepts only the exact single collection binding", () => {
  const accepted = applyStimulus(reviewProgram, initialState, start);
  assert.equal(accepted.outcome, CommandOutcome.Committed);

  const exactInput = start.initialVariables[0];
  assert.ok(exactInput !== undefined);
  const outputBinding = {
    name: reviewData.output.dataObjectReferenceId,
    value: {
      kind: VariableValueKind.StringList,
      value: ["must-not-be-published"],
    },
  } as const;
  const refusedPatches = [
    [],
    [{ ...exactInput, name: "Other_Input" }],
    [exactInput, exactInput],
    [exactInput, outputBinding],
    [outputBinding, exactInput],
  ] as const;

  for (const [index, initialVariables] of refusedPatches.entries()) {
    const refused = applyStimulus(
      reviewProgram,
      initialState,
      {
        ...start,
        commandId: `start-review-invalid-patch-${index}`,
        initialVariables,
      },
    );

    assert.equal(refused.outcome, CommandOutcome.Rejected);
    assert.deepEqual(
      refused.state,
      initialState,
      "missing, wrong-name, duplicate, extra, and reordered bindings reject before state changes",
    );
  }
});

test("the escalation task accepts an empty patch and refuses a String patch", () => {
  const started = applyStimulus(reviewProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const interrupted = applyStimulus(reviewProgram, started.state, fireOuterTimer);
  assert.equal(interrupted.outcome, CommandOutcome.Committed);

  const taskId = {
    processInstanceId: instanceId,
    elementId: "EscalationTask",
    activation: 1,
  } as const;
  const wrongPatch = applyStimulus(reviewProgram, interrupted.state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-escalation-with-data",
    taskId,
    submittedValues: [{
      name: "unexpected",
      value: { kind: VariableValueKind.String, value: "must-not-merge" },
    }],
  });
  assert.equal(wrongPatch.outcome, CommandOutcome.Rejected);
  assert.deepEqual(wrongPatch.state, interrupted.state);

  const emptyPatch = applyStimulus(reviewProgram, interrupted.state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-escalation-without-data",
    taskId,
    submittedValues: [],
  });
  assert.equal(emptyPatch.outcome, CommandOutcome.Committed);
});
