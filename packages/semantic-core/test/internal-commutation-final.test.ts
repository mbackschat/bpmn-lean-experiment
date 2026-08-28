import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ControlStateKind,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticProfileId,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticTransitionKind,
  StimulusKind,
  applyInternalOperationStep,
  applyStimulusWithTrace,
  initialState,
  isWellFormedSemanticProcessProgram,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticOperation,
} from "@bpmn-lean/semantic-core";

import {
  closeSupportedInternalOperations,
  enabledOperations,
  internalOperationFrontierIsPairwiseIndependent,
} from "./internal-commutation-fixture.ts";
import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";
import { parallelProgram } from "./parallel-fork-join-fixture.ts";

const threeTaskProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "internal-commutation-final-test",
    sourceId: "internal-commutation-final-test",
    sourceOverlay: null,
    sourceSha256: "8".repeat(64),
  },
  processId: "Process_InternalCommutationFinal",
  controlPlaces: [
    ...["A", "B", "C"].flatMap((arm) => [
      controlPlace(`Flow_${arm}_Input`),
      controlPlace(`Flow_${arm}_Output`),
    ]),
  ],
  operations: ["A", "B", "C"].map((arm): SemanticOperation => ({
    ...operationBase(`Task_${arm}`),
    kind: SemanticOperationKind.AwaitUserTask,
    input: `place:Flow_${arm}_Input`,
    output: `place:Flow_${arm}_Output`,
    task: { elementId: `Task_${arm}`, name: `Task ${arm}` },
  })),
});

const owner = rootScopeOccurrence(
  threeTaskProgram.processId,
  "Instance_InternalCommutationFinal",
);

const threeTaskFrontier: RuntimeState = {
  ...initialState,
  control: {
    kind: ControlStateKind.Running,
    instanceId: owner.processInstanceId,
  },
  scopeOccurrences: [{ id: owner, parent: null }],
  controlTokens: ["A", "B", "C"].map((arm) => ({
    placeId: `place:Flow_${arm}_Input`,
    owner,
    multiplicity: 1,
  })),
};

const selectiveConflictProgram = {
  ...threeTaskProgram,
  operations: threeTaskProgram.operations.map((operation) =>
    operation.kind === SemanticOperationKind.AwaitUserTask &&
      operation.task.elementId === "Task_C"
      ? { ...operation, input: "place:Flow_A_Input" }
      : operation
  ),
};

const selectiveConflictFrontier: RuntimeState = {
  ...threeTaskFrontier,
  controlTokens: threeTaskFrontier.controlTokens.filter(({ placeId }) =>
    placeId !== "place:Flow_C_Input"
  ),
};

const threeTaskTraceProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    ...threeTaskProgram.identity,
    semanticProfile: SemanticProfileId.TimerUserTaskComposition,
    sourceId: "internal-commutation-three-task-trace-test",
  },
  processId: "Process_InternalCommutationThreeTaskTrace",
  controlPlaces: [
    ...["A", "B", "C"].flatMap((arm) => [
      controlPlace(`Flow_${arm}_Input`),
      controlPlace(`Flow_${arm}_Output`),
    ]),
    controlPlace("Flow_JoinToEnd"),
    controlPlace("Flow_StartToFork"),
  ],
  operations: [
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToFork",
    },
    {
      ...operationBase("Fork"),
      kind: SemanticOperationKind.Duplicate,
      input: "place:Flow_StartToFork",
      outputs: [
        "place:Flow_A_Input",
        "place:Flow_B_Input",
        "place:Flow_C_Input",
      ],
    },
    ...threeTaskProgram.operations.filter(({ kind }) =>
      kind === SemanticOperationKind.AwaitUserTask
    ),
    {
      ...operationBase("Join"),
      kind: SemanticOperationKind.Synchronize,
      inputs: [
        "place:Flow_A_Output",
        "place:Flow_B_Output",
        "place:Flow_C_Output",
      ],
      output: "place:Flow_JoinToEnd",
    },
    {
      ...operationBase("End"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_JoinToEnd",
    },
  ],
});

test("requires one closed internal scheduling mode", () => {
  assert.equal(isWellFormedSemanticProcessProgram(parallelProgram), true);
  assert.equal(
    isWellFormedSemanticProcessProgram({
      ...parallelProgram,
      internalSchedulingMode: InternalSchedulingMode.RequireChoiceSchedule,
    }),
    true,
  );
  const missing = structuredClone(parallelProgram) as Record<string, unknown>;
  delete missing.internalSchedulingMode;
  assert.equal(isWellFormedSemanticProcessProgram(missing), false);
  assert.equal(
    isWellFormedSemanticProcessProgram({
      ...parallelProgram,
      internalSchedulingMode: "unknown",
    }),
    false,
  );
});

