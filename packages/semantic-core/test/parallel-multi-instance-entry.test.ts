import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  FlowNodeOccurrenceTerminalKind,
  RuntimeStateRegression,
  SemanticFlowNodeOccurrenceAnchorKind,
  VariableValueKind,
  applyStimulus,
  applyStimulusWithTrace,
  initialState,
  observeStableState,
  projectOpenFlowNodeOccurrences,
  requireCompleteFlowNodeOccurrenceLifecycles,
  runtimeStateRegressions,
  type RuntimeState,
  type StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import {
  completeIteration,
  fireOuterTimer,
  outputBinding,
} from "./sequential-multi-instance-fixture.ts";
import {
  parallelProgram,
  parallelStart,
  startWithParallelItems,
} from "./parallel-multi-instance-fixture.ts";

test("parallel entry atomically opens one indexed task for every snapshotted item", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const entered = applyStimulus(parallelProgram, before, parallelStart);

  assert.equal(entered.outcome, CommandOutcome.Committed);
  assert.deepEqual(
    entered.state.userTaskWaits.map(({ id }) => id.activation),
    [1, 2, 3],
  );
  assert.deepEqual(
    entered.state.userTaskWaits.map(({ id }) => id.elementId),
    ["Review", "Review", "Review"],
  );
  assert.equal(
    runtimeStateRegressions(before, entered.state).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
    "parallel entry issues the outer Activity above its predecessor high-water mark",
  );
  const observed = observeStableState(parallelProgram, entered.state);
  assert.deepEqual(observed?.openMultiInstances, [{
    id: {
      processInstanceId: "ReviewInstance_1",
      activityElementId: "Review",
      activation: 1,
    },
    mode: "parallel",
    plannedInstanceCount: 3,
    pendingItemCount: 0,
    numberOfInstances: 3,
    numberOfActiveInstances: 3,
    numberOfCompletedInstances: 0,
    numberOfTerminatedInstances: 0,
    activeIterations: [
      {
        loopCounter: 0,
        taskId: {
          processInstanceId: "ReviewInstance_1",
          elementId: "Review",
          activation: 1,
        },
        taskInput: {
          name: "DataInput_TaskItem",
          value: { kind: VariableValueKind.String, value: "alpha" },
        },
        completionBindingName: "DataOutput_TaskResult",
      },
      {
        loopCounter: 1,
        taskId: {
          processInstanceId: "ReviewInstance_1",
          elementId: "Review",
          activation: 2,
        },
        taskInput: {
          name: "DataInput_TaskItem",
          value: { kind: VariableValueKind.String, value: "beta" },
        },
        completionBindingName: "DataOutput_TaskResult",
      },
      {
        loopCounter: 2,
        taskId: {
          processInstanceId: "ReviewInstance_1",
          elementId: "Review",
          activation: 3,
        },
        taskInput: {
          name: "DataInput_TaskItem",
          value: { kind: VariableValueKind.String, value: "gamma" },
        },
        completionBindingName: "DataOutput_TaskResult",
      },
    ],
  }]);
});

test("all completion stores by index and publishes only when every child completes", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const entered = applyStimulus(parallelProgram, before, parallelStart);
  const third = applyStimulus(
    parallelProgram,
    entered.state,
    completeIteration(2, "reviewed gamma"),
  );
  assert.equal(third.outcome, CommandOutcome.Committed);
  assert.equal(outputBinding(third.state), undefined);
  assert.deepEqual(
    runtimeStateRegressions(entered.state, third.state),
    [],
    "parallel child turnover preserves the exact outer identity",
  );

  const first = applyStimulus(
    parallelProgram,
    third.state,
    completeIteration(0, "reviewed alpha"),
  );
  assert.equal(first.outcome, CommandOutcome.Committed);
  assert.equal(outputBinding(first.state), undefined);

  const last = applyStimulus(
    parallelProgram,
    first.state,
    completeIteration(1, "reviewed beta"),
  );
  assert.equal(last.outcome, CommandOutcome.Committed);
  assert.deepEqual(outputBinding(last.state), {
    name: "DataObjectReference_OutputResults",
    value: {
      kind: VariableValueKind.StringList,
      value: ["reviewed alpha", "reviewed beta", "reviewed gamma"],
    },
  });
  assert.equal(last.state.userTaskWaits.length, 0);
  assert.equal(last.state.timerWaits.length, 0);
  assert.equal(last.state.parallelMultiInstanceControllers?.length, 0);
});

