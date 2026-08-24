/**
 * The malformed sequential Multi-Instance controller states the account refuses.
 *
 * The oracle is the capsule's controller invariants: a controller is bound to one Activity occurrence
 * record of the same identity, one controller exists per open outer Activity, and it still has an item
 * left to generate. Each state below is unreachable by construction, so a class an admitted transition
 * could produce would be a defect in the transition rather than a case for this file.
 *
 * The program-aware binding is the load-bearing conjunct: an open controller names the exact SMI
 * operation, its Activity occurrence record, that record's active User Task wait, and its one lifetime
 * Timer. A different live Activity body is not a weaker progress state. It is an unreachable state
 * that cannot execute the operation the controller claims to own.
 *
 * Every controller-invariant negative perturbs the *same* admitted sequential Multi-Instance base
 * state, so a refusal is attributable to the one field it changed. Cross-profile presence has its
 * own separators because it is decided from the program and the property shape, before any
 * controller is inspected.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  applyStimulus,
  CommandOutcome,
  compareActivityOccurrences,
  compareSequentialMultiInstanceControllers,
  initialState,
  isGateAdmissibleRuntimeState,
  pendingItemCount,
  projectOpenMultiInstances,
  RuntimeStateDefect,
  runtimeStateDefects,
  type RuntimeState,
  type ActivityOccurrence,
  type SequentialMultiInstanceController,
} from "@bpmn-lean/semantic-core";

import {
  instanceId as monitoredInstanceId,
  monitoredProgram,
  start as monitoredStart,
} from "./monitored-task-fixture.ts";
import {
  instanceId,
  reviewProgram,
  start,
} from "./sequential-multi-instance-fixture.ts";

function armed(): RuntimeState {
  const started = applyStimulus(
    reviewProgram,
    { ...initialState, sequentialMultiInstanceControllers: [] },
    start,
  );
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

function defects(state: RuntimeState): ReadonlyArray<string> {
  return runtimeStateDefects(reviewProgram, instanceId, state);
}

function monitoredArmed(): RuntimeState {
  const started = applyStimulus(monitoredProgram, initialState, monitoredStart);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

/** The controller the base state's own record would own, with one item still to generate. */
function boundController(state: RuntimeState): SequentialMultiInstanceController {
  const [record] = state.activityOccurrences;
  assert.ok(record !== undefined, "arming must create one record");
  return { id: record.id, snapshot: ["alpha", "beta"], outputSlots: [] };
}

function withControllers(
  state: RuntimeState,
  controllers: ReadonlyArray<SequentialMultiInstanceController>,
): RuntimeState {
  return { ...state, sequentialMultiInstanceControllers: [...controllers] };
}

test("a profile without sequential Multi-Instance requires the controller property to be absent", () => {
  const before = monitoredArmed();
  assert.deepEqual(
    runtimeStateDefects(monitoredProgram, monitoredInstanceId, before),
    [],
    "the old-profile state without the property must stay admitted",
  );
  assert.equal(
    Object.hasOwn(initialState, "sequentialMultiInstanceControllers"),
    false,
    "the profile-neutral initial state must keep its canonical property-free shape",
  );
  assert.deepEqual(
    runtimeStateDefects(
      monitoredProgram,
      monitoredInstanceId,
      withControllers(before, [boundController(before)]),
    ),
    [RuntimeStateDefect.SequentialMultiInstanceControllerProfileMismatch],
    "even an otherwise valid bound controller must be refused under the old profile",
  );
  assert.deepEqual(
    runtimeStateDefects(
      monitoredProgram,
      monitoredInstanceId,
      withControllers(before, []),
    ),
    [RuntimeStateDefect.SequentialMultiInstanceControllerProfileMismatch],
    "presence itself must be refused even when the collection is empty",
  );
});

test("the sequential Multi-Instance profile requires the controller property in every state", () => {
  assert.deepEqual(
    runtimeStateDefects(reviewProgram, instanceId, initialState),
    [RuntimeStateDefect.SequentialMultiInstanceControllerProfileMismatch],
    "NotStarted cannot mask a missing profile-owned collection",
  );
  assert.equal(
    isGateAdmissibleRuntimeState(reviewProgram, instanceId, initialState),
    false,
    "the fail-closed command gate must reject the profile mismatch",
  );
  assert.deepEqual(
    runtimeStateDefects(
      reviewProgram,
      instanceId,
      withControllers(initialState, []),
    ),
    [],
    "an explicitly empty NotStarted collection is the canonical SMI shape",
  );

  const before = armed();
  assert.deepEqual(defects(before), [], "the valid running SMI state must be admitted");
  const { sequentialMultiInstanceControllers: _controllers, ...missing } = before;
  assert.deepEqual(
    defects(missing),
    [RuntimeStateDefect.SequentialMultiInstanceControllerProfileMismatch],
    "a running SMI state cannot lose its required collection",
  );
});

