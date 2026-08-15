import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CheckedNodeKind,
  CommandOutcome,
  ControlStateKind,
  GatewayDirection,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  UserTaskLifecycleState,
  VariableValueKind,
  applyStimulus,
  initialState,
  profileAllowsCheckedProcessShape,
  profileAllowsProgramShape,
  projectOpenUserTasks,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
  UserTaskMetadata,
  VariableBinding,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

const checkpointProfile =
  SemanticProfileId.ParallelUserTaskAssignmentFormMetadata;
const instanceId = "Instance_ParallelReview";
const contentMetadata = metadata("contentApproved");
const riskMetadata = metadata("riskApproved");

const checkpointProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: checkpointProfile,
    sourceId: "parallel-user-task-metadata-composition",
    sourceOverlay: null,
    sourceSha256: "1".repeat(64),
  },
  processId: "Process_ParallelUserTaskMetadata",
  controlPlaces: [
    controlPlace("Flow_ContentToJoin"),
    controlPlace("Flow_ForkToContent"),
    controlPlace("Flow_ForkToRisk"),
    controlPlace("Flow_JoinToEnd"),
    controlPlace("Flow_RiskToJoin"),
    controlPlace("Flow_StartToFork"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_1"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_JoinToEnd",
    },
    {
      ...operationBase("Gateway_Fork"),
      kind: SemanticOperationKind.Duplicate,
      input: "place:Flow_StartToFork",
      outputs: ["place:Flow_ForkToContent", "place:Flow_ForkToRisk"],
    },
    {
      ...operationBase("Gateway_Join"),
      kind: SemanticOperationKind.Synchronize,
      inputs: ["place:Flow_ContentToJoin", "place:Flow_RiskToJoin"],
      output: "place:Flow_JoinToEnd",
    },
    {
      ...operationBase("StartEvent_1"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToFork",
    },
    {
      ...operationBase("UserTask_ContentReview"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_ForkToContent",
      output: "place:Flow_ContentToJoin",
      task: {
        elementId: "UserTask_ContentReview",
        name: "Review content",
        metadata: contentMetadata,
      },
    },
    {
      ...operationBase("UserTask_RiskReview"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_ForkToRisk",
      output: "place:Flow_RiskToJoin",
      task: {
        elementId: "UserTask_RiskReview",
        name: "Review risk",
        metadata: riskMetadata,
      },
    },
  ],
});

const checkedNodes = [
  { kind: CheckedNodeKind.NoneEndEvent, id: "EndEvent_1" },
  {
    kind: CheckedNodeKind.ParallelGateway,
    id: "Gateway_Fork",
    direction: GatewayDirection.Diverging,
  },
  {
    kind: CheckedNodeKind.ParallelGateway,
    id: "Gateway_Join",
    direction: GatewayDirection.Converging,
  },
  { kind: CheckedNodeKind.NoneStartEvent, id: "StartEvent_1" },
  {
    kind: CheckedNodeKind.UserTask,
    id: "UserTask_ContentReview",
    name: "Review content",
    metadata: contentMetadata,
  },
  {
    kind: CheckedNodeKind.UserTask,
    id: "UserTask_RiskReview",
    name: "Review risk",
    metadata: riskMetadata,
  },
] as const satisfies ReadonlyArray<CheckedNode>;

test("registers the exact composition profile for ordinary execution", () => {
  assert.equal(
    new Set<string>(Object.values(SemanticProfileId)).has(checkpointProfile),
    true,
  );
  assert.equal(
    profileAllowsCheckedProcessShape(checkpointProfile, checkedNodes, 1),
    true,
  );
  assert.equal(
    profileAllowsProgramShape(
      checkpointProfile,
      checkpointProgram.operations,
      checkpointProgram.definitionScopes.length,
    ),
    true,
  );
  assert.equal(
    supportsSemanticProcessExecution(start(), checkpointProgram),
    true,
  );

  for (const oldProfile of [
    SemanticProfileId.ParallelForkJoin,
    SemanticProfileId.UserTaskAssignmentFormMetadata,
  ]) {
    assert.equal(
      profileAllowsCheckedProcessShape(oldProfile, checkedNodes, 1),
      false,
      oldProfile,
    );
    assert.equal(
      profileAllowsProgramShape(
        oldProfile,
        checkpointProgram.operations,
        checkpointProgram.definitionScopes.length,
      ),
      false,
      oldProfile,
    );
  }
});

test("requires complete metadata on both exact task identities", () => {
  const missingSiblingMetadata: SemanticProcessProgram = {
    ...checkpointProgram,
    operations: checkpointProgram.operations.map((operation) => {
      if (
        operation.kind !== SemanticOperationKind.AwaitUserTask ||
        operation.task.elementId !== "UserTask_RiskReview"
      ) {
        return operation;
      }
      const { metadata: _metadata, ...task } = operation.task;
      return { ...operation, task };
    }),
  };

  assert.equal(
    profileAllowsProgramShape(
      checkpointProfile,
      missingSiblingMetadata.operations,
      missingSiblingMetadata.definitionScopes.length,
    ),
    false,
  );
});

test("rejects an unbalanced same-cardinality topology in both parallel profiles", () => {
  const unbalancedCheckpoint = unbalancedParallelProgram(checkpointProgram);
  const unbalancedPredecessor = metadataErasedParallelProgram(
    unbalancedCheckpoint,
  );

  assert.equal(
    supportsSemanticProcessExecution(start(), unbalancedCheckpoint),
    false,
    "metadata checkpoint",
  );
  assert.equal(
    supportsSemanticProcessExecution(start(), unbalancedPredecessor),
    false,
    "metadata-free predecessor",
  );
});

test("start publishes two canonically ordered distinct tasks with exact metadata", () => {
  const started = applyStimulus(checkpointProgram, initialState, start());

  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.deepEqual(projectOpenUserTasks(started.state), [
    openTask("UserTask_ContentReview", "Review content", contentMetadata),
    openTask("UserTask_RiskReview", "Review risk", riskMetadata),
  ]);

  const metadataFreeStarted = applyStimulus(
    metadataErasedParallelProgram(),
    initialState,
    start(),
  );
  assert.equal(metadataFreeStarted.outcome, CommandOutcome.Committed);
  assert.deepEqual(
    eraseWaitMetadata(started.state),
    metadataFreeStarted.state,
  );
});

test("wrong completions preserve both waits and stale completion preserves its sibling", () => {
  const waiting = applyStimulus(checkpointProgram, initialState, start()).state;
  for (const taskId of [
    { processInstanceId: instanceId, elementId: "Missing", activation: 1 },
    {
      processInstanceId: instanceId,
      elementId: "UserTask_ContentReview",
      activation: 2,
    },
  ]) {
    const rejected = applyStimulus(checkpointProgram, waiting, {
      ...completion("UserTask_ContentReview", "contentApproved", true),
      commandId: `reject-${taskId.elementId}-${taskId.activation}`,
      taskId,
    });
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, waiting);
  }

  const afterContent = applyStimulus(
    checkpointProgram,
    waiting,
    completion("UserTask_ContentReview", "contentApproved", true),
  );
  assert.equal(afterContent.outcome, CommandOutcome.Committed);
  const stale = applyStimulus(checkpointProgram, afterContent.state, {
    ...completion("UserTask_ContentReview", "contentApproved", false),
    commandId: "stale-content-after-completion",
  });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, afterContent.state);
  assert.deepEqual(projectOpenUserTasks(stale.state), [
    openTask("UserTask_RiskReview", "Review risk", riskMetadata),
  ]);
});

