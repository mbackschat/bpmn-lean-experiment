/**
 * The malformed sequential Multi-Instance controller states the account refuses.
 *
 * The oracle is the capsule's controller invariants: a controller is bound to one Activity occurrence
 * record of the same identity, one controller exists per open outer Activity, its body is a User Task,
 * and it still has an item left to generate. Each state below is unreachable by construction, so a
 * class an admitted transition could produce would be a defect in the transition rather than a case
 * for this file.
 *
 * Every negative perturbs the *same* admitted base state, so a refusal is attributable to the one
 * field it changed. The base state is the monitored-task arming, which produces exactly one Activity
 * occurrence record with a User Task body and one attached Timer, which is the shape the outer
 * Multi-Instance Activity has.
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
  RuntimeStateDefect,
  runtimeStateDefects,
  type RuntimeState,
  type ActivityOccurrence,
  type SequentialMultiInstanceController,
} from "@bpmn-lean/semantic-core";

import {
  instanceId,
  monitoredProgram,
  start,
} from "./monitored-task-fixture.ts";

function armed(): RuntimeState {
  const started = applyStimulus(monitoredProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

function defects(state: RuntimeState): ReadonlyArray<string> {
  return runtimeStateDefects(monitoredProgram, instanceId, state);
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

test("an absent controller collection and a bound controller are both admitted", () => {
  const before = armed();
  assert.deepEqual(defects(before), [], "the base state must be admitted");
  assert.deepEqual(
    defects(withControllers(before, [boundController(before)])),
    [],
    "a controller bound to a live record with an item left must be admitted",
  );
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
