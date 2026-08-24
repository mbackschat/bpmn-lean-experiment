import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASELINE_SCENARIO_OBSERVATIONS,
  CommandOutcome,
  ControlStateKind,
  ScenarioDocumentKind,
  SemanticOperationKind,
  SemanticOriginKind,
  applyInternalOperation,
  applyStimulus,
  enabledInternalOperationCount,
  initialState,
  isWellFormedSemanticProcessProgram,
  runScenario,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticOperation,
  SemanticProcessProgram,
  Scenario,
} from "@bpmn-lean/semantic-core";

import {
  inclusiveCompletion,
  inclusiveProgram,
  inclusiveStart,
  present,
} from "./inclusive-gateway-fixture.ts";
import { stateObservationAt } from "./canonical-observations.ts";

const expectedTasks = (state: ReturnType<typeof applyStimulus>["state"]) =>
  state.userTaskWaits.map(({ id }) => id.elementId);

function completionFor(task: string) {
  switch (task) {
    case "Task_A":
    case "Task_B":
    case "Task_Default":
      return inclusiveCompletion(task);
    default:
      throw new TypeError(`Unknown Inclusive fixture task ${task}`);
  }
}

test("selects every true Inclusive branch and uses default only for the empty subset", () => {
  const cases = [
    { variables: [present("takeA")], tasks: ["Task_A"], expectedInputs: ["place:Flow_A_Join"] },
    {
      variables: [present("takeA"), present("takeB")],
      tasks: ["Task_A", "Task_B"],
      expectedInputs: ["place:Flow_A_Join", "place:Flow_B_Join"],
    },
    { variables: [], tasks: ["Task_Default"], expectedInputs: ["place:Flow_Default_Join"] },
  ];

  for (const { variables, tasks, expectedInputs } of cases) {
    const start = inclusiveStart(variables);
    assert.equal(supportsSemanticProcessExecution(start, inclusiveProgram), true);
    const result = applyStimulus(inclusiveProgram, initialState, start);
    assert.equal(result.outcome, CommandOutcome.Committed);
    assert.equal(result.internalStepBoundExceeded, false);
    assert.deepEqual(expectedTasks(result.state), tasks);
    assert.deepEqual(result.state.selectedBranchSets.map(({ expectedInputs: inputs }) => inputs), [expectedInputs]);
    const completed = applyStimulus(inclusiveProgram, result.state, completionFor(tasks[0] ?? ""));
    assert.equal(
      completed.state.control.kind,
      tasks.length === 1 ? ControlStateKind.Completed : ControlStateKind.Running,
    );
  }
});

test("requires four both-true start steps and reports bound-three exhaustion", () => {
  const start = inclusiveStart([present("takeA"), present("takeB")]);
  const exact = applyStimulus(inclusiveProgram, initialState, start, 4);
  const short = applyStimulus(inclusiveProgram, initialState, start, 3);

  assert.equal(exact.internalStepBoundExceeded, false);
  assert.deepEqual(expectedTasks(exact.state), ["Task_A", "Task_B"]);
  assert.equal(short.internalStepBoundExceeded, true);
  assert.deepEqual(expectedTasks(short.state), ["Task_A"]);
});

test("projects selected User Tasks without exposing the hidden branch record", () => {
  const scenario = {
    kind: ScenarioDocumentKind.Scenario,
    id: "inclusive-both-true-observation",
    profile: inclusiveProgram.identity.semanticProfile,
    bpmn: {
      id: inclusiveProgram.identity.sourceId,
      relativePath: "test-only/inclusive.bpmn",
      sha256: inclusiveProgram.identity.sourceSha256,
      sourceOverlay: null,
    },
    stimuli: [inclusiveStart([present("takeA"), present("takeB")])],
    observations: BASELINE_SCENARIO_OBSERVATIONS,
    provenance: {
      normativeRefs: ["BPMN 2.0.2 Table 13.3 WCP-7"],
      cibRevision: "not-applicable",
      cibRefs: [],
    },
  } as const satisfies Scenario;
  const observation = stateObservationAt(runScenario(scenario, inclusiveProgram).trace, 2);
  assert.deepEqual(observation.openUserTasks.map(({ id }) => id.elementId), ["Task_A", "Task_B"]);
  assert.equal(Object.hasOwn(observation, "selectedBranchSets"), false);
});

test("exposes exactly the independent two-task activation set after both-true selection", () => {
  const afterSelection = applyStimulus(
    inclusiveProgram,
    initialState,
    inclusiveStart([present("takeA"), present("takeB")]),
    2,
  );
  assert.equal(afterSelection.internalStepBoundExceeded, true);
  assert.equal(enabledInternalOperationCount(inclusiveProgram, afterSelection.state), 2);
  const enabled = inclusiveProgram.operations.filter((operation) =>
    applyInternalOperation(inclusiveProgram, operation, afterSelection.state) !== null
  );
  assert.deepEqual(enabled.map(({ id }) => id), ["operation:Task_A", "operation:Task_B"]);
  const [taskA, taskB] = enabled;
  assert.ok(taskA !== undefined && taskB !== undefined);
  const afterA = applyInternalOperation(inclusiveProgram, taskA, afterSelection.state);
  const afterB = applyInternalOperation(inclusiveProgram, taskB, afterSelection.state);
  assert.ok(afterA !== null && afterB !== null);
  const aThenB = applyInternalOperation(inclusiveProgram, taskB, afterA);
  const bThenA = applyInternalOperation(inclusiveProgram, taskA, afterB);
  assert.deepEqual(aThenB, bThenA);
});

