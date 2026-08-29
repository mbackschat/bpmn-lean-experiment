import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  InternalSchedulingMode,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyInternalOperation,
  applyStimulus,
  createEffectLocalDataOwner,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  isWellFormedSemanticProcessProgram,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
  UserTaskInstanceId,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";

const processId = "Process_SubProcessErrorPropagationProbe";
const rootScopeId = `scope:${processId}`;
const childScopeId = "scope:SubProcess_Work";
const instanceId = "SubProcessErrorInstance_1";

const program = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile:
      "cibseven-2.2.0-subprocess-error-propagation-draft",
    sourceId: "subprocess-error-propagation-process",
    sourceOverlay: null,
    sourceSha256:
      "f920ed0454a56b6649d0ecaa915a0ab5b3ed4f3bb974fba9c6255039ecb801a2",
  },
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  processId,
  definitionScopes: [
    {
      id: rootScopeId,
      parentScopeId: null,
      originElementId: processId,
    },
    {
      id: childScopeId,
      parentScopeId: rootScopeId,
      originElementId: "SubProcess_Work",
    },
  ],
  operationScopes: ([
    ["operation:EndEvent_Normal", rootScopeId],
    ["operation:EndEvent_Recovered", rootScopeId],
    ["operation:EndEvent_ScopedFailure", childScopeId],
    ["operation:EndEvent_SiblingWork", childScopeId],
    ["operation:Gateway_ChildFork", childScopeId],
    ["operation:StartEvent_Outer", rootScopeId],
    ["operation:SubProcess_Work", rootScopeId],
    ["operation:UserTask_Recover", rootScopeId],
    ["operation:UserTask_SiblingWork", childScopeId],
    ["operation:UserTask_TriggerError", childScopeId],
    [
      "operation:complete-scope:scope:Process_SubProcessErrorPropagationProbe",
      rootScopeId,
    ],
    ["operation:complete-scope:scope:SubProcess_Work", childScopeId],
  ] as const).map(([operationId, scopeId]) => ({ operationId, scopeId })),
  controlPlaceScopes: ([
    ["place:Flow_BoundaryToRecover", rootScopeId],
    ["place:Flow_ChildStartToFork", childScopeId],
    ["place:Flow_ForkToSiblingWork", childScopeId],
    ["place:Flow_ForkToTriggerError", childScopeId],
    ["place:Flow_OuterStartToScope", rootScopeId],
    ["place:Flow_RecoverToRecoveredEnd", rootScopeId],
    ["place:Flow_ScopeToNormalEnd", rootScopeId],
    ["place:Flow_SiblingWorkToNoneEnd", childScopeId],
    ["place:Flow_TriggerErrorToErrorEnd", childScopeId],
  ] as const).map(([controlPlaceId, scopeId]) => ({
    controlPlaceId,
    scopeId,
  })),
  controlPlaces: [
    "Flow_BoundaryToRecover",
    "Flow_ChildStartToFork",
    "Flow_ForkToSiblingWork",
    "Flow_ForkToTriggerError",
    "Flow_OuterStartToScope",
    "Flow_RecoverToRecoveredEnd",
    "Flow_ScopeToNormalEnd",
    "Flow_SiblingWorkToNoneEnd",
    "Flow_TriggerErrorToErrorEnd",
  ].map(controlPlace),
  operations: [
    {
      ...operationBase("EndEvent_Normal"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_ScopeToNormalEnd",
    },
    {
      ...operationBase("EndEvent_Recovered"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_RecoverToRecoveredEnd",
    },
    {
      ...operationBase("EndEvent_ScopedFailure"),
      kind: SemanticOperationKind.ThrowError,
      input: "place:Flow_TriggerErrorToErrorEnd",
      error: {
        errorDefinitionId: "ErrorEventDefinition_ThrownScopedFailure",
        errorElementId: "Error_ScopedFailure",
        code: "ScopedFailure",
      },
      handler: {
        attachedScopeId: childScopeId,
        code: "ScopedFailure",
        output: "place:Flow_BoundaryToRecover",
        origin: {
          kind: SemanticOriginKind.BpmnElement,
          boundaryEventId: "BoundaryEvent_ScopedFailure",
          errorDefinitionId: "ErrorEventDefinition_CaughtScopedFailure",
          errorElementId: "Error_ScopedFailure",
          sequenceFlowId: "Flow_BoundaryToRecover",
        },
      },
    },
    {
      ...operationBase("EndEvent_SiblingWork"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_SiblingWorkToNoneEnd",
    },
    {
      ...operationBase("Gateway_ChildFork"),
      kind: SemanticOperationKind.Duplicate,
      input: "place:Flow_ChildStartToFork",
      outputs: [
        "place:Flow_ForkToSiblingWork",
        "place:Flow_ForkToTriggerError",
      ],
    },
    {
      ...operationBase("StartEvent_Outer"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_OuterStartToScope",
    },
    {
      ...operationBase("SubProcess_Work"),
      kind: SemanticOperationKind.EnterScope,
      input: "place:Flow_OuterStartToScope",
      childEntry: "place:Flow_ChildStartToFork",
      childScopeId,
    },
    userTask(
      "UserTask_Recover",
      "Recover",
      "Flow_BoundaryToRecover",
      "Flow_RecoverToRecoveredEnd",
    ),
    userTask(
      "UserTask_SiblingWork",
      "Sibling Work",
      "Flow_ForkToSiblingWork",
      "Flow_SiblingWorkToNoneEnd",
    ),
    userTask(
      "UserTask_TriggerError",
      "Trigger Error",
      "Flow_ForkToTriggerError",
      "Flow_TriggerErrorToErrorEnd",
    ),
    {
      id: `operation:complete-scope:${rootScopeId}`,
      kind: SemanticOperationKind.CompleteScope,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: processId },
      scopeId: rootScopeId,
      parentOutput: null,
    },
    {
      id: `operation:complete-scope:${childScopeId}`,
      kind: SemanticOperationKind.CompleteScope,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: "SubProcess_Work",
      },
      scopeId: childScopeId,
      parentOutput: "place:Flow_ScopeToNormalEnd",
    },
  ],
} as const satisfies SemanticProcessProgram;

test("admits one direct cross-scope Error handler", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
});

