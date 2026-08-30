import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ActivityBodyKind,
  ControlStateKind,
  MessageChannelKind,
  SemanticOperationKind,
  VariableValueKind,
  applyInternalOperation,
  applyStimulus,
  createActivityLocalDataOwner,
  createEffectLocalDataOwner,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import {
  terminateChildScopeId,
  terminateCompletion,
  terminateInstanceId,
  terminateProgram,
  terminateRootScopeId,
  terminateStartStimulus,
} from "./terminate-end-event-fixture.ts";

test("start and command closures have the exact approved bounds", () => {
  const shortStart = applyStimulus(
    terminateProgram,
    initialState,
    terminateStartStimulus(),
    4,
  );
  assert.equal(shortStart.internalStepBoundExceeded, true);

  const waiting = applyStimulus(
    terminateProgram,
    initialState,
    terminateStartStimulus(),
    5,
  );
  assert.equal(waiting.outcome, CommandOutcome.Committed);
  assert.equal(waiting.internalStepBoundExceeded, false);
  assert.deepEqual(openTaskIds(waiting.state), [
    "UserTask_Sibling",
    "UserTask_Trigger",
  ]);

  const shortTrigger = applyStimulus(
    terminateProgram,
    waiting.state,
    terminateCompletion("UserTask_Trigger"),
    2,
  );
  assert.equal(shortTrigger.internalStepBoundExceeded, true);
  const afterTrigger = applyStimulus(
    terminateProgram,
    waiting.state,
    terminateCompletion("UserTask_Trigger"),
    3,
  );
  assert.equal(afterTrigger.internalStepBoundExceeded, false);
  assert.deepEqual(openTaskIds(afterTrigger.state), ["UserTask_Outer"]);

  const shortOuter = applyStimulus(
    terminateProgram,
    afterTrigger.state,
    terminateCompletion("UserTask_Outer"),
    1,
  );
  assert.equal(shortOuter.internalStepBoundExceeded, true);
  const completed = applyStimulus(
    terminateProgram,
    afterTrigger.state,
    terminateCompletion("UserTask_Outer"),
    2,
  );
  assert.equal(completed.internalStepBoundExceeded, false);
  assert.deepEqual(completed.state.control, {
    kind: ControlStateKind.Completed,
    instanceId: terminateInstanceId,
  });
});

test("trigger-first cancellation is regional, complete, and stale-safe", () => {
  const waiting = start();
  const afterTrigger = applyStimulus(
    terminateProgram,
    waiting,
    terminateCompletion("UserTask_Trigger"),
  );
  assert.equal(afterTrigger.outcome, CommandOutcome.Committed);
  assert.deepEqual(openTaskIds(afterTrigger.state), ["UserTask_Outer"]);
  assert.deepEqual(
    afterTrigger.state.scopeOccurrences.map(({ id }) => id.definitionScopeId),
    [terminateRootScopeId],
  );
  assert.equal(afterTrigger.state.endOccurrences, 1);

  const stale = applyStimulus(terminateProgram, afterTrigger.state, {
    ...terminateCompletion("UserTask_Sibling"),
    commandId: "stale-sibling-after-terminate",
  });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, afterTrigger.state);
});

test("sibling-first remains at Trigger and preserves its prior End occurrence", () => {
  const afterSibling = applyStimulus(
    terminateProgram,
    start(),
    terminateCompletion("UserTask_Sibling"),
  );
  assert.deepEqual(openTaskIds(afterSibling.state), ["UserTask_Trigger"]);
  assert.equal(afterSibling.state.endOccurrences, 1);
  assert.equal(isStableStateResumable(afterSibling.state), true);

  const afterTrigger = applyStimulus(
    terminateProgram,
    afterSibling.state,
    terminateCompletion("UserTask_Trigger"),
  );
  assert.deepEqual(openTaskIds(afterTrigger.state), ["UserTask_Outer"]);
  assert.equal(afterTrigger.state.endOccurrences, 2);
});