test("closes a complete three-arm pairwise-independent User Task frontier", () => {
  const candidates = enabledOperations(threeTaskProgram, threeTaskFrontier);
  assert.deepEqual(
    candidates.map(({ operation }) => operation.id),
    ["operation:Task_A", "operation:Task_B", "operation:Task_C"],
  );

  const explicitStates = permutations(candidates.map(({ operation }) => operation))
    .map((order) => runOrder(threeTaskProgram, threeTaskFrontier, order));
  assert.equal(explicitStates.length, 6);
  for (const state of explicitStates.slice(1)) {
    assert.deepEqual(state, explicitStates[0]);
  }

  const closed = closeSupportedInternalOperations(
    threeTaskFrontier,
    3,
    (state) => enabledOperations(threeTaskProgram, state),
    (state, enabled) =>
      internalOperationFrontierIsPairwiseIndependent(
        threeTaskProgram,
        state,
        enabled,
      ),
  );

  assert.equal(closed.ambiguousInternalChoice, false);
  assert.equal(closed.hitBound, false);
  assert.deepEqual(
    closed.steps.map(({ operation }) => operation.id),
    ["operation:Task_A", "operation:Task_B", "operation:Task_C"],
  );
  assert.deepEqual(closed.state, explicitStates[0]);
});

test("rejects a later conflict after an independent canonical prefix", () => {
  const candidates = enabledOperations(
    selectiveConflictProgram,
    selectiveConflictFrontier,
  );
  assert.deepEqual(
    candidates.map(({ operation }) => operation.id),
    ["operation:Task_A", "operation:Task_B", "operation:Task_C"],
  );
  assert.equal(
    internalOperationFrontierIsPairwiseIndependent(
      selectiveConflictProgram,
      selectiveConflictFrontier,
      candidates.slice(0, 2),
    ),
    true,
  );
  assert.equal(
    internalOperationFrontierIsPairwiseIndependent(
      selectiveConflictProgram,
      selectiveConflictFrontier,
      candidates,
    ),
    false,
  );

  const closed = closeSupportedInternalOperations(
    selectiveConflictFrontier,
    3,
    (state) => enabledOperations(selectiveConflictProgram, state),
    (state, enabled) =>
      internalOperationFrontierIsPairwiseIndependent(
        selectiveConflictProgram,
        state,
        enabled,
      ),
  );

  assert.equal(closed.ambiguousInternalChoice, true);
  assert.equal(closed.hitBound, false);
  assert.deepEqual(closed.state, selectiveConflictFrontier);
  assert.deepEqual(closed.steps, []);
  assert.deepEqual(closed.batches, []);
});

test("publishes a three-arm batch canonically under Program permutation", () => {
  assert.equal(isWellFormedSemanticProcessProgram(threeTaskTraceProgram), true);
  const start = {
    kind: StimulusKind.StartProcess,
    commandId: "start-three-task-trace",
    processId: threeTaskTraceProgram.processId,
    instanceId: "Instance_InternalCommutationThreeTaskTrace",
    initialVariables: [],
  } as const;
  assert.equal(
    supportsSemanticProcessExecution(start, threeTaskTraceProgram),
    false,
  );
  const canonical = applyStimulusWithTrace(
    threeTaskTraceProgram,
    initialState,
    start,
  );
  const reversed = applyStimulusWithTrace(
    {
      ...threeTaskTraceProgram,
      operations: [...threeTaskTraceProgram.operations].reverse(),
    },
    initialState,
    start,
  );

  assert.deepEqual(reversed.committedTransitions, canonical.committedTransitions);
  assert.deepEqual(
    reversed.flowNodeOccurrenceLifecycles,
    canonical.flowNodeOccurrenceLifecycles,
  );
  const taskTransitionIndexes = canonical.committedTransitions.flatMap(
    (record, index) =>
      record.transition.kind === SemanticTransitionKind.InternalOperation &&
        record.transition.operationKind === SemanticOperationKind.AwaitUserTask
        ? [index]
        : [],
  );
  assert.deepEqual(
    taskTransitionIndexes.map((index) =>
      canonical.committedTransitions[index]?.transition.kind ===
          SemanticTransitionKind.InternalOperation
        ? canonical.committedTransitions[index]?.transition.operationId
        : null
    ),
    ["operation:Task_A", "operation:Task_B", "operation:Task_C"],
  );
  assert.deepEqual(
    taskTransitionIndexes.map((index) =>
      canonical.flowNodeOccurrenceLifecycles[index]?.started[0]?.elementId
    ),
    ["Task_A", "Task_B", "Task_C"],
  );
});

function runOrder(
  program: typeof threeTaskProgram,
  state: RuntimeState,
  operations: ReadonlyArray<SemanticOperation>,
): RuntimeState {
  return operations.reduce((current, operation) => {
    const step = applyInternalOperationStep(
      program,
      operation,
      current,
    );
    assert.ok(step !== null);
    return step.successor;
  }, state);
}

function permutations<Value>(values: ReadonlyArray<Value>): Value[][] {
  if (values.length === 0) {
    return [[]];
  }
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)])
      .map((suffix) => [value, ...suffix])
  );
}