test("rejects attached-scope and handler-output mutations", () => {
  for (const mutate of [
    (operation: ThrowOperation): ThrowOperation => ({
      ...operation,
      handler: { ...operation.handler, attachedScopeId: rootScopeId },
    }),
    (operation: ThrowOperation): ThrowOperation => ({
      ...operation,
      handler: {
        ...operation.handler,
        output: "place:Flow_ScopeToNormalEnd",
      },
    }),
  ]) {
    const changed = {
      ...program,
      operations: program.operations.map((operation) =>
        operation.kind === SemanticOperationKind.ThrowError
          ? mutate(operation)
          : operation
      ),
    } as const satisfies SemanticProcessProgram;
    assert.equal(isWellFormedSemanticProcessProgram(changed), false);
  }
});

test("trigger-first interrupts the sibling and preserves exact stale refusal", () => {
  const waiting = start();
  assert.deepEqual(openTaskIds(waiting), [
    "UserTask_SiblingWork",
    "UserTask_TriggerError",
  ]);

  const caught = applyStimulus(
    program,
    waiting,
    completion("UserTask_TriggerError"),
  );
  assert.equal(caught.outcome, CommandOutcome.Committed);
  assert.deepEqual(openTaskIds(caught.state), ["UserTask_Recover"]);
  assert.deepEqual(
    caught.state.scopeOccurrences.map(({ id }) => id.definitionScopeId),
    [rootScopeId],
  );
  assert.equal(caught.state.endOccurrences, 0);
  assert.equal(isStableStateResumable(caught.state), true);

  const stale = applyStimulus(program, caught.state, {
    ...completion("UserTask_SiblingWork"),
    commandId: "stale-sibling-after-error",
  });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, caught.state);

  const completed = applyStimulus(
    program,
    caught.state,
    completion("UserTask_Recover"),
  );
  assert.deepEqual(completed.state.control, {
    kind: ControlStateKind.Completed,
    instanceId,
  });
  assert.equal(completed.state.endOccurrences, 1);
});