test("termination and completion remain three distinct unique operations", () => {
  const waiting = start();
  const committed = applyStimulus(
    terminateProgram,
    waiting,
    terminateCompletion("UserTask_Trigger"),
    0,
  );
  assert.equal(committed.outcome, CommandOutcome.Committed);
  assert.equal(enabledInternalOperationCount(terminateProgram, committed.state), 1);

  const terminated = applyInternalOperation(
    terminateProgram,
    terminateOperation(),
    committed.state,
  );
  assert.ok(terminated !== null);
  assert.equal(enabledInternalOperationCount(terminateProgram, terminated), 1);
  assert.deepEqual(
    terminated.scopeOccurrences.map(({ id }) => id.definitionScopeId),
    [terminateRootScopeId, terminateChildScopeId],
  );
  assert.deepEqual(terminated.controlTokens, []);
  assert.equal(terminated.endOccurrences, 1);
  assert.equal(
    applyInternalOperation(terminateProgram, terminateOperation(), terminated),
    null,
  );

  const childCompleted = applyInternalOperation(
    terminateProgram,
    completionOperation(terminateChildScopeId),
    terminated,
  );
  assert.ok(childCompleted !== null);
  assert.equal(enabledInternalOperationCount(terminateProgram, childCompleted), 1);
  assert.deepEqual(childCompleted.controlTokens, [{
    placeId: "place:Flow_ScopeToOuter",
    owner: scope(childCompleted, terminateRootScopeId).id,
    multiplicity: 1,
  }]);
  const outerArmed = applyInternalOperation(
    terminateProgram,
    outerTaskOperation(),
    childCompleted,
  );
  assert.ok(outerArmed !== null);
  assert.deepEqual(openTaskIds(outerArmed), ["UserTask_Outer"]);
});

test("termination refuses zero, multiple, wrong-owner, and wrong-scope offers", () => {
  const ready = applyStimulus(
    terminateProgram,
    start(),
    terminateCompletion("UserTask_Trigger"),
    0,
  ).state;
  const offered = ready.controlTokens[0];
  const root = scope(ready, terminateRootScopeId);
  assert.ok(offered !== undefined);
  const cases: ReadonlyArray<Readonly<{
    operation: TerminateOperation;
    state: RuntimeState;
  }>> = [
    { operation: terminateOperation(), state: { ...ready, controlTokens: [] } },
    {
      operation: terminateOperation(),
      state: {
        ...ready,
        controlTokens: [{ ...offered, multiplicity: 2 }],
      },
    },
    {
      operation: terminateOperation(),
      state: {
        ...ready,
        scopeOccurrences: ready.scopeOccurrences.filter(
          ({ id }) => id.definitionScopeId !== terminateChildScopeId,
        ),
      },
    },
    {
      operation: terminateOperation(),
      state: {
        ...ready,
        controlTokens: [{ ...offered, owner: root.id }],
      },
    },
    {
      operation: {
        ...terminateOperation(),
        scopeId: terminateRootScopeId,
      },
      state: ready,
    },
  ];
  for (const candidate of cases) {
    const before = structuredClone(candidate.state);
    assert.equal(
      applyInternalOperation(
        terminateProgram,
        candidate.operation,
        candidate.state,
      ),
      null,
    );
    assert.deepEqual(candidate.state, before);
  }
});