test("waits for the selected subset and makes both completion orders equivalent", () => {
  const started = applyStimulus(
    inclusiveProgram,
    initialState,
    inclusiveStart([present("takeA"), present("takeB")]),
  );
  const afterA = applyStimulus(inclusiveProgram, started.state, inclusiveCompletion("Task_A"));
  assert.deepEqual(expectedTasks(afterA.state), ["Task_B"]);
  assert.equal(afterA.state.control.kind, ControlStateKind.Running);
  assert.equal(afterA.state.selectedBranchSets.length, 1);
  const join = inclusiveProgram.operations.find(
    (operation) => operation.kind === SemanticOperationKind.SynchronizeSelected,
  );
  assert.ok(join?.kind === SemanticOperationKind.SynchronizeSelected);
  assert.equal(
    applyInternalOperation(inclusiveProgram, join, { ...afterA.state, selectedBranchSets: [] }),
    null,
  );

  const aThenB = applyStimulus(inclusiveProgram, afterA.state, inclusiveCompletion("Task_B"));
  const afterB = applyStimulus(inclusiveProgram, started.state, inclusiveCompletion("Task_B"));
  const bThenA = applyStimulus(inclusiveProgram, afterB.state, inclusiveCompletion("Task_A"));
  assert.deepEqual(aThenB.state, bThenA.state);
  assert.deepEqual(aThenB.state.control, { kind: ControlStateKind.Completed, instanceId: "inclusive-instance" });
  assert.deepEqual(aThenB.state.selectedBranchSets, []);
});

test("does not complete an otherwise-quiescent scope around a live selected set", () => {
  const completion = inclusiveProgram.operations.find(
    (operation) => operation.kind === SemanticOperationKind.CompleteScope,
  );
  assert.ok(completion?.kind === SemanticOperationKind.CompleteScope);
  const started = applyStimulus(
    inclusiveProgram,
    initialState,
    inclusiveStart([present("takeA")]),
  );
  const hiddenOnly = {
    ...started.state,
    userTaskWaits: [],
    controlTokens: [],
  };

  assert.equal(applyInternalOperation(inclusiveProgram, completion, hiddenOnly), null);
});

test("admits only complete selected-input pairings while leaving same-set pairing to definition binding", () => {
  assert.equal(isWellFormedSemanticProcessProgram(inclusiveProgram), true);
  const swapped: SemanticProcessProgram = {
    ...inclusiveProgram,
    operations: inclusiveProgram.operations.map((operation) =>
      operation.kind === SemanticOperationKind.SelectMany
        ? {
            ...operation,
            candidates: [
              { ...operation.candidates[0], expectedJoinInput: operation.candidates[1].expectedJoinInput },
              { ...operation.candidates[1], expectedJoinInput: operation.candidates[0].expectedJoinInput },
            ],
          }
        : operation
    ),
  };
  assert.equal(isWellFormedSemanticProcessProgram(swapped), true);

  const wrongKey: SemanticProcessProgram = {
    ...inclusiveProgram,
    operations: inclusiveProgram.operations.map((operation) =>
      operation.kind === SemanticOperationKind.SynchronizeSelected
        ? { ...operation, selectionKey: "Other_Split" }
        : operation
    ),
  };
  assert.equal(isWellFormedSemanticProcessProgram(wrongKey), false);
});

test("owner interruption removes hidden selected-branch records", () => {
  const root = { processInstanceId: "inclusive-instance", definitionScopeId: "scope:root", activation: 1 };
  const child = { processInstanceId: "inclusive-instance", definitionScopeId: "scope:child", activation: 1 };
  const operation = {
    id: "operation:ErrorEnd",
    kind: SemanticOperationKind.ThrowError,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "ErrorEnd" },
    input: "place:ErrorInput",
    error: { errorDefinitionId: "ErrorDef", errorElementId: "Error", code: "E" },
    handler: {
      attachedScopeId: "scope:child",
      code: "E",
      output: "place:Handled",
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        boundaryEventId: "Boundary",
        errorDefinitionId: "ErrorDef",
        errorElementId: "Error",
        sequenceFlowId: "Handled",
      },
    },
  } as const satisfies SemanticOperation;
  const interrupted = applyInternalOperation(inclusiveProgram, operation, {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: "inclusive-instance" },
    scopeOccurrences: [{ id: root, parent: null }, { id: child, parent: root }],
    controlTokens: [{ placeId: "place:ErrorInput", owner: child, multiplicity: 1 }],
    selectedBranchSets: [{ owner: child, selectionKey: "Split", expectedInputs: ["place:A"] }],
  });
  assert.deepEqual(interrupted?.selectedBranchSets, []);
});