test("sibling-first preserves its End count and reaches the same recovery wait", () => {
  const triggerFirst = applyStimulus(
    program,
    start(),
    completion("UserTask_TriggerError"),
  );
  const afterSibling = applyStimulus(
    program,
    start(),
    completion("UserTask_SiblingWork"),
  );
  assert.equal(afterSibling.state.endOccurrences, 1);
  assert.deepEqual(openTaskIds(afterSibling.state), ["UserTask_TriggerError"]);

  const siblingFirst = applyStimulus(
    program,
    afterSibling.state,
    completion("UserTask_TriggerError"),
  );
  assert.deepEqual(openTaskIds(siblingFirst.state), ["UserTask_Recover"]);
  assert.equal(siblingFirst.state.endOccurrences, 1);
  assert.deepEqual(
    publicRecoveryProjection(siblingFirst.state),
    publicRecoveryProjection(triggerFirst.state),
  );
});

test("every admitted command prefix is terminal or exposes a User Task", () => {
  for (const order of [
    ["UserTask_TriggerError", "UserTask_Recover"],
    ["UserTask_SiblingWork", "UserTask_TriggerError", "UserTask_Recover"],
  ] as const) {
    let state = start();
    for (const elementId of order) {
      assert.equal(enabledInternalOperationCount(program, state), 0);
      assert.equal(isStableStateResumable(state), true);
      assert.notEqual(openTaskIds(state).length, 0);
      const result = applyStimulus(program, state, completion(elementId));
      assert.equal(result.outcome, CommandOutcome.Committed);
      assert.equal(result.internalStepBoundExceeded, false);
      state = result.state;
    }
    assert.equal(state.control.kind, ControlStateKind.Completed);
    assert.equal(enabledInternalOperationCount(program, state), 0);
    assert.equal(isStableStateResumable(state), true);
  }
});

