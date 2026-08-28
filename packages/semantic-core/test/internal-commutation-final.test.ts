import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ControlStateKind,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  applyInternalOperationStep,
  initialState,
  isWellFormedSemanticProcessProgram,
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
    .map((order) => runOrder(threeTaskFrontier, order));
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

function runOrder(
  state: RuntimeState,
  operations: ReadonlyArray<SemanticOperation>,
): RuntimeState {
  return operations.reduce((current, operation) => {
    const step = applyInternalOperationStep(
      threeTaskProgram,
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
