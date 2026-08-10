/**
 * Semantic Process admission and runtime evidence for one User-Task-crossing cycle.
 *
 * Direct malformed programs keep graph policy independent of checked-source lowering, while direct
 * runtime states discriminate Exclusive Merge from synchronization or arbitrary first-token choice.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CheckedNodeKind,
  CommandOutcome,
  ControlStateKind,
  GatewayDirection,
  SemanticGraphPolicyKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  SimpleBooleanExpressionKind,
  StimulusKind,
  VariableValueKind,
  applyInternalOperation,
  applyStimulus,
  initialState,
  isWellFormedSemanticProcessProgram,
  profileAllowsCheckedProcessShape,
  profileAllowsProgramShape,
  semanticGraphPolicyForProfile,
} from "@bpmn-lean/semantic-core";
import type {
  ControlPlaceTokens,
  MergeExclusiveOperation,
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

const processId = "Process_Cycle";
const instanceId = "Instance_1";
const owner = rootScopeOccurrence(processId, instanceId);
const cycleProgram = makeCycleProgram();

test("selects one shared resumption policy only for the cycle profile", () => {
  assert.deepEqual(
    semanticGraphPolicyForProfile(SemanticProfileId.UserTaskCycle),
    {
      kind: SemanticGraphPolicyKind.ResumptionBounded,
      checkedResumptionNodeKinds: [CheckedNodeKind.UserTask],
      semanticResumptionOperationKinds: [SemanticOperationKind.AwaitUserTask],
    },
  );
  for (const profile of Object.values(SemanticProfileId).filter(
    (profileId) => profileId !== SemanticProfileId.UserTaskCycle,
  )) {
    assert.deepEqual(semanticGraphPolicyForProfile(profile), {
      kind: SemanticGraphPolicyKind.Acyclic,
    });
  }
  assert.equal(semanticGraphPolicyForProfile("unknown-profile"), undefined);
});

test("registers the cycle profile in the immutable product catalog", () => {
  assert.ok(
    Object.values(SemanticProfileId).includes(SemanticProfileId.UserTaskCycle),
  );
  const mutableCatalog = SemanticProfileId as {
    UserTaskCycle: string;
  };
  assert.throws(
    () => mutableCatalog.UserTaskCycle = "mutated-cycle-profile",
    TypeError,
  );
  assert.equal(
    SemanticProfileId.UserTaskCycle,
    "bpmn-2.0.2-user-task-cycle-draft",
  );
});

test("does not expose mutable process-wide graph policy state", () => {
  const policy = semanticGraphPolicyForProfile(
    SemanticProfileId.UserTaskCycle,
  );
  assert.equal(policy?.kind, SemanticGraphPolicyKind.ResumptionBounded);
  if (policy?.kind !== SemanticGraphPolicyKind.ResumptionBounded) {
    throw new TypeError("cycle profile did not select resumption-bounded policy");
  }
  const mutableView = policy as unknown as {
    checkedResumptionNodeKinds: CheckedNodeKind[];
    semanticResumptionOperationKinds: SemanticOperationKind[];
  };

  assert.throws(
    () => mutableView.checkedResumptionNodeKinds.push(CheckedNodeKind.NoneEndEvent),
    TypeError,
  );
  assert.throws(
    () => mutableView.semanticResumptionOperationKinds.push(
      SemanticOperationKind.AwaitTimer,
    ),
    TypeError,
  );
  assert.deepEqual(
    semanticGraphPolicyForProfile(SemanticProfileId.UserTaskCycle),
    {
      kind: SemanticGraphPolicyKind.ResumptionBounded,
      checkedResumptionNodeKinds: [CheckedNodeKind.UserTask],
      semanticResumptionOperationKinds: [SemanticOperationKind.AwaitUserTask],
    },
  );
});

test("pins the exact checked and IL cardinalities", () => {
  assert.equal(profileAllowsCheckedProcessShape(
    SemanticProfileId.UserTaskCycle,
    [
      { kind: CheckedNodeKind.NoneStartEvent, id: "Start" },
      { kind: CheckedNodeKind.ExclusiveMerge, id: "Merge" },
      { kind: CheckedNodeKind.UserTask, id: "Task", name: null },
      {
        kind: CheckedNodeKind.ExclusiveGateway,
        id: "Choice",
        direction: GatewayDirection.Diverging,
        candidateFlowIds: ["Repeat", "Rework"],
        defaultFlowId: "Exit",
      },
      { kind: CheckedNodeKind.NoneEndEvent, id: "End" },
    ],
    1,
  ), true);
  assert.equal(profileAllowsProgramShape(
    SemanticProfileId.UserTaskCycle,
    cycleProgram.operations,
    cycleProgram.definitionScopes.length,
  ), true);
});

test("admits the wait-cut cycle while preserving full-graph progress", () => {
  assert.equal(isWellFormedSemanticProcessProgram(cycleProgram), true);
});

test("the same wait-crossing cycle remains forbidden to an old profile", () => {
  assert.equal(isWellFormedSemanticProcessProgram({
    ...cycleProgram,
    identity: {
      ...cycleProgram.identity,
      semanticProfile: SemanticProfileId.UserTask,
    },
  }), false);
});

test("rejects an internal cycle that remains after the User Task cut", () => {
  assert.equal(
    isWellFormedSemanticProcessProgram(makeInternalCycleProgram()),
    false,
  );
});

test("requires the closed canonical shape of every merge operation", () => {
  const merge = mergeOperation(cycleProgram);
  const malformed = [
    { ...merge, diagnostic: true },
    { ...merge, inputs: [...merge.inputs].reverse() },
    { ...merge, inputs: [merge.inputs[0], merge.inputs[0], merge.inputs[2]] },
    { ...merge, inputs: [merge.inputs[0], merge.inputs[1], merge.output] },
    { ...merge, inputs: [merge.inputs[0], merge.inputs[1], "place:Missing"] },
  ];

  for (const operation of malformed) {
    assert.equal(
      isWellFormedSemanticProcessProgram(withMerge(cycleProgram, operation)),
      false,
    );
  }
});

test("generic merge admission rejects an empty input collection", () => {
  const merge = mergeOperation(cycleProgram);
  assert.equal(
    isWellFormedSemanticProcessProgram(withMerge(cycleProgram, {
      ...merge,
      inputs: [],
    })),
    false,
  );
});

test("generic admission accepts four merge inputs while the selected profile rejects them", () => {
  const program = makeFourInputMergeProgram();
  const merge = mergeOperation(cycleProgram);
  const selectedShapeWithFourInputs = cycleProgram.operations.map((operation) =>
    operation.kind === SemanticOperationKind.MergeExclusive
      ? {
          ...merge,
          inputs: [...merge.inputs, "place:Flow_Unreachable"],
        } satisfies MergeExclusiveOperation
      : operation
  );

  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(profileAllowsProgramShape(
    SemanticProfileId.UserTaskCycle,
    program.operations,
    program.definitionScopes.length,
  ), false);
  assert.equal(profileAllowsProgramShape(
    SemanticProfileId.UserTaskCycle,
    selectedShapeWithFourInputs,
    cycleProgram.definitionScopes.length,
  ), false);
});

test("the unique-offer evaluator has no successor at zero or excess multiplicity", () => {
  const merge = mergeOperation(cycleProgram);
  const cases: ReadonlyArray<ReadonlyArray<ControlPlaceTokens>> = [
    [],
    [token("place:Flow_Repeat", 1), token("place:Flow_Rework", 1)],
    [token("place:Flow_Repeat", 2)],
  ];

  for (const tokens of cases) {
    assert.equal(
      applyInternalOperation(cycleProgram, merge, runningState(tokens)),
      null,
    );
  }
});

test("merge preserves the only token owner and every unrelated state field", () => {
  const merge = mergeOperation(cycleProgram);
  const before: RuntimeState = {
    ...runningState([
      token("place:Flow_Rework", 1),
      token("place:Unrelated", 3),
    ]),
    logicalTimeMs: 37,
    taskActivations: [{ elementId: "EarlierTask", count: 4 }],
    variables: {
      process: {
        bindings: [{
          name: "kept",
          value: { kind: VariableValueKind.String, value: "yes" },
        }],
      },
      activities: [],
    },
  };

  const merged = applyInternalOperation(cycleProgram, merge, before);

  assert.deepEqual(merged, {
    ...before,
    controlTokens: [
      token("place:Flow_MergeToTask", 1),
      token("place:Unrelated", 3),
    ],
  });
});

test("choice exposes the exact selected back-edge before merge", () => {
  const choose = operation(cycleProgram, SemanticOperationKind.Choose);
  for (const route of ["repeat", "rework"] as const) {
    const state: RuntimeState = {
      ...runningState([token("place:Flow_TaskToChoice", 1)]),
      variables: {
        process: {
          bindings: [{
            name: "route",
            value: { kind: VariableValueKind.String, value: route },
          }],
        },
        activities: [],
      },
    };

    assert.deepEqual(
      applyInternalOperation(cycleProgram, choose, state)?.controlTokens,
      [token(
        route === "repeat" ? "place:Flow_Repeat" : "place:Flow_Rework",
        1,
      )],
    );
  }
});

test("start, both repeats, and default exit close in three internal steps", () => {
  const start = applyStimulus(cycleProgram, initialState, startStimulus(), 3);
  assert.equal(start.outcome, CommandOutcome.Committed);
  assert.equal(start.internalStepBoundExceeded, false);
  assert.equal(start.state.userTaskWaits[0]?.id.activation, 1);

  const repeat = applyStimulus(
    cycleProgram,
    start.state,
    completionStimulus(1, "repeat"),
    3,
  );
  assert.equal(repeat.internalStepBoundExceeded, false);
  assert.equal(repeat.state.userTaskWaits[0]?.id.activation, 2);

  const rework = applyStimulus(
    cycleProgram,
    repeat.state,
    completionStimulus(2, "rework"),
    3,
  );
  assert.equal(rework.internalStepBoundExceeded, false);
  assert.equal(rework.state.userTaskWaits[0]?.id.activation, 3);

  const exited = applyStimulus(
    cycleProgram,
    rework.state,
    completionStimulus(3, "exit"),
    3,
  );
  assert.equal(exited.internalStepBoundExceeded, false);
  assert.deepEqual(exited.state.control, {
    kind: ControlStateKind.Completed,
    instanceId,
  });
  assert.equal(exited.state.endOccurrences, 1);
  assert.deepEqual(exited.state.controlTokens, []);
  assert.deepEqual(exited.state.userTaskWaits, []);
});

test("closure limit two fails at start, repeat, and exit boundaries", () => {
  const start = applyStimulus(cycleProgram, initialState, startStimulus(), 2);
  assert.equal(start.internalStepBoundExceeded, true);

  const stableStart = applyStimulus(
    cycleProgram,
    initialState,
    startStimulus(),
    3,
  );
  const repeat = applyStimulus(
    cycleProgram,
    stableStart.state,
    completionStimulus(1, "repeat"),
    2,
  );
  assert.equal(repeat.internalStepBoundExceeded, true);

  const stableRepeat = applyStimulus(
    cycleProgram,
    stableStart.state,
    completionStimulus(1, "repeat"),
    3,
  );
  const exit = applyStimulus(
    cycleProgram,
    stableRepeat.state,
    completionStimulus(2, "exit"),
    2,
  );
  assert.equal(exit.internalStepBoundExceeded, true);
});

function makeCycleProgram(): SemanticProcessProgram {
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: SemanticProfileId.UserTaskCycle,
      sourceId: "cyclic-control-flow",
      sourceOverlay: null,
      sourceSha256: "c".repeat(64),
    },
    processId,
    controlPlaces: [
      "Flow_Exit",
      "Flow_MergeToTask",
      "Flow_Repeat",
      "Flow_Rework",
      "Flow_StartToMerge",
      "Flow_TaskToChoice",
    ].map(controlPlace),
    operations: cycleOperations({
      startOutput: "place:Flow_StartToMerge",
      taskInput: "place:Flow_MergeToTask",
      taskOutput: "place:Flow_TaskToChoice",
      mergeInputs: [
        "place:Flow_Repeat",
        "place:Flow_Rework",
        "place:Flow_StartToMerge",
      ],
      mergeOutput: "place:Flow_MergeToTask",
      choiceInput: "place:Flow_TaskToChoice",
    }),
  });
}

function makeInternalCycleProgram(): SemanticProcessProgram {
  return rootScopedProgram({
    ...cycleProgram,
    controlPlaces: [
      "Flow_Exit",
      "Flow_MergeToChoice",
      "Flow_Repeat",
      "Flow_Rework",
      "Flow_StartToTask",
      "Flow_TaskToMerge",
    ].map(controlPlace),
    operations: cycleOperations({
      startOutput: "place:Flow_StartToTask",
      taskInput: "place:Flow_StartToTask",
      taskOutput: "place:Flow_TaskToMerge",
      mergeInputs: [
        "place:Flow_Repeat",
        "place:Flow_Rework",
        "place:Flow_TaskToMerge",
      ],
      mergeOutput: "place:Flow_MergeToChoice",
      choiceInput: "place:Flow_MergeToChoice",
    }),
  });
}

function makeFourInputMergeProgram(): SemanticProcessProgram {
  const branchPlaces = [
    "place:Flow_Branch_1",
    "place:Flow_Branch_2",
    "place:Flow_Branch_3",
    "place:Flow_Branch_4",
  ] as const;
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: SemanticProfileId.UserTaskCycle,
      sourceId: "four-input-exclusive-merge",
      sourceOverlay: null,
      sourceSha256: "4".repeat(64),
    },
    processId: "Process_FourInputMerge",
    controlPlaces: [
      "Flow_Branch_1",
      "Flow_Branch_2",
      "Flow_Branch_3",
      "Flow_Branch_4",
      "Flow_Fork",
      "Flow_MergeToEnd",
    ].map(controlPlace),
    operations: [
      {
        ...operationBase("Start"),
        kind: SemanticOperationKind.Initiate,
        output: "place:Flow_Fork",
      },
      {
        ...operationBase("Fork"),
        kind: SemanticOperationKind.Duplicate,
        input: "place:Flow_Fork",
        outputs: branchPlaces,
      },
      {
        ...operationBase("Merge"),
        kind: SemanticOperationKind.MergeExclusive,
        inputs: branchPlaces,
        output: "place:Flow_MergeToEnd",
      },
      {
        ...operationBase("End"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:Flow_MergeToEnd",
      },
    ],
  });
}

type CycleConnections = Readonly<{
  startOutput: string;
  taskInput: string;
  taskOutput: string;
  mergeInputs: [string, string, string];
  mergeOutput: string;
  choiceInput: string;
}>;

function cycleOperations(
  connections: CycleConnections,
): ReadonlyArray<SemanticOperation> {
  return [
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: connections.startOutput,
    },
    {
      ...operationBase("Merge"),
      kind: SemanticOperationKind.MergeExclusive,
      inputs: connections.mergeInputs,
      output: connections.mergeOutput,
    },
    {
      ...operationBase("Task"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: connections.taskInput,
      output: connections.taskOutput,
      task: { elementId: "Task", name: "Review" },
    },
    {
      ...operationBase("Choice"),
      kind: SemanticOperationKind.Choose,
      input: connections.choiceInput,
      candidates: [
        conditionalCandidate("Flow_Repeat", "repeat"),
        conditionalCandidate("Flow_Rework", "rework"),
      ],
      defaultOutput: "place:Flow_Exit",
      defaultOrigin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "Flow_Exit",
      },
    },
    {
      ...operationBase("End"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Exit",
    },
  ];
}

function conditionalCandidate(elementId: string, value: string) {
  return {
    condition: {
      kind: SimpleBooleanExpressionKind.StringEquals,
      variable: "route",
      value,
    },
    output: `place:${elementId}`,
    origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId },
  } as const;
}

function withMerge(
  program: SemanticProcessProgram,
  replacement: unknown,
): unknown {
  return {
    ...program,
    operations: program.operations.map((candidate) =>
      candidate.kind === SemanticOperationKind.MergeExclusive
        ? replacement
        : candidate
    ),
  };
}

function mergeOperation(program: SemanticProcessProgram): MergeExclusiveOperation {
  return operation(program, SemanticOperationKind.MergeExclusive);
}

function operation<Kind extends SemanticOperationKind>(
  program: SemanticProcessProgram,
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const found = program.operations.find((candidate) => candidate.kind === kind);
  assert.ok(found !== undefined, `program has no ${kind} operation`);
  return found as Extract<SemanticOperation, { kind: Kind }>;
}

function runningState(
  controlTokens: ReadonlyArray<ControlPlaceTokens>,
): RuntimeState {
  return {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId },
    scopeOccurrences: [{ id: owner, parent: null }],
    scopeActivations: [{
      elementId: owner.definitionScopeId,
      count: owner.activation,
    }],
    controlTokens,
  };
}

function token(placeId: string, multiplicity: number): ControlPlaceTokens {
  return { placeId, owner, multiplicity };
}

function startStimulus() {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-cycle",
    processId,
    instanceId,
    initialVariables: [],
  } as const;
}

function completionStimulus(activation: number, route: string) {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${activation}`,
    taskId: { processInstanceId: instanceId, elementId: "Task", activation },
    submittedValues: [{
      name: "route",
      value: { kind: VariableValueKind.String, value: route },
    }],
  } as const;
}