test("exact completion removes only its named wait and preserves sibling metadata", () => {
  const waiting = applyStimulus(checkpointProgram, initialState, start()).state;
  const completed = applyStimulus(
    checkpointProgram,
    waiting,
    completion("UserTask_ContentReview", "contentApproved", true),
  );

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(projectOpenUserTasks(completed.state), [
    openTask("UserTask_RiskReview", "Review risk", riskMetadata),
  ]);
});

test("both disjoint Boolean completion orders reach equal terminal data", () => {
  const contentThenRisk = runCompletions([
    completion("UserTask_ContentReview", "contentApproved", true),
    completion("UserTask_RiskReview", "riskApproved", false),
  ]);
  const riskThenContent = runCompletions([
    completion("UserTask_RiskReview", "riskApproved", false),
    completion("UserTask_ContentReview", "contentApproved", true),
  ]);

  assert.deepEqual(contentThenRisk, riskThenContent);
  assert.deepEqual(contentThenRisk.control, {
    kind: ControlStateKind.Completed,
    instanceId,
  });
  assert.deepEqual(contentThenRisk.variables.process.bindings, [
    booleanBinding("contentApproved", true),
    booleanBinding("riskApproved", false),
  ]);
});

test("retains accepted command order for overlapping completion writes", () => {
  const contentThenRisk = runCompletions([
    completion("UserTask_ContentReview", "decision", true),
    completion("UserTask_RiskReview", "decision", false),
  ]);
  const riskThenContent = runCompletions([
    completion("UserTask_RiskReview", "decision", false),
    completion("UserTask_ContentReview", "decision", true),
  ]);

  assert.deepEqual(contentThenRisk.variables.process.bindings, [
    booleanBinding("decision", false),
  ]);
  assert.deepEqual(riskThenContent.variables.process.bindings, [
    booleanBinding("decision", true),
  ]);
});

