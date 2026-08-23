/**
 * `SMI-OCCURRENCE-01`: which BPMN flow-node occurrences one sequential Multi-Instance Activity produces.
 *
 * The oracle is the capsule rule together with its runtime inventory. Each generated inner User Task is
 * one E2 occurrence keyed by its own activation; the outer Activity and the synthetic controller are no
 * occurrence at all; the active task closes as completed or cancelled according to which transition won.
 *
 * Every assertion is an exact set rather than a count, because a count cannot separate the defect this
 * rule exists to exclude. An implementation that projected the outer Activity occurrence or the
 * controller as a flow node produces the right number of occurrences at outer entry and the wrong
 * identities, and an implementation that started one occurrence per task *element* rather than per
 * activation satisfies every state assertion in this capsule while publishing one occurrence for three
 * instances.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  applyInternalOperation,
  completeSequentialMultiInstanceIteration,
  interruptSequentialMultiInstance,
  projectFlowNodeOccurrenceLifecycleDelta,
  projectOpenFlowNodeOccurrences,
  type RuntimeState,
  type UnnumberedFlowNodeOccurrenceDelta,
  type VariableBinding,
} from "@bpmn-lean/semantic-core";

import {
  completeIteration,
  fireOuterTimer,
  innerTaskId,
  items,
  owner,
  reviewProgram,
  start,
  startEmpty,
  startedState,
} from "./sequential-multi-instance-fixture.ts";

type Step = Readonly<{
  after: RuntimeState;
  delta: UnnumberedFlowNodeOccurrenceDelta;
}>;

function operationOfKind(kind: SemanticOperationKind) {
  const operation = reviewProgram.operations.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(operation !== undefined, `the fixture must carry one ${kind}`);
  return operation;
}

/** The projected start of the inner occurrence at loop counter `counter`. */
function innerTaskStart(counter: number) {
  return {
    anchor: {
      kind: SemanticFlowNodeOccurrenceAnchorKind.Wait,
      id: innerTaskId(counter),
    },
    processId: reviewProgram.processId,
    elementId: "Review",
    owner,
  };
}

function innerTaskEnd(counter: number, terminal: FlowNodeOccurrenceTerminalKind) {
  return { anchor: innerTaskStart(counter).anchor, terminal };
}

function enter(
  stimulus: { readonly initialVariables: ReadonlyArray<VariableBinding> },
): Step {
  const initiated = applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.Initiate),
    startedState(stimulus),
  );
  assert.ok(initiated !== null);
  const operation = operationOfKind(
    SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  const after = applyInternalOperation(reviewProgram, operation, initiated);
  assert.ok(after !== null);
  const delta = projectFlowNodeOccurrenceLifecycleDelta(
    reviewProgram,
    initiated,
    after,
    { kind: "internal", operation, owner },
    "enter-review",
    0,
  );
  assert.ok(delta !== null, "outer entry must project one occurrence delta");
  return { after, delta };
}

function complete(state: RuntimeState, counter: number, result: string): Step {
  const stimulus = completeIteration(counter, result);
  const after = completeSequentialMultiInstanceIteration(
    reviewProgram,
    state,
    stimulus,
  );
  assert.ok(after !== null, `iteration ${counter} must commit`);
  const delta = projectFlowNodeOccurrenceLifecycleDelta(
    reviewProgram,
    state,
    after,
    { kind: "external", stimulus },
    stimulus.commandId,
    0,
  );
  assert.ok(
    delta !== null,
    `iteration ${counter} must project one occurrence delta`,
  );
  return { after, delta };
}

function interrupt(state: RuntimeState): Step {
  const after = interruptSequentialMultiInstance(
    reviewProgram,
    state,
    fireOuterTimer,
  );
  assert.ok(after !== null, "the lifetime deadline must interrupt");
  const delta = projectFlowNodeOccurrenceLifecycleDelta(
    reviewProgram,
    state,
    after,
    { kind: "external", stimulus: fireOuterTimer },
    fireOuterTimer.commandId,
    0,
  );
  assert.ok(delta !== null, "interruption must project one occurrence delta");
  return { after, delta };
}