test("regional interruption removes every child runtime owner and preserves root work", () => {
  const waiting = start();
  const child = waiting.scopeOccurrences.find(
    ({ id }) => id.definitionScopeId === childScopeId,
  );
  const root = waiting.scopeOccurrences.find(({ parent }) => parent === null);
  const throwOperation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.ThrowError,
  );
  assert.ok(child !== undefined);
  assert.ok(root !== undefined);
  if (throwOperation?.kind !== SemanticOperationKind.ThrowError) {
    throw new Error("the Error profile has no throw operation");
  }
  const effectId = {
    processInstanceId: instanceId,
    elementId: "SyntheticChildEffect",
    activation: 1,
  };
  const descendantId = {
    processInstanceId: instanceId,
    definitionScopeId: "scope:SyntheticDescendant",
    activation: 1,
  };
  const synthetic: RuntimeState = {
    ...waiting,
    scopeOccurrences: [
      ...waiting.scopeOccurrences,
      { id: descendantId, parent: child.id },
    ],
    controlTokens: [
      {
        placeId: throwOperation.input,
        owner: child.id,
        multiplicity: 1,
      },
      {
        placeId: "place:SyntheticDescendant",
        owner: descendantId,
        multiplicity: 1,
      },
    ],
    userTaskWaits: [
      ...waiting.userTaskWaits.filter(
        ({ id }) => id.elementId === "UserTask_SiblingWork",
      ),
      {
        id: {
          processInstanceId: instanceId,
          elementId: "SyntheticRootTask",
          activation: 1,
        },
        owner: root.id,
        name: "Root task",
        output: "place:SyntheticRootOutput",
      },
    ],
    messageWaits: [{
      id: {
        processInstanceId: instanceId,
        elementId: "SyntheticChildMessage",
        activation: 1,
      },
      owner: child.id,
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: "SyntheticInterface",
        interfaceOperationId: "SyntheticOperation",
        messageId: "SyntheticMessage",
      },
      output: "place:SyntheticMessageOutput",
    }],
    timerWaits: [{
      id: {
        processInstanceId: instanceId,
        elementId: "SyntheticChildTimer",
        activation: 1,
      },
      owner: child.id,
      deadlineMs: 1000,
      output: "place:SyntheticTimerOutput",
    }],
    effectWaits: [{
      id: effectId,
      owner: child.id,
      descriptor: { protocol: "synthetic", operation: "synthetic" },
      arguments: [],
      outputMappings: [],
      bpmnErrorRoute: null,
      output: "place:SyntheticEffectOutput",
      incidentAlreadyRetried: false,
    }],
    variables: {
      ...waiting.variables,
      activities: [{
        owner: createEffectLocalDataOwner(effectId),
        bindings: [],
      }],
    },
    taskActivations: [{ elementId: "preserved-task", count: 7 }],
    messageActivations: [{ elementId: "preserved-message", count: 5 }],
    timerActivations: [{ elementId: "preserved-timer", count: 4 }],
    effectActivations: [{ elementId: "preserved-effect", count: 3 }],
    scopeActivations: [{ elementId: "preserved-scope", count: 2 }],
    endOccurrences: 1,
  };

  const caught = applyInternalOperation(program, throwOperation, synthetic);
  assert.ok(caught !== null);
  assert.deepEqual(openTaskIds(caught), ["SyntheticRootTask"]);
  assert.deepEqual(caught.scopeOccurrences, [root]);
  assert.deepEqual(caught.messageWaits, []);
  assert.deepEqual(caught.timerWaits, []);
  assert.deepEqual(caught.effectWaits, []);
  assert.deepEqual(caught.variables.activities, []);
  assert.deepEqual(caught.taskActivations, synthetic.taskActivations);
  assert.deepEqual(caught.messageActivations, synthetic.messageActivations);
  assert.deepEqual(caught.timerActivations, synthetic.timerActivations);
  assert.deepEqual(caught.effectActivations, synthetic.effectActivations);
  assert.deepEqual(caught.scopeActivations, synthetic.scopeActivations);
  assert.equal(caught.endOccurrences, 1);
  assert.deepEqual(caught.controlTokens, [{
    placeId: "place:Flow_BoundaryToRecover",
    owner: root.id,
    multiplicity: 1,
  }]);
});

function start(): RuntimeState {
  const result = applyStimulus(program, initialState, startStimulus());
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, false);
  return result.state;
}

function userTask(
  elementId: string,
  name: string,
  inputFlow: string,
  outputFlow: string,
) {
  return {
    ...operationBase(elementId),
    kind: SemanticOperationKind.AwaitUserTask,
    input: `place:${inputFlow}`,
    output: `place:${outputFlow}`,
    task: { elementId, name },
  } as const;
}

function startStimulus(): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-subprocess-error",
    processId,
    instanceId,
    initialVariables: [],
  };
}

function completion(elementId: string): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: taskId(elementId),
    submittedValues: [],
  };
}

function taskId(elementId: string): UserTaskInstanceId {
  return { processInstanceId: instanceId, elementId, activation: 1 };
}

function openTaskIds(state: RuntimeState): ReadonlyArray<string> {
  return projectOpenUserTasks(state).map(({ id }) => id.elementId);
}

function publicRecoveryProjection(state: RuntimeState) {
  return {
    control: state.control,
    openTasks: projectOpenUserTasks(state),
    variables: state.variables.process.bindings,
    logicalTimeMs: state.logicalTimeMs,
  };
}

type ThrowOperation = Extract<
  SemanticProcessProgram["operations"][number],
  { kind: SemanticOperationKind.ThrowError }
>;