test("rejects every nonempty Process Start map and old parallel Boolean completion", () => {
  const nonemptyStarts = [
    [booleanBinding("initial", true)],
    [{
      name: "caseId",
      value: { kind: VariableValueKind.String, value: "CASE-1" },
    }],
    [{ name: "optionalNote", value: { kind: VariableValueKind.Null } }],
  ] as const satisfies ReadonlyArray<ReadonlyArray<VariableBinding>>;
  for (const initialVariables of nonemptyStarts) {
    const rejectedStart = applyStimulus(
      checkpointProgram,
      initialState,
      start(initialVariables),
    );
    assert.equal(rejectedStart.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejectedStart.state, initialState);
  }

  const waiting = applyStimulus(checkpointProgram, initialState, start()).state;
  const oldParallelProgram = {
    ...checkpointProgram,
    identity: {
      ...checkpointProgram.identity,
      semanticProfile: SemanticProfileId.ParallelForkJoin,
    },
  };
  const rejectedCompletion = applyStimulus(
    oldParallelProgram,
    waiting,
    completion("UserTask_ContentReview", "contentApproved", true),
  );
  assert.equal(rejectedCompletion.outcome, CommandOutcome.Rejected);
  assert.deepEqual(rejectedCompletion.state, waiting);
});

function metadata(key: string): UserTaskMetadata {
  return {
    assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
    form: { fields: [{ key, type: "boolean" }] },
  };
}

function start(
  initialVariables: ReadonlyArray<VariableBinding> = [],
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-parallel-review",
    processId: checkpointProgram.processId,
    instanceId,
    initialVariables,
  };
}

function completion(
  elementId: "UserTask_ContentReview" | "UserTask_RiskReview",
  key: string,
  value: boolean,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: { processInstanceId: instanceId, elementId, activation: 1 },
    submittedValues: [booleanBinding(key, value)],
  };
}

function booleanBinding(name: string, value: boolean): VariableBinding {
  return { name, value: { kind: VariableValueKind.Boolean, value } };
}

function openTask(
  elementId: string,
  name: string,
  taskMetadata: UserTaskMetadata,
) {
  return {
    id: { processInstanceId: instanceId, elementId, activation: 1 },
    name,
    state: UserTaskLifecycleState.Active,
    metadata: taskMetadata,
  };
}

function runCompletions(
  completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
): RuntimeState {
  let state = applyStimulus(checkpointProgram, initialState, start()).state;
  for (const stimulus of completions) {
    const result = applyStimulus(checkpointProgram, state, stimulus);
    assert.equal(result.outcome, CommandOutcome.Committed);
    state = result.state;
  }
  return state;
}

function metadataErasedParallelProgram(
  program: SemanticProcessProgram = checkpointProgram,
): SemanticProcessProgram {
  return {
    ...program,
    identity: {
      ...program.identity,
      semanticProfile: SemanticProfileId.ParallelForkJoin,
    },
    operations: program.operations.map((operation) => {
      if (operation.kind !== SemanticOperationKind.AwaitUserTask) {
        return operation;
      }
      const { metadata: _metadata, ...task } = operation.task;
      return { ...operation, task };
    }),
  };
}

function unbalancedParallelProgram(
  program: SemanticProcessProgram,
): SemanticProcessProgram {
  return {
    ...program,
    operations: program.operations.map((operation) => {
      switch (operation.kind) {
        case SemanticOperationKind.Duplicate:
          return {
            ...operation,
            input: "place:Flow_ForkToContent",
            outputs: ["place:Flow_ContentToJoin", "place:Flow_ForkToRisk"],
          };
        case SemanticOperationKind.AwaitUserTask:
          return operation.task.elementId === "UserTask_ContentReview"
            ? {
              ...operation,
              input: "place:Flow_StartToFork",
              output: "place:Flow_ForkToContent",
            }
            : operation;
        default:
          return operation;
      }
    }),
  };
}

function eraseWaitMetadata(state: RuntimeState): RuntimeState {
  return {
    ...state,
    userTaskWaits: state.userTaskWaits.map((wait) => {
      const { metadata: _metadata, ...withoutMetadata } = wait;
      return withoutMetadata;
    }),
  };
}