test("outer entry starts exactly one occurrence, the inner task at its own activation", () => {
  assert.deepEqual(enter(start).delta, {
    started: [innerTaskStart(0)],
    ended: [],
  });
});

test("an empty collection generates no inner instance and therefore no occurrence", () => {
  assert.deepEqual(enter(startEmpty).delta, { started: [], ended: [] });
});

test("a non-final completion closes its occurrence and starts exactly the next", () => {
  assert.deepEqual(complete(enter(start).after, 0, "reviewed alpha").delta, {
    started: [innerTaskStart(1)],
    ended: [innerTaskEnd(0, FlowNodeOccurrenceTerminalKind.Completed)],
  });
});

test("the final completion closes the last occurrence and starts nothing", () => {
  let state = enter(start).after;
  state = complete(state, 0, "reviewed alpha").after;
  state = complete(state, 1, "reviewed beta").after;
  assert.deepEqual(complete(state, 2, "reviewed gamma").delta, {
    started: [],
    ended: [innerTaskEnd(2, FlowNodeOccurrenceTerminalKind.Completed)],
  });
});

test("a three-item run counts the task element once per activation, not once per element", () => {
  const entry = enter(start);
  const deltas: UnnumberedFlowNodeOccurrenceDelta[] = [entry.delta];
  let state = entry.after;
  for (const [counter, item] of [...items].entries()) {
    const step = complete(state, counter, `reviewed ${item}`);
    deltas.push(step.delta);
    state = step.after;
  }
  assert.deepEqual(
    deltas.flatMap(({ started }) => started),
    [innerTaskStart(0), innerTaskStart(1), innerTaskStart(2)],
    "three generated instances are three distinct occurrences",
  );
  assert.deepEqual(
    deltas.flatMap(({ ended }) => ended),
    [0, 1, 2].map((counter) =>
      innerTaskEnd(counter, FlowNodeOccurrenceTerminalKind.Completed)
    ),
    "and each one is closed exactly once",
  );
});

test("the open set holds the inner task alone, never the controller, the outer Activity, or the lifetime deadline", () => {
  let state = enter(start).after;
  for (const counter of [0, 1]) {
    assert.deepEqual(
      projectOpenFlowNodeOccurrences(reviewProgram, state),
      [innerTaskStart(counter)],
      "one open occurrence while the repetition runs",
    );
    state = complete(state, counter, "reviewed").after;
  }
  assert.deepEqual(
    projectOpenFlowNodeOccurrences(reviewProgram, state),
    [innerTaskStart(2)],
  );
  state = complete(state, 2, "reviewed").after;
  assert.deepEqual(projectOpenFlowNodeOccurrences(reviewProgram, state), []);
});

test("interruption cancels the abandoned iteration and adds the boundary Event's own occurrence", () => {
  // Interrupting the *second* iteration is the discriminating schedule: an implementation that closed
  // the first generated task, or that reused the completion path and published `completed`, states a
  // wrong public fact about work that never finished.
  const state = complete(enter(start).after, 0, "reviewed alpha").after;
  const boundaryAnchor = {
    kind: SemanticFlowNodeOccurrenceAnchorKind.Transition,
    commandId: fireOuterTimer.commandId,
    transitionIndex: 0,
    localIndex: 0,
  };
  assert.deepEqual(interrupt(state).delta, {
    started: [{
      anchor: boundaryAnchor,
      processId: reviewProgram.processId,
      elementId: "Boundary_Timer",
      owner,
    }],
    ended: [
      innerTaskEnd(1, FlowNodeOccurrenceTerminalKind.Cancelled),
      { anchor: boundaryAnchor, terminal: FlowNodeOccurrenceTerminalKind.Completed },
    ],
  });
});