test("regional termination removes every child owner while retaining the child root and parent state", () => {
  const waiting = start();
  const child = scope(waiting, terminateChildScopeId);
  const root = scope(waiting, terminateRootScopeId);
  const descendant = {
    processInstanceId: terminateInstanceId,
    definitionScopeId: "scope:SyntheticDescendant",
    activation: 1,
  };
  const calledRoot = {
    processInstanceId: "SyntheticCalledInstance",
    definitionScopeId: "scope:SyntheticCalledRoot",
    activation: 1,
  };
  const childEffect = {
    processInstanceId: terminateInstanceId,
    elementId: "SyntheticChildEffect",
    activation: 1,
  };
  const parentEffect = {
    processInstanceId: terminateInstanceId,
    elementId: "SyntheticParentEffect",
    activation: 1,
  };
  const calledEffect = {
    processInstanceId: calledRoot.processInstanceId,
    elementId: "SyntheticCalledEffect",
    activation: 1,
  };
  const calledActivity = {
    processInstanceId: calledRoot.processInstanceId,
    activityElementId: "SyntheticCalledActivity",
    activation: 1,
  };
  const withdrawnActivity = {
    id: {
      processInstanceId: terminateInstanceId,
      activityElementId: "SyntheticChildActivity",
      activation: 1,
    },
    owner: child.id,
    operationId: "operation:SyntheticChildActivity",
    body: {
      kind: ActivityBodyKind.ChildScope,
      scope: descendant,
    },
    attachedHandlers: [],
  } as const;
  const richState: RuntimeState = {
    ...waiting,
    scopeOccurrences: [
      ...waiting.scopeOccurrences,
      { id: descendant, parent: child.id },
      { id: calledRoot, parent: null },
    ],
    controlTokens: [
      {
        placeId: terminateOperation().input,
        owner: child.id,
        multiplicity: 1,
      },
      { placeId: "place:ParentLive", owner: root.id, multiplicity: 1 },
      { placeId: "place:DescendantLive", owner: descendant, multiplicity: 1 },
    ],
    userTaskWaits: [
      ...waiting.userTaskWaits.filter(
        ({ id }) => id.elementId === "UserTask_Sibling",
      ),
      {
        id: {
          processInstanceId: terminateInstanceId,
          elementId: "SyntheticParentTask",
          activation: 1,
        },
        owner: root.id,
        name: "Parent task",
        output: "place:ParentTaskOutput",
      },
    ],
    messageWaits: [{
      id: {
        processInstanceId: terminateInstanceId,
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
        processInstanceId: terminateInstanceId,
        elementId: "SyntheticChildTimer",
        activation: 1,
      },
      owner: descendant,
      deadlineMs: 1000,
      output: "place:SyntheticTimerOutput",
    }],
    effectWaits: [
      {
        id: childEffect,
        owner: child.id,
        descriptor: { protocol: "synthetic", operation: "child" },
        arguments: [],
        outputMappings: [],
        bpmnErrorRoute: null,
        output: "place:SyntheticChildEffectOutput",
        incidentAlreadyRetried: false,
      },
      {
        id: parentEffect,
        owner: root.id,
        descriptor: { protocol: "synthetic", operation: "parent" },
        arguments: [],
        outputMappings: [],
        bpmnErrorRoute: null,
        output: "place:SyntheticParentEffectOutput",
        incidentAlreadyRetried: false,
      },
    ],
    selectedBranchSets: [{
      owner: child.id,
      selectionKey: "SyntheticSelection",
      expectedInputs: ["place:SyntheticSelectedInput"],
    }],
    eventRaces: [{
      id: {
        processInstanceId: terminateInstanceId,
        elementId: "SyntheticRace",
        activation: 1,
      },
      owner: child.id,
      messageSubscriptionId: {
        processInstanceId: terminateInstanceId,
        elementId: "SyntheticChildMessage",
        activation: 1,
      },
      timerOccurrenceId: {
        processInstanceId: terminateInstanceId,
        elementId: "SyntheticChildTimer",
        activation: 1,
      },
    }],
    calledProcessOccurrences: [{
      id: {
        processInstanceId: terminateInstanceId,
        elementId: "SyntheticCall",
        activation: 1,
      },
      caller: child.id,
      calledProcessId: "SyntheticCalledProcess",
      calledRoot,
      returnOperationId: "operation:SyntheticReturn",
    }],
    activityOccurrences: [
      ...waiting.activityOccurrences,
      withdrawnActivity,
    ],
    variables: {
      process: {
        bindings: [{
          name: "preserved",
          value: { kind: VariableValueKind.String, value: "yes" },
        }],
      },
      activities: [
        { owner: createEffectLocalDataOwner(calledEffect), bindings: [] },
        { owner: createEffectLocalDataOwner(childEffect), bindings: [] },
        { owner: createEffectLocalDataOwner(parentEffect), bindings: [] },
        {
          owner: createActivityLocalDataOwner(calledActivity),
          bindings: [],
        },
        {
          owner: createActivityLocalDataOwner(withdrawnActivity.id),
          bindings: [],
        },
      ],
    },
    taskActivations: [{ elementId: "task", count: 9 }],
    messageActivations: [{ elementId: "message", count: 8 }],
    timerActivations: [{ elementId: "timer", count: 7 }],
    eventRaceActivations: [{ elementId: "race", count: 6 }],
    callActivations: [{ elementId: "call", count: 5 }],
    effectActivations: [{ elementId: "effect", count: 4 }],
    scopeActivations: [{ elementId: "scope", count: 3 }],
    endOccurrences: 2,
  };

  const terminated = applyInternalOperation(
    terminateProgram,
    terminateOperation(),
    richState,
  );
  assert.ok(terminated !== null);
  assert.deepEqual(terminated.scopeOccurrences, [root, child]);
  assert.deepEqual(
    terminated.controlTokens,
    [{ placeId: "place:ParentLive", owner: root.id, multiplicity: 1 }],
  );
  assert.deepEqual(openTaskIds(terminated), ["SyntheticParentTask"]);
  assert.deepEqual(terminated.messageWaits, []);
  assert.deepEqual(terminated.timerWaits, []);
  assert.deepEqual(terminated.effectWaits, [richState.effectWaits[1]]);
  assert.deepEqual(terminated.selectedBranchSets, []);
  assert.deepEqual(terminated.eventRaces, []);
  assert.deepEqual(terminated.calledProcessOccurrences, []);
  assert.deepEqual(terminated.variables.process, richState.variables.process);
  assert.deepEqual(terminated.variables.activities, [
    { owner: createEffectLocalDataOwner(parentEffect), bindings: [] },
  ]);
  assert.deepEqual(terminated.taskActivations, richState.taskActivations);
  assert.deepEqual(terminated.messageActivations, richState.messageActivations);
  assert.deepEqual(terminated.timerActivations, richState.timerActivations);
  assert.deepEqual(terminated.eventRaceActivations, richState.eventRaceActivations);
  assert.deepEqual(terminated.callActivations, richState.callActivations);
  assert.deepEqual(terminated.effectActivations, richState.effectActivations);
  assert.deepEqual(terminated.scopeActivations, richState.scopeActivations);
  assert.equal(terminated.endOccurrences, 3);
});