test("an empty runtime does not duplicate program-ownership admission", () => {
  const operation = reviewProgram.operations.find(({ kind }) =>
    kind === "awaitSequentialMultiInstanceUserTask"
  );
  assert.ok(operation !== undefined);
  const ownership = reviewProgram.operationScopes.find(({ operationId }) =>
    operationId === operation.id
  );
  assert.ok(ownership !== undefined);
  const malformedPrograms = [
    {
      ...reviewProgram,
      operationScopes: reviewProgram.operationScopes.filter(({ operationId }) =>
        operationId !== operation.id
      ),
    },
    {
      ...reviewProgram,
      operationScopes: reviewProgram.operationScopes.flatMap((candidate) =>
        candidate.operationId === operation.id ? [candidate, ownership] : [candidate]
      ),
    },
  ];
  const empty = withControllers(initialState, []);
  const live = armed();
  for (const malformedProgram of malformedPrograms) {
    assert.deepEqual(
      runtimeStateDefects(malformedProgram, instanceId, empty),
      [],
      "program admission owns missing or duplicate operation scope until matching runtime state exists",
    );
    assert.deepEqual(
      projectOpenMultiInstances(malformedProgram, empty),
      [],
      "an empty public projection does not need definition ownership facts",
    );
    assert.deepEqual(
      runtimeStateDefects(malformedProgram, instanceId, live),
      [RuntimeStateDefect.SequentialMultiInstanceControllerBindingMismatch],
      "the scope fact becomes load-bearing as soon as matching SMI runtime state exists",
    );
    assert.equal(
      projectOpenMultiInstances(malformedProgram, live),
      null,
      "malformed definition-to-runtime binding has no public projection",
    );
  }
});

test("a controller naming no record of its identity is refused", () => {
  const before = armed();
  const controller = boundController(before);
  const orphan = {
    ...controller,
    id: { ...controller.id, activation: controller.id.activation + 1 },
  };
  assert.deepEqual(
    defects(withControllers(before, [orphan])),
    [RuntimeStateDefect.SequentialMultiInstanceControllerUnowned],
  );
});

test("an open SMI record without its controller is refused", () => {
  const before = armed();
  assert.deepEqual(
    defects(withControllers(before, [])),
    [RuntimeStateDefect.SequentialMultiInstanceControllerBindingMismatch],
    "the reverse record-to-controller join must not pass vacuously",
  );
});

test("a controller bound to a live child-scope body is refused", () => {
  const before = armed();
  const [record] = before.activityOccurrences;
  assert.ok(record !== undefined);
  const malformed: RuntimeState = {
    ...before,
    activityOccurrences: [{
      ...record,
      body: { kind: ActivityBodyKind.ChildScope, scope: record.owner },
    }],
  };
  assert.deepEqual(
    defects(malformed),
    ["sequentialMultiInstanceControllerBindingMismatch"],
    "a live body of another operation family cannot satisfy the SMI controller binding",
  );
  assert.equal(isGateAdmissibleRuntimeState(reviewProgram, instanceId, malformed), false);
});

test("a controller whose record names another operation is refused", () => {
  const before = armed();
  const [record] = before.activityOccurrences;
  assert.ok(record !== undefined);
  const malformed: RuntimeState = {
    ...before,
    activityOccurrences: [{ ...record, operationId: "operation:another-family" }],
  };
  assert.deepEqual(
    defects(malformed),
    ["sequentialMultiInstanceControllerBindingMismatch"],
  );
});

test("a controller whose task wait carries metadata outside the SMI profile is refused", () => {
  const before = armed();
  const [wait] = before.userTaskWaits;
  assert.ok(wait !== undefined);
  const malformed: RuntimeState = {
    ...before,
    userTaskWaits: [{
      ...wait,
      metadata: {
        assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
        form: { fields: [{ key: "approved", type: "boolean" }] },
      },
    }],
  };
  assert.deepEqual(
    defects(malformed),
    [RuntimeStateDefect.SequentialMultiInstanceControllerBindingMismatch],
  );
});

test("an extra operation-owned task wait outside the Activity record is refused", () => {
  const before = armed();
  const [wait] = before.userTaskWaits;
  assert.ok(wait !== undefined);
  const malformed: RuntimeState = {
    ...before,
    taskActivations: before.taskActivations.map((counter) =>
      counter.elementId === wait.id.elementId
        ? { ...counter, count: counter.count + 1 }
        : counter
    ),
    userTaskWaits: [
      ...before.userTaskWaits,
      { ...wait, id: { ...wait.id, activation: wait.id.activation + 1 } },
    ],
  };
  assert.deepEqual(
    defects(malformed),
    [RuntimeStateDefect.SequentialMultiInstanceControllerBindingMismatch],
  );
});

