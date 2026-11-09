/**
 * The host's decisions over kernel host views: what to arm, start, evaluate and withdraw, the order in which host
 * arrivals reach the kernel, and how one input is applied. The views are `Kernel.Run.hostViewJson` output; the
 * kernel itself is replaced by a port whose states are those views, since the decisions read nothing else.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { HostView, KernelPort, ScriptSource, StepResult, WaitView } from "../src/port.ts";
import * as views from "./fixtures/host-views.ts";

const machine = await import(new URL("../dist/host-machine.js", import.meta.url).href) as
  typeof import("../src/host-machine.ts");
const { EffectResultKind, Route } = await import(new URL("../dist/port.js", import.meta.url).href) as
  typeof import("../src/port.ts");

const nothingLive = { timers: new Set<string>(), effects: new Set<string>() };
const noScripts = (): ScriptSource | null => null;

test("a start that opens an effect wait starts one Activity keyed by the effect occurrence and its failures", () => {
  const plan = machine.planHost(views.effectOpen, nothingLive, noScripts, true);
  const wait = views.effectOpen.openWaits[0]!;
  assert.deepEqual(plan.startEffects, [{
    key: machine.effectKey(wait.id, 0),
    occurrence: wait.id,
    protocol: wait.effect!.protocol,
    operation: wait.effect!.operation,
    arguments: wait.effect!.arguments,
    failures: 0,
  }]);
  assert.deepEqual([plan.armTimers, plan.cancelTimers, plan.evaluateScripts, plan.cancelEffects], [[], [], [], []]);
});

test("a live effect is not started twice", () => {
  const key = machine.effectKey(views.effectOpen.openWaits[0]!.id, 0);
  const plan = machine.planHost(views.effectOpen, { timers: new Set(), effects: new Set([key]) }, noScripts, true);
  assert.deepEqual(plan.startEffects, []);
});

test("a draining host starts no effect but still withdraws one", () => {
  const live = { timers: new Set<string>(), effects: new Set(["effect:stale"]) };
  const plan = machine.planHost(views.effectOpen, live, noScripts, false);
  assert.deepEqual(plan.startEffects, []);
  assert.deepEqual(plan.cancelEffects, ["effect:stale"]);
});

test("an incident wait starts nothing, and the retried effect is a new Activity", () => {
  const first = machine.effectKey(views.effectOpen.openWaits[0]!.id, 0);
  const incident = machine.planHost(views.incidentOpen, { timers: new Set(), effects: new Set([first]) }, noScripts, true);
  assert.deepEqual(incident.startEffects, []);
  assert.deepEqual(incident.cancelEffects, [first]);
  const retried = machine.planHost(views.effectRetried, nothingLive, noScripts, true);
  assert.equal(retried.startEffects.length, 1);
  assert.notEqual(retried.startEffects[0]!.key, first);
  assert.equal(retried.startEffects[0]!.failures, 1);
});

test("a timer wait arms one durable timer keyed by occurrence and deadline; command and user waits arm nothing", () => {
  const plan = machine.planHost(views.boundedTask, nothingLive, noScripts, true);
  const deadline = views.boundedTask.openWaits[1]!;
  assert.deepEqual(plan.armTimers, [{ key: machine.timerKey(deadline.id, 1000), timer: deadline.id, deadlineMs: 1000 }]);
  assert.deepEqual(plan.startEffects, []);
});

test("a cancelled occurrence withdraws its boundary timer", () => {
  const armed = machine.timerKey(views.boundedTask.openWaits[1]!.id, 1000);
  const plan = machine.planHost(views.boundedTaskCompleted, { timers: new Set([armed]), effects: new Set() }, noScripts, true);
  assert.deepEqual(plan.cancelTimers, [armed]);
  assert.deepEqual(plan.armTimers, []);
});

test("a deadline that cancels an effect occurrence withdraws its Activity and its own fired timer", () => {
  const before = machine.planHost(views.effectUnderDeadline, nothingLive, noScripts, true);
  const live = {
    timers: new Set(before.armTimers.map((timer) => timer.key)),
    effects: new Set(before.startEffects.map((effect) => effect.key)),
  };
  const after = machine.planHost(views.deadlineWon, live, noScripts, true);
  assert.deepEqual(after.cancelEffects, [...live.effects]);
  assert.deepEqual(after.cancelTimers, [...live.timers]);
});

test("a delivery wait needs no host work", () => {
  const plan = machine.planHost(views.messageOpen, nothingLive, noScripts, true);
  assert.deepEqual(plan, { armTimers: [], cancelTimers: [], startEffects: [], evaluateScripts: [], cancelEffects: [] });
});

test("a Script Task's effect is evaluated, with the effect's arguments as its read-only context", () => {
  const script: ScriptSource = { format: "javascript", source: "price * 2", resultVariable: "total" };
  const scriptOf = (wait: WaitView): ScriptSource | null => wait.id.elementId === "Script_Total" ? script : null;
  const plan = machine.planHost(views.scriptOpen, nothingLive, scriptOf, true);
  const wait = views.scriptOpen.openWaits[0]!;
  assert.deepEqual(plan.startEffects, []);
  assert.deepEqual(plan.evaluateScripts, [{
    key: machine.effectKey(wait.id, 0),
    occurrence: wait.id,
    script,
    context: wait.effect!.arguments,
  }]);
});

test("a completed instance withdraws everything still live", () => {
  const live = { timers: new Set(["timer:a"]), effects: new Set(["effect:b"]) };
  const plan = machine.planHost(views.completed, live, noScripts, true);
  assert.deepEqual([plan.cancelTimers, plan.cancelEffects], [["timer:a"], ["effect:b"]]);
});

test("a due timer waits for the logical time between its deadline and now, never less than zero", () => {
  assert.equal(machine.timerDelayMs(1000, 250), 750);
  assert.equal(machine.timerDelayMs(1000, 4000), 0);
});

test("queued host arrivals reach the kernel in arrival order, timers among themselves by deadline", () => {
  const timer = (deadlineMs: number) => ({
    kind: machine.ArrivalKind.Timer,
    key: `t${String(deadlineMs)}`,
    timer: views.occurrence("T"),
    deadlineMs,
  } as const);
  const effect = {
    kind: machine.ArrivalKind.Effect,
    key: "e",
    effect: views.occurrence("E"),
    result: { kind: EffectResultKind.Success, outputs: [] },
  } as const;
  assert.equal(machine.nextArrival([timer(500), effect, timer(200)]), 2);
  assert.equal(machine.nextArrival([effect, timer(500), timer(200)]), 0);
  assert.equal(machine.nextArrival([timer(200), timer(200)]), 0);
});

test("the history budget leaves room for the waits a program can have open, and an override wins", () => {
  const none = { timers: false, messages: false, effects: false, userTasks: false, calls: false, maxConcurrentWaits: 0 };
  const everything = { timers: true, messages: true, effects: true, userTasks: true, calls: true, maxConcurrentWaits: null };
  const humanOnly = { ...none, userTasks: true, maxConcurrentWaits: null };
  assert.ok(machine.historyBudget(everything, null) < machine.historyBudget(humanOnly, null));
  assert.ok(machine.historyBudget(humanOnly, null) < machine.historyBudget(none, null));
  assert.ok(machine.historyBudget(everything, null) > 0);
  assert.equal(machine.historyBudget(everything, 40), 40);
});

type FakeState = Readonly<{ view: HostView }>;
type FakeInput = Readonly<{ route: import("../src/port.ts").Route; result: StepResult<FakeState> }>;

/** A kernel whose every state is a host view and whose every input carries its own verdict. */
const fakePort: KernelPort<null, FakeState, FakeInput> = {
  decodeProgram: () => null,
  admit: () => null,
  requirements: () => ({ timers: true, messages: true, effects: true, userTasks: true, calls: false, maxConcurrentWaits: null }),
  capabilities: () => null,
  decodeStimulus: () => {
    throw new TypeError("the fake kernel decodes no stimulus");
  },
  route: (input) => input.route,
  timerInput: (timer, deadlineMs, atMs) => ({
    route: Route.TimerFire,
    result: { committed: false, rejected: true, outcome: "rejected", code: `${timer.elementId}@${String(deadlineMs)}/${String(atMs)}` },
  }),
  effectInput: (effect, result, atMs) => ({
    route: Route.EffectResult,
    result: { committed: false, rejected: true, outcome: "rejected", code: `${effect.elementId}:${result.kind}/${String(atMs)}` },
  }),
  step: (_program, _before, input) => input.result,
  hostView: (_program, state) => state.view,
  observation: () => null,
  encodeState: () => null,
  decodeState: () => ({ view: views.completed }),
  scriptOf: () => null,
};