test("first completion withdraws every sibling and publishes no partial collection", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const firstPolicyStart: StartProcessStimulus = {
    ...parallelStart,
    commandId: "start-parallel-first",
    initialVariables: parallelStart.initialVariables.map((binding) =>
      binding.name === "completionPolicy"
        ? {
          ...binding,
          value: { kind: VariableValueKind.String, value: "first" },
        }
        : binding
    ),
  };
  const entered = applyStimulus(parallelProgram, before, firstPolicyStart);
  const completed = applyStimulus(
    parallelProgram,
    entered.state,
    completeIteration(1, "first accepted"),
  );

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(outputBinding(completed.state), undefined);
  assert.equal(completed.state.userTaskWaits.length, 0);
  assert.equal(completed.state.timerWaits.length, 0);
  assert.equal(completed.state.parallelMultiInstanceControllers?.length, 0);
});

test("outer timer withdraws every parallel child and follows only the boundary route", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const entered = applyStimulus(parallelProgram, before, parallelStart);
  const interrupted = applyStimulus(
    parallelProgram,
    entered.state,
    fireOuterTimer,
  );

  assert.equal(interrupted.outcome, CommandOutcome.Committed);
  assert.equal(outputBinding(interrupted.state), undefined);
  assert.deepEqual(
    interrupted.state.userTaskWaits.map(({ id }) => id.elementId),
    ["EscalationTask"],
  );
  assert.equal(interrupted.state.timerWaits.length, 0);
  assert.equal(interrupted.state.parallelMultiInstanceControllers?.length, 0);
  assert.deepEqual(interrupted.state.controlTokens, []);
});

test("first completion publishes the selected child as completed and every sibling as cancelled", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const entered = applyStimulusWithTrace(
    parallelProgram,
    before,
    startWithParallelItems("start-parallel-first-lifecycle", ["alpha", "beta", "gamma"], "first"),
  );
  const completed = applyStimulusWithTrace(
    parallelProgram,
    entered.result.state,
    completeIteration(1, "first accepted"),
  );

  assert.deepEqual(completed.flowNodeOccurrenceLifecycles[0]?.ended.filter(
    ({ anchor }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait,
  ).map(({ anchor, terminal }) => ({
    activation: anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait
      ? anchor.id.activation
      : 0,
    terminal,
  })), [
    { activation: 1, terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
    { activation: 2, terminal: FlowNodeOccurrenceTerminalKind.Completed },
    { activation: 3, terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
  ]);
  const retained = projectOpenFlowNodeOccurrences(
    parallelProgram,
    entered.result.state,
  )?.map((entry) => ({
    ...entry,
    attachedTimers: [fireOuterTimer.timerId],
  }));
  assert.ok(retained !== undefined && retained !== null);
  assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(
    parallelProgram,
    retained,
    "complete-review-1",
    completed.committedTransitions,
    completed.flowNodeOccurrenceLifecycles,
  ));

  const missingSibling = completed.flowNodeOccurrenceLifecycles.map((lifecycle, index) =>
    index === 0
      ? {
        ...lifecycle,
        ended: lifecycle.ended.filter(({ anchor }) =>
          anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Wait ||
          anchor.id.activation !== 3
        ),
      }
      : lifecycle
  );
  assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(
    parallelProgram,
    retained,
    "complete-review-1",
    completed.committedTransitions,
    missingSibling,
  ), /complete lifecycle/u);
});