test("an extra operation-owned Timer wait outside the Activity record is refused", () => {
  const before = armed();
  const [wait] = before.timerWaits;
  assert.ok(wait !== undefined);
  const malformed: RuntimeState = {
    ...before,
    timerActivations: before.timerActivations.map((counter) =>
      counter.elementId === wait.id.elementId
        ? { ...counter, count: counter.count + 1 }
        : counter
    ),
    timerWaits: [
      ...before.timerWaits,
      {
        ...wait,
        id: { ...wait.id, activation: wait.id.activation + 1 },
        deadlineMs: wait.deadlineMs + 1,
      },
    ],
  };
  assert.deepEqual(
    defects(malformed),
    [RuntimeStateDefect.SequentialMultiInstanceControllerBindingMismatch],
  );
});

test("two controllers of one identity are refused", () => {
  const before = armed();
  const controller = boundController(before);
  assert.deepEqual(
    defects(withControllers(before, [controller, controller])),
    [RuntimeStateDefect.DuplicateSequentialMultiInstanceController],
  );
});

test("a controller whose slots exhaust its snapshot is refused", () => {
  const before = armed();
  const controller = boundController(before);
  // Every item generated means the controller should have closed in that same transition, so an open
  // controller with no item left is the state the final-completion arm exists to prevent.
  const exhausted = { ...controller, outputSlots: ["one", "two"] };
  assert.deepEqual(
    defects(withControllers(before, [exhausted])),
    [RuntimeStateDefect.SequentialMultiInstanceExhausted],
  );
});

test("an empty snapshot is refused, because a zero-item collection creates no controller", () => {
  const before = armed();
  const controller = boundController(before);
  assert.deepEqual(
    defects(withControllers(before, [{ ...controller, snapshot: [], outputSlots: [] }])),
    [RuntimeStateDefect.SequentialMultiInstanceExhausted],
  );
});

test("unordered controllers are refused", () => {
  const before = armed();
  const [record] = before.activityOccurrences;
  assert.ok(record !== undefined);
  const lower = { id: record.id, snapshot: ["alpha"], outputSlots: [] };
  const higher = {
    id: { ...record.id, activityElementId: `${record.id.activityElementId}-z` },
    snapshot: ["alpha"],
    outputSlots: [],
  };
  // The higher key first is the only perturbation, and the unowned defect rides along because the
  // synthetic higher key names no record; the ordering class must still be reported.
  assert.ok(
    defects(withControllers(before, [higher, lower]))
      .includes(RuntimeStateDefect.UnorderedCollection),
  );
});

/**
 * One canonical order for one identity, locked where the two plausible comparators disagree.
 *
 * `"a"` and `"B"` are the discriminating pair: a locale comparison orders `a` before `B`, and code
 * point orders it after. The controller collection and the record collection are keyed on the same
 * three fields, so if their comparators disagreed anywhere, a state could satisfy one collection's
 * order conjunct and fail the other's. Every current element id is ASCII lowercase, which is why no
 * other fixture separates them and why this one names the pair explicitly.
 */
test("controllers and records share one canonical order, including where locale order differs", () => {
  const base = { processInstanceId: instanceId, activation: 1 };
  const lower = { ...base, activityElementId: "a" };
  const upper = { ...base, activityElementId: "B" };
  const controller = (
    id: typeof lower,
  ): SequentialMultiInstanceController => ({ id, snapshot: ["x"], outputSlots: [] });
  const record = (id: typeof lower): ActivityOccurrence => ({
    id,
    owner: {
      processInstanceId: instanceId,
      definitionScopeId: "scope",
      activation: 1,
    },
    operationId: "operation",
    body: {
      kind: ActivityBodyKind.UserTask,
      task: { processInstanceId: instanceId, elementId: "t", activation: 1 },
    },
    attachedTimers: [],
  });

  assert.equal(
    Math.sign(compareSequentialMultiInstanceControllers(controller(lower), controller(upper))),
    Math.sign(compareActivityOccurrences(record(lower), record(upper))),
    "the two collections must order one identity the same way",
  );
  assert.equal(
    Math.sign(compareSequentialMultiInstanceControllers(controller(lower), controller(upper))),
    1,
    "and that way is code point, where lowercase sorts after uppercase",
  );
});

/**
 * The pending count truncates at zero, which is the value Lean's `Nat` subtraction yields.
 *
 * Only an exhausted controller reaches the truncation, and the conjunct above refuses that state before
 * evaluation, so this is not a projection a stable state produces. It is the cross-target agreement:
 * an untruncated difference would make the two accounts publish different numbers for one state.
 */
test("an exhausted controller has zero pending items, not a negative count", () => {
  const exhausted = {
    ...boundController(armed()),
    outputSlots: ["one", "two"],
  };
  assert.equal(pendingItemCount(exhausted), 0);
});