test("a committed input yields the new state and its host view", () => {
  const applied = machine.applyInput(fakePort, null, null, {
    route: Route.Start,
    result: { committed: true, state: { view: views.effectOpen } },
  });
  assert.deepEqual(applied, { committed: true, state: { view: views.effectOpen }, view: views.effectOpen });
});

test("a refused input carries the kernel's outcome and code and no state", () => {
  const applied = machine.applyInput(fakePort, null, { view: views.effectOpen }, {
    route: Route.Command,
    result: { committed: false, rejected: false, outcome: "rolledBack", code: "no-outgoing" },
  });
  assert.deepEqual(applied, { committed: false, rejected: false, outcome: "rolledBack", code: "no-outgoing" });
});

test("a host arrival becomes the timer firing at its deadline or the effect's business result, at the host's time", () => {
  const timer = machine.arrivalInput(fakePort, {
    kind: machine.ArrivalKind.Timer,
    key: "t",
    timer: views.occurrence("Deadline"),
    deadlineMs: 1000,
  }, 1004);
  assert.equal(timer.route, Route.TimerFire);
  assert.equal(timer.result.committed ? null : timer.result.code, "Deadline@1000/1004");
  const effect = machine.arrivalInput(fakePort, {
    kind: machine.ArrivalKind.Effect,
    key: "e",
    effect: views.occurrence("Task_Probe"),
    result: { kind: EffectResultKind.TechnicalFailure },
  }, 1500);
  assert.equal(effect.result.committed ? null : effect.result.code, "Task_Probe:technicalFailure/1500");
});

test("a host-clocked stimulus gets the host's time, and one stating its own time is refused, never overridden", () => {
  assert.deepEqual(machine.clockStimulus({ kind: "deliver", commandId: "d" }, 1_700_000_000_000),
    { kind: "deliver", commandId: "d", at: 1_700_000_000_000 });
  assert.equal(machine.clockStimulus({ kind: "deliver", commandId: "d", at: 5 }, 1_700_000_000_000), null);
  assert.equal(machine.clockStimulus({ kind: "deliver", commandId: "d", at: null }, 1_700_000_000_000), null);
  assert.equal(machine.clockStimulus("not an object", 1), "not an object");
});

test("host-generated command identifiers are derived from the arrival key", () => {
  assert.equal(machine.arrivalCommandId({
    kind: machine.ArrivalKind.Timer,
    key: "timer:k",
    timer: views.occurrence("T"),
    deadlineMs: 1,
  }), "host:timer:k");
});