test("outer timer publishes every parallel child as cancelled", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const entered = applyStimulusWithTrace(parallelProgram, before, parallelStart);
  const interrupted = applyStimulusWithTrace(
    parallelProgram,
    entered.result.state,
    fireOuterTimer,
  );

  assert.deepEqual(interrupted.flowNodeOccurrenceLifecycles[0]?.ended.filter(
    ({ anchor }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait,
  ).map(({ anchor, terminal }) => ({
    activation: anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait
      ? anchor.id.activation
      : 0,
    terminal,
  })), [
    { activation: 1, terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
    { activation: 2, terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
    { activation: 3, terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
  ]);
});

test("zero items complete atomically without a controller, task, or timer", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const completed = applyStimulus(
    parallelProgram,
    before,
    startWithParallelItems("start-parallel-empty", [], "all"),
  );

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(outputBinding(completed.state), {
    name: "DataObjectReference_OutputResults",
    value: { kind: VariableValueKind.StringList, value: [] },
  });
  assert.equal(completed.state.activityOccurrences.length, 0);
  assert.equal(completed.state.userTaskWaits.length, 0);
  assert.equal(completed.state.timerWaits.length, 0);
  assert.equal(completed.state.parallelMultiInstanceControllers?.length, 0);
});

test("one item under first publishes the complete collection", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const entered = applyStimulus(
    parallelProgram,
    before,
    startWithParallelItems("start-parallel-one-first", ["only"], "first"),
  );
  const completed = applyStimulus(
    parallelProgram,
    entered.state,
    completeIteration(0, "reviewed only"),
  );

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(outputBinding(completed.state), {
    name: "DataObjectReference_OutputResults",
    value: { kind: VariableValueKind.StringList, value: ["reviewed only"] },
  });
});

test("duplicate child completion is refused without changing committed state", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const entered = applyStimulus(parallelProgram, before, parallelStart);
  const completed = applyStimulus(
    parallelProgram,
    entered.state,
    completeIteration(0, "reviewed alpha"),
  );
  const duplicate = applyStimulus(
    parallelProgram,
    completed.state,
    { ...completeIteration(0, "again"), commandId: "duplicate-parallel-child" },
  );

  assert.equal(duplicate.outcome, CommandOutcome.Rejected);
  assert.deepEqual(duplicate.state, completed.state);
});

test("the outer timer is stale after normal closure and cannot select the boundary route", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  let state = applyStimulus(parallelProgram, before, parallelStart).state;
  for (const [index, result] of ["reviewed alpha", "reviewed beta", "reviewed gamma"].entries()) {
    state = applyStimulus(
      parallelProgram,
      state,
      completeIteration(index, result),
    ).state;
  }

  const staleTimer = applyStimulus(parallelProgram, state, {
    ...fireOuterTimer,
    commandId: "stale-parallel-timer-after-normal-closure",
  });

  assert.equal(staleTimer.outcome, CommandOutcome.Rejected);
  assert.deepEqual(staleTimer.state, state);
});

test("a controller whose slot identity is substituted is refused before evaluation", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const entered = applyStimulus(parallelProgram, before, parallelStart);
  const [controller] = entered.state.parallelMultiInstanceControllers ?? [];
  assert.notEqual(controller, undefined);
  const first = controller?.slots[0];
  assert.notEqual(first, undefined);
  const malformed = {
    ...entered.state,
    parallelMultiInstanceControllers: [{
      ...controller,
      slots: controller?.slots.map((slot, index) =>
        index === 1 && first !== undefined
          ? { ...slot, taskId: first.taskId }
          : slot
      ),
    }],
  } as RuntimeState;
  const attempted = applyStimulus(
    parallelProgram,
    malformed,
    completeIteration(0, "must not commit"),
  );

  assert.equal(attempted.outcome, CommandOutcome.Rejected);
  assert.deepEqual(attempted.state, malformed);
});

test("parallel start rejects a third binding instead of selecting by name", () => {
  const before = {
    ...initialState,
    parallelMultiInstanceControllers: [],
  } as RuntimeState;
  const attempted = applyStimulus(parallelProgram, before, {
    ...parallelStart,
    commandId: "start-parallel-with-extra-binding",
    initialVariables: [
      ...parallelStart.initialVariables,
      {
        name: "surplus",
        value: { kind: VariableValueKind.String, value: "not admitted" },
      },
    ],
  });

  assert.equal(attempted.outcome, CommandOutcome.Rejected);
  assert.deepEqual(attempted.state, before);
});