test("the same no-output operation terminates a root occurrence through completeScope", () => {
  const root = {
    processInstanceId: terminateInstanceId,
    definitionScopeId: terminateRootScopeId,
    activation: 1,
  };
  const state: RuntimeState = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: terminateInstanceId },
    scopeOccurrences: [{ id: root, parent: null }],
    controlTokens: [{
      placeId: terminateOperation().input,
      owner: root,
      multiplicity: 1,
    }],
    userTaskWaits: [{
      id: {
        processInstanceId: terminateInstanceId,
        elementId: "SyntheticRootSibling",
        activation: 1,
      },
      owner: root,
      name: "Root sibling",
      output: "place:SyntheticRootSiblingOutput",
    }],
  };
  const rootTermination = {
    ...terminateOperation(),
    scopeId: terminateRootScopeId,
  } as const satisfies TerminateOperation;
  const terminated = applyInternalOperation(terminateProgram, rootTermination, state);
  assert.ok(terminated !== null);
  assert.deepEqual(terminated.scopeOccurrences, [{ id: root, parent: null }]);
  assert.deepEqual(terminated.controlTokens, []);
  assert.deepEqual(terminated.userTaskWaits, []);
  assert.equal(terminated.endOccurrences, 1);

  const completed = applyInternalOperation(
    terminateProgram,
    completionOperation(terminateRootScopeId),
    terminated,
  );
  assert.ok(completed !== null);
  assert.deepEqual(completed.control, {
    kind: ControlStateKind.Completed,
    instanceId: terminateInstanceId,
  });
  assert.deepEqual(completed.scopeOccurrences, []);
});

function start(): RuntimeState {
  const result = applyStimulus(
    terminateProgram,
    initialState,
    terminateStartStimulus(),
  );
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, false);
  return result.state;
}

function terminateOperation(): TerminateOperation {
  const found = terminateProgram.operations.find(
    (candidate) => candidate.kind === SemanticOperationKind.TerminateScope,
  );
  assert.ok(found?.kind === SemanticOperationKind.TerminateScope);
  return found;
}

function completionOperation(scopeId: string) {
  const found = terminateProgram.operations.find(
    (candidate) =>
      candidate.kind === SemanticOperationKind.CompleteScope &&
      candidate.scopeId === scopeId,
  );
  assert.ok(found?.kind === SemanticOperationKind.CompleteScope);
  return found;
}

function outerTaskOperation(): Extract<
  SemanticProcessProgram["operations"][number],
  { kind: SemanticOperationKind.AwaitUserTask }
> {
  const found = terminateProgram.operations.find(
    (candidate) =>
      candidate.kind === SemanticOperationKind.AwaitUserTask &&
      candidate.origin.elementId === "UserTask_Outer",
  );
  assert.ok(found?.kind === SemanticOperationKind.AwaitUserTask);
  return found;
}

function scope(state: RuntimeState, scopeId: string) {
  const found = state.scopeOccurrences.find(
    ({ id }) => id.definitionScopeId === scopeId,
  );
  assert.ok(found !== undefined);
  return found;
}

function openTaskIds(state: RuntimeState): ReadonlyArray<string> {
  return projectOpenUserTasks(state).map(({ id }) => id.elementId);
}

type TerminateOperation = Extract<
  SemanticProcessProgram["operations"][number],
  { kind: SemanticOperationKind.TerminateScope }
>;
