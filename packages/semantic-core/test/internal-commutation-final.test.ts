import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
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
  compareCanonicalStrings,
  initialState,
  enabledInternalOperationCount,
  isWellFormedSemanticProcessProgram,
  projectCurrentControlPositions,
  projectOpenFlowNodeOccurrences,
  runtimeStateDefects,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticOperation,
} from "@bpmn-lean/semantic-core";

import {
  closeSupportedInternalOperations,
  applyPreparedArmingStep,
  prepareInternalArmingBatch,
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
const { classifyPreparedInternalFrontier, InternalFrontierDisposition } = await import(
  new URL("../dist/internal-transition-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-preparation.ts");
const { deriveInternalTransitionPreparation, PreparedInternalTransitionFamily,
  applyPreparedInternalTransition, preparedInternalTransitionsAreIndependent } = await import(
  new URL("../dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../src/internal-transition-batch.ts");
const { deriveInternalExclusiveMergePreparations } = await import(
  new URL("../dist/internal-transition-merge-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-merge-preparation.ts");

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

const mergeChoiceProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: { ...threeTaskProgram.identity, semanticProfile: SemanticProfileId.UserTaskCycle,
    sourceId: "exact-merge-frontier" },
  processId: "Process_ExactMergeFrontier",
  controlPlaces: ["A", "B", "Fork", "Output"].map(controlPlace),
  operations: [
    { ...operationBase("Start"), kind: SemanticOperationKind.Initiate, output: "place:Fork" },
    { ...operationBase("Fork"), kind: SemanticOperationKind.Duplicate,
      input: "place:Fork", outputs: ["place:A", "place:B"] },
    { ...operationBase("Merge"), kind: SemanticOperationKind.MergeExclusive,
      inputs: ["place:A", "place:B"], output: "place:Output" },
    { ...operationBase("End"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:Output" },
  ],
});

const mergeChoiceOwner = rootScopeOccurrence(mergeChoiceProgram.processId, "Instance_ExactMergeFrontier");
const mergeChoiceState: RuntimeState = {
  ...initialState,
  control: { kind: ControlStateKind.Running, instanceId: mergeChoiceOwner.processInstanceId },
  scopeOccurrences: [{ id: mergeChoiceOwner, parent: null }],
  scopeActivations: [{ elementId: mergeChoiceProgram.processId, count: 1 }],
  controlTokens: ["place:A", "place:B"].map((placeId) =>
    ({ placeId, owner: mergeChoiceOwner, multiplicity: 1 })),
};

test("counts both exact Merge alternatives even when its unique-offer evaluator is disabled", () => {
  assert.equal(isWellFormedSemanticProcessProgram(mergeChoiceProgram), true);
  assert.deepEqual(runtimeStateDefects(mergeChoiceProgram, mergeChoiceOwner.processInstanceId, mergeChoiceState), []);
  assert.notEqual(projectCurrentControlPositions(mergeChoiceProgram, mergeChoiceState), null);
  assert.notEqual(projectOpenFlowNodeOccurrences(mergeChoiceProgram, mergeChoiceState), null);
  const merge = mergeChoiceProgram.operations.find(({ kind }) => kind === SemanticOperationKind.MergeExclusive)!;
  assert.equal(applyInternalOperationStep(mergeChoiceProgram, merge, mergeChoiceState), null);
  assert.equal(enabledInternalOperationCount(mergeChoiceProgram, mergeChoiceState), 2);
});

test("reject mode rolls back a command reaching multiple Merge alternatives instead of committing false stability", () => {
  const start = { kind: StimulusKind.StartProcess, commandId: "start-exact-merge-frontier",
    processId: mergeChoiceProgram.processId, instanceId: mergeChoiceOwner.processInstanceId,
    initialVariables: [] } as const;
  assert.equal(supportsSemanticProcessExecution(start, mergeChoiceProgram), false);
  for (const operations of [mergeChoiceProgram.operations, [...mergeChoiceProgram.operations].reverse()]) {
    const result = applyStimulusWithTrace({ ...mergeChoiceProgram, operations }, initialState, start, 8);
    assert.equal(result.result.outcome, CommandOutcome.RolledBack);
    assert.equal(result.result.ambiguousInternalChoice, true);
    assert.equal(result.result.internalStepBoundExceeded, false);
    assert.equal(result.result.state, initialState);
    assert.deepEqual(result.committedTransitions, []);
    assert.deepEqual(result.flowNodeOccurrenceLifecycles, []);
  }
});

test("normalization takes only the operation independent of both exact Merge alternatives", () => {
  const program = rootScopedProgram({ ...mergeChoiceProgram,
    controlPlaces: [...mergeChoiceProgram.controlPlaces, ...["SideInput", "SideOutput"].map(controlPlace)]
      .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    operations: [...mergeChoiceProgram.operations.map((operation) => operation.kind === SemanticOperationKind.Duplicate
      ? { ...operation, outputs: [...operation.outputs, "place:SideInput"] } : operation),
      { ...operationBase("Side"), kind: SemanticOperationKind.AwaitUserTask,
        input: "place:SideInput", output: "place:SideOutput", task: { elementId: "Side", name: null } },
      { ...operationBase("SideEnd"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:SideOutput" }],
  });
  const state: RuntimeState = { ...mergeChoiceState,
    controlTokens: [...mergeChoiceState.controlTokens,
      { placeId: "place:SideInput", owner: mergeChoiceOwner, multiplicity: 1 }],
  };
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.deepEqual(runtimeStateDefects(program, mergeChoiceOwner.processInstanceId, state), []);
  const merge = program.operations.find(({ kind }) => kind === SemanticOperationKind.MergeExclusive)!;
  assert.ok(merge.kind === SemanticOperationKind.MergeExclusive);
  const offers = deriveInternalExclusiveMergePreparations(program, state, merge);
  assert.ok(offers !== null && offers.length === 2);
  const side = program.operations.find(({ id }) => id === "operation:Side")!;
  const sidePrepared = deriveInternalTransitionPreparation(program, state, { operation: side, owner: mergeChoiceOwner });
  assert.ok(sidePrepared !== null);
  const members = [...offers.map((offer) => ({ ...offer, family: PreparedInternalTransitionFamily.MergeInput } as const)),
    sidePrepared];
  for (const order of permutations(members)) {
    assert.deepEqual(classifyPreparedInternalFrontier(order),
      { kind: InternalFrontierDisposition.IndependentBatch, members: [sidePrepared] });
  }
  const after = applyPreparedInternalTransition(program, state, sidePrepared);
  assert.ok(after !== null);
  assert.deepEqual(deriveInternalExclusiveMergePreparations(program, after, merge), offers);
  assert.deepEqual(classifyPreparedInternalFrontier(members.slice(0, 2)),
    { kind: InternalFrontierDisposition.ObservableChoice, members: members.slice(0, 2) });
  assert.equal(classifyPreparedInternalFrontier([members[0]!, members[0]!]), null);
  assert.deepEqual(classifyPreparedInternalFrontier([]), { kind: InternalFrontierDisposition.Stable });

  assert.ok(side.kind === SemanticOperationKind.AwaitUserTask);
  const competing = { ...side, input: "place:A" };
  const competingProgram = { ...program,
    operations: program.operations.map((operation) => operation.id === side.id ? competing : operation) };
  const competingPrepared = deriveInternalTransitionPreparation(competingProgram, state,
    { operation: competing, owner: mergeChoiceOwner });
  assert.ok(competingPrepared !== null);
  assert.equal(preparedInternalTransitionsAreIndependent(competingPrepared, members[0]!), false);
  assert.equal(preparedInternalTransitionsAreIndependent(competingPrepared, members[1]!), true);
  const competingMembers = [competingPrepared, ...members.slice(0, 2)];
  for (const order of permutations(competingMembers)) {
    assert.deepEqual(classifyPreparedInternalFrontier(order),
      { kind: InternalFrontierDisposition.ObservableChoice, members: competingMembers });
  }
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
    (state, enabled) => prepareInternalArmingBatch(threeTaskProgram, state, enabled),
    (state, prepared) => applyPreparedArmingStep(threeTaskProgram, state, prepared),
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
    (state, enabled) => prepareInternalArmingBatch(selectiveConflictProgram, state, enabled),
    (state, prepared) => applyPreparedArmingStep(selectiveConflictProgram, state, prepared),
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
