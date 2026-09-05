/**
 * One composed Activity data lifetime whose required input gates entry and whose required output
 * gates completion. The hand-built program keeps this pure-core lane independent of source parsing.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_DATA_INPUT_OUTPUT_CHECKPOINT_PROFILE_ID,
  CommandOutcome,
  LocalDataOwnerKind,
  ProcessStatus,
  RuntimeStateDefect,
  RuntimeStateRegression,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  initialState,
  isWellFormedSemanticProcessProgram,
  observeStableState,
  runtimeStateDefects,
  runtimeStateRegressions,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  StartProcessStimulus,
  VariableBinding,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram, rootScopeOccurrence } from "./root-scope-fixture.ts";

type ActivityDataInputOutputRuntimeModule =
  typeof import("../src/semantic-process-activity-data-input-output-runtime.ts");

const runtimeModule = await import(
  new URL(
    "../dist/semantic-process-activity-data-input-output-runtime.js",
    import.meta.url,
  ).href
) as ActivityDataInputOutputRuntimeModule;
const { armDataInputOutputUserTask } = runtimeModule;

const instanceId = "ActivityDataInputOutputInstance_1";
const processId = "Process_ActivityDataInputOutputApproval";
const taskElementId = "UserTask_Approve";
const sourcePropertyId = "Property_Application";
const targetDataInputId = "DataInput_Application";
const sourceDataOutputId = "DataOutput_Decision";
const targetPropertyId = "Property_Decision";

const program = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: ACTIVITY_DATA_INPUT_OUTPUT_CHECKPOINT_PROFILE_ID,
    sourceId: "activity-data-input-output-user-task",
    sourceOverlay: null,
    sourceSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  },
  processId,
  controlPlaces: [
    controlPlace("Flow_Approve_End"),
    controlPlace("Flow_Start_Approve"),
  ],
  operations: [
    {
      ...operationBase("StartEvent_Application"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start_Approve",
    },
    {
      ...operationBase(taskElementId),
      kind: SemanticOperationKind.AwaitDataInputOutputUserTask,
      input: "place:Flow_Start_Approve",
      output: "place:Flow_Approve_End",
      task: { elementId: taskElementId, name: "Approve application" },
      directInput: {
        associationId: "DataInputAssociation_Application",
        sourcePropertyId,
        targetDataInputId,
        targetDataInputName: "Application",
      },
      directOutput: {
        associationId: "DataOutputAssociation_Decision",
        sourceDataOutputId,
        sourceDataOutputName: "Decision",
        targetPropertyId,
      },
    },
    {
      ...operationBase("EndEvent_Approved"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Approve_End",
    },
  ],
});

const owner = rootScopeOccurrence(processId, instanceId);
const taskId = {
  processInstanceId: instanceId,
  elementId: taskElementId,
  activation: 1,
} as const;
const activityId = {
  processInstanceId: instanceId,
  activityElementId: taskElementId,
  activation: 1,
} as const;
const selectedOperation = program.operations.find(
  (candidate) => candidate.kind === SemanticOperationKind.AwaitDataInputOutputUserTask,
);
assert.ok(selectedOperation?.kind === SemanticOperationKind.AwaitDataInputOutputUserTask);
const operation = selectedOperation;
const inputDisplayName = operation.directInput.targetDataInputName;
assert.ok(inputDisplayName !== null);

function start(
  commandId: string,
  initialVariables: ReadonlyArray<VariableBinding>,
): StartProcessStimulus {
  return { kind: StimulusKind.StartProcess, commandId, processId, instanceId, initialVariables };
}

function complete(
  commandId: string,
  submittedValues: CompleteUserTaskInstanceStimulus["submittedValues"],
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId,
    submittedValues,
  };
}

const application = {
  name: sourcePropertyId,
  value: { kind: VariableValueKind.String, value: "application-4711" },
} as const;
const unrelated = {
  name: "Property_Unrelated",
  value: { kind: VariableValueKind.String, value: "preserved" },
} as const;
const approve = complete("approve", [{
  name: sourceDataOutputId,
  value: { kind: VariableValueKind.String, value: "approved" },
}]);

function committed(
  state: RuntimeState,
  stimulus: Parameters<typeof applyStimulus>[2],
): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

function startedWithApplication(): RuntimeState {
  const ready = committed(initialState, start("start-ready-for-injected-bindings", []));
  const active = armDataInputOutputUserTask(operation, {
    ...ready,
    variables: {
      ...ready.variables,
      process: { bindings: [application, unrelated] },
    },
  }, owner);
  assert.ok(active !== null);
  return active;
}

test("Process start admits only absence or the declared input Property with String or null", () => {
  for (const initialVariables of [
    [],
    [application],
    [{ name: sourcePropertyId, value: { kind: VariableValueKind.Null } }],
  ] as const) {
    const active = committed(initialState, start("start-admitted", initialVariables));
    assert.deepEqual(active.variables.process.bindings, initialVariables);
    assert.equal(active.userTaskWaits.length, initialVariables.length);
  }
});

for (const [label, initialVariables] of [
  ["output Property", [{ ...application, name: targetPropertyId }]],
  ["input and unrelated Property", [application, unrelated]],
  ["input item", [{ ...application, name: targetDataInputId }]],
  ["output item", [{ ...application, name: sourceDataOutputId }]],
  ["unrelated Property", [unrelated]],
  ["input display name", [{ ...application, name: inputDisplayName }]],
  ["duplicate input Property", [application, { ...application }]],
  ["input and output Properties", [application, { ...application, name: targetPropertyId }]],
] as const) {
  test(`Process start refuses ${label} with the entire received state unchanged`, () => {
    const before = structuredClone(initialState);
    const result = applyStimulus(program, before, start(`start-${label}`, initialVariables));
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(result.state, initialState);
    assert.deepEqual(before, initialState);
  });
}

test("Process start derives the input Property from the sole declaration", () => {
  const renamedSourcePropertyId = "Property_RenamedInput";
  const renamed = {
    ...program,
    operations: program.operations.map((candidate) =>
      candidate.kind === SemanticOperationKind.AwaitDataInputOutputUserTask
        ? {
            ...candidate,
            directInput: { ...candidate.directInput, sourcePropertyId: renamedSourcePropertyId },
          }
        : candidate
    ),
  };
  const admitted = applyStimulus(renamed, initialState, start("renamed-input", [{
    ...application,
    name: renamedSourcePropertyId,
  }]));
  assert.equal(admitted.outcome, CommandOutcome.Committed);
  assert.equal(admitted.state.userTaskWaits.length, 1);
  const refused = applyStimulus(renamed, initialState, start("stale-input-name", [application]));
  assert.equal(refused.outcome, CommandOutcome.Rejected);
  assert.deepEqual(refused.state, initialState);
});

test("Process start refuses missing or multiple composed declarations before state creation", () => {
  for (const operations of [
    program.operations.filter((candidate) =>
      candidate.kind !== SemanticOperationKind.AwaitDataInputOutputUserTask
    ),
    [...program.operations, operation],
  ]) {
    for (const bindings of [[], [application]]) {
      const result = applyStimulus({ ...program, operations }, initialState,
        start("invalid-declaration-count", bindings));
      assert.equal(result.outcome, CommandOutcome.Rejected);
      assert.deepEqual(result.state, initialState);
    }
  }
});

test("unsupported input values cannot start or arm a ready Activity", () => {
  const ready = committed(initialState, start("start-ready-for-invalid-value", []));
  for (const value of [
    { kind: VariableValueKind.Boolean, value: true },
    { kind: VariableValueKind.Integer, value: 7 },
    { kind: VariableValueKind.StringList, value: ["application-4711"] },
  ] as const) {
    const binding = { name: sourcePropertyId, value };
    const rejected = applyStimulus(program, initialState, start("unsupported-start-value", [binding]));
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, initialState);
    const contaminated: RuntimeState = {
      ...ready,
      variables: { ...ready.variables, process: { bindings: [binding, unrelated] } },
    };
    const before = structuredClone(contaminated);
    assert.equal(armDataInputOutputUserTask(operation, contaminated, owner), null);
    assert.deepEqual(contaminated, before);
  }
});

test("the required input gates one Activity lifetime and copies only the selected binding", () => {
  const absent = committed(initialState, start("start-without-application", []));
  assert.deepEqual(absent.userTaskWaits, []);
  assert.deepEqual(absent.activityOccurrences, []);
  assert.deepEqual(absent.variables.activities, []);
  assert.deepEqual(absent.controlTokens.map(({ placeId }) => placeId), [
    "place:Flow_Start_Approve",
  ]);

  const active = startedWithApplication();
  assert.deepEqual(active.userTaskWaits.map(({ id }) => id), [taskId]);
  assert.deepEqual(active.activityOccurrences.map(({ id }) => id), [activityId]);
  assert.deepEqual(active.variables.activities, [{
    owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: activityId },
    bindings: [{ name: targetDataInputId, value: application.value }],
  }]);
  assert.notStrictEqual(
    active.variables.activities[0]?.bindings[0]?.value,
    active.variables.process.bindings[0]?.value,
    "the Activity owns a cloned value rather than an alias into Process scope",
  );
  assert.deepEqual(active.variables.process.bindings, [application, unrelated]);
  assert.equal(
    runtimeStateDefects(program, instanceId, active).includes(
      RuntimeStateDefect.DuplicateActivityBodyClaim,
    ),
    false,
    "composed data arming inserts a disjoint Activity body claim",
  );
  assert.equal(
    runtimeStateRegressions(initialState, active).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
    "the composed data evaluator issues above the predecessor Activity mark",
  );
  assert.deepEqual(observeStableState(program, active)?.openUserTasks, [{
    id: taskId,
    name: "Approve application",
    state: "active",
    inputs: [{ name: targetDataInputId, value: application.value }],
  }]);
});

test("explicit null remains distinct from an unavailable input and routes as an explicit output", () => {
  const active = committed(initialState, start("start-with-null", [{
    name: sourcePropertyId,
    value: { kind: VariableValueKind.Null },
  }]));
  assert.deepEqual(active.variables.activities[0]?.bindings, [{
    name: targetDataInputId,
    value: { kind: VariableValueKind.Null },
  }]);

  const completed = committed(active, complete("complete-with-null", [{
    name: sourceDataOutputId,
    value: { kind: VariableValueKind.Null },
  }]));
  assert.deepEqual(completed.variables.process.bindings, [
    { name: sourcePropertyId, value: { kind: VariableValueKind.Null } },
    { name: targetPropertyId, value: { kind: VariableValueKind.Null } },
  ]);
});

test("duplicate Process sources disable arming without changing the received state", () => {
  const ready = committed(initialState, start("start-ready", []));
  const duplicateSource: RuntimeState = {
    ...ready,
    variables: {
      ...ready.variables,
      process: { bindings: [application, { ...application }] },
    },
  };

  assert.equal(armDataInputOutputUserTask(operation, duplicateSource, owner), null);
  assert.deepEqual(duplicateSource.variables.process.bindings, [application, application]);
});

test("completion routes by the association and atomically disposes the same Activity lifetime", () => {
  const active = startedWithApplication();
  const completed = committed(active, approve);

  assert.deepEqual(completed.userTaskWaits, []);
  assert.deepEqual(completed.activityOccurrences, []);
  assert.deepEqual(completed.variables.activities, []);
  assert.deepEqual(completed.variables.process.bindings, [
    application,
    { name: targetPropertyId, value: approve.submittedValues[0]?.value },
    unrelated,
  ]);
  assert.equal(
    completed.variables.process.bindings.some(({ name }) => name === sourceDataOutputId),
    false,
  );
  assert.equal(
    runtimeStateRegressions(active, completed).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
  );
  assert.equal(observeStableState(program, completed)?.status, ProcessStatus.Completed);
});

test("the exact required DataOutput name and cardinality gate completion", () => {
  const active = startedWithApplication();
  const refused = [
    complete("missing-output", []),
    complete("wrong-output", [{
      name: targetPropertyId,
      value: { kind: VariableValueKind.String, value: "approved" },
    }]),
    complete("extra-output", [
      ...approve.submittedValues,
      { name: "DataOutput_Unadmitted", value: { kind: VariableValueKind.Null } },
    ]),
  ];

  for (const stimulus of refused) {
    const result = applyStimulus(program, active, stimulus);
    assert.equal(result.outcome, CommandOutcome.Rejected, stimulus.commandId);
    assert.deepEqual(result.state, active, stimulus.commandId);
  }
});

// The global state predicate deliberately does not own Activity-local scope cardinality. This local
// join must therefore reject two scopes instead of selecting or partially removing one.
test("a duplicate Activity-local owner refuses completion with the complete state unchanged", () => {
  const active = startedWithApplication();
  const scope = active.variables.activities[0];
  assert.ok(scope !== undefined);
  const contaminated: RuntimeState = {
    ...active,
    variables: {
      ...active.variables,
      activities: [scope, { ...scope, bindings: [...scope.bindings] }],
    },
  };

  const result = applyStimulus(program, contaminated, approve);
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, contaminated);
});

test("a malformed local copy refuses completion with the complete state unchanged", () => {
  const active = startedWithApplication();
  const scope = active.variables.activities[0];
  assert.ok(scope !== undefined);
  const contaminated: RuntimeState = {
    ...active,
    variables: {
      ...active.variables,
      activities: [{
        ...scope,
        bindings: [
          ...scope.bindings,
          { name: "DataInput_Unadmitted", value: { kind: VariableValueKind.Null } },
        ],
      }],
    },
  };

  const result = applyStimulus(program, contaminated, approve);
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, contaminated);
});

test("wrong and stale task identities refuse without changing committed state", () => {
  const active = startedWithApplication();
  const wrong = applyStimulus(program, active, {
    ...approve,
    commandId: "wrong-activation",
    taskId: { ...taskId, activation: 2 },
  });
  assert.equal(wrong.outcome, CommandOutcome.Rejected);
  assert.deepEqual(wrong.state, active);

  const completed = committed(active, approve);
  const stale = applyStimulus(program, completed, { ...approve, commandId: "stale" });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, completed);
});

test("a second composed declarer cannot fall through to ordinary completion", () => {
  const active = startedWithApplication();
  const duplicateDeclaration = {
    ...program,
    operations: [...program.operations, operation],
  };

  const result = applyStimulus(duplicateDeclaration, active, approve);
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, active);
});

test("cross-half association identity reuse is inadmissible", () => {
  const collision = {
    ...program,
    operations: program.operations.map((candidate) =>
      candidate.kind === SemanticOperationKind.AwaitDataInputOutputUserTask
        ? {
            ...candidate,
            directOutput: {
              ...candidate.directOutput,
              associationId: candidate.directInput.associationId,
            },
          }
        : candidate
    ),
  };

  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(isWellFormedSemanticProcessProgram(collision), false);
});
