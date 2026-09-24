import assert from "node:assert/strict";
import test from "node:test";

import {
  REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  ScenarioStepKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind,
  bpmnWorkflowContinuationV1,
  productionBpmnWorkflowInitialHostInput,
  requireBpmnWorkflowHostInputV1,
} from "../dist/index.js";
import {
  completeMonitoredTask,
  instanceId,
  monitoredProgram,
  start,
} from "../../../semantic-core/test/monitored-task-fixture.ts";

const program = {
  ...monitoredProgram,
  identity: {
    ...monitoredProgram.identity,
    semanticProfile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  },
};
const started = advanceScenario(program, initialState, start);
assert.equal(started.kind, ScenarioStepKind.Committed);
if (started.kind !== ScenarioStepKind.Committed) throw new Error("Start refused");
const state = started.state;
const timer = state.timerWaits[0];
assert.ok(timer);
const completed = advanceScenario(program, state, completeMonitoredTask);
assert.equal(completed.kind, ScenarioStepKind.Committed);
if (completed.kind !== ScenarioStepKind.Committed) throw new Error("Completion refused");
const noTimerState = completed.state;
assert.equal(noTimerState.timerWaits.length, 0);

const binding = {
  protocol: "bpmn-lean.subscription-timer.v1",
  timer: { id: timer.id, logicalDeadlineMs: timer.deadlineMs, dueTimeMs: 2_000 },
} as const;
const noTimerBinding = { protocol: binding.protocol, timer: null } as const;
const host = {
  ...productionBpmnWorkflowInitialHostInput(),
  protocol: bpmnWorkflowContinuationV1,
  kind: BpmnWorkflowHostInputKind.Continuation,
  runOrdinal: 2,
  firstExecutionRunId: "first-run",
  definition: program.identity,
  processId: program.processId,
  processInstanceId: instanceId,
  startCommandId: start.commandId,
  publicationSegmentDirectorySha256: "a".repeat(64),
  completedMessageDeliveryRecords: [],
} as const;

test("continuation carries the strict non-null subscription Timer binding", () => {
  const input = { ...host, subscriptionTimer: binding };
  assert.deepEqual(requireBpmnWorkflowHostInputV1(input), input);
});

test("continuation carries the explicit null subscription Timer binding", () => {
  const input = { ...host, subscriptionTimer: noTimerBinding };
  assert.deepEqual(requireBpmnWorkflowHostInputV1(input), input);
});

test("legacy continuation bytes remain unchanged without a subscription field", () => {
  const input = { ...host, definition: monitoredProgram.identity };
  assert.equal(JSON.stringify(requireBpmnWorkflowHostInputV1(input)), JSON.stringify(input));
  assert.equal(Object.hasOwn(requireBpmnWorkflowHostInputV1(input), "subscriptionTimer"), false);
});

test("initial host input never admits a subscription Timer binding", () => {
  for (const subscriptionTimer of [binding, noTimerBinding, undefined]) {
    assert.throws(() => requireBpmnWorkflowHostInputV1({
      ...productionBpmnWorkflowInitialHostInput(), subscriptionTimer,
    }), TypeError);
  }
});

const malformedBindings: ReadonlyArray<readonly [string, unknown]> = [
  ["undefined field", undefined],
  ["missing protocol", { timer: null }],
  ["missing timer", { protocol: binding.protocol }],
  ["undefined timer", { protocol: binding.protocol, timer: undefined }],
  ["wrong version", { ...binding, protocol: "bpmn-lean.subscription-timer.v2" }],
  ["unknown inner field", { ...binding, extra: true }],
  ["unknown timer field", { ...binding, timer: { ...binding.timer, extra: true } }],
  ["missing identity", { ...binding, timer: { logicalDeadlineMs: 1_000, dueTimeMs: 2_000 } }],
  ["unknown identity field", { ...binding, timer: { ...binding.timer, id: { ...timer.id, extra: true } } }],
  ["missing activation", { ...binding, timer: { ...binding.timer, id: {
    processInstanceId: timer.id.processInstanceId, elementId: timer.id.elementId,
  } } }],
  ["zero activation", { ...binding, timer: { ...binding.timer, id: { ...timer.id, activation: 0 } } }],
  ["fractional activation", { ...binding, timer: { ...binding.timer, id: { ...timer.id, activation: 1.5 } } }],
  ["unsafe activation", { ...binding, timer: { ...binding.timer, id: { ...timer.id, activation: Number.MAX_SAFE_INTEGER + 1 } } }],
  ["empty instance", { ...binding, timer: { ...binding.timer, id: { ...timer.id, processInstanceId: "" } } }],
  ["invalid element string", { ...binding, timer: { ...binding.timer, id: { ...timer.id, elementId: "\ud800" } } }],
  ...["logicalDeadlineMs", "dueTimeMs"].flatMap((field) =>
    [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, "1000", undefined]
      .map((value): readonly [string, unknown] => [
        `${field} rejects ${String(value)}`,
        { ...binding, timer: { ...binding.timer, [field]: value } },
      ])),
];
for (const [name, subscriptionTimer] of malformedBindings) {
  test(`strict subscription Timer decoder rejects ${name}`, () => {
    assert.throws(() => requireBpmnWorkflowHostInputV1({ ...host, subscriptionTimer }), TypeError);
  });
}

test("standalone subscription decoder preserves the plain-data boundary", async () => {
  const { requireBpmnSubscriptionTimerBindingV1: decode } = await import("../dist/subscription-timer-binding.js");
  assert.deepEqual(decode(binding), binding);
  assert.deepEqual(decode(noTimerBinding), noTimerBinding);
  let accessed = false;
  const getter = { protocol: binding.protocol, get timer() { accessed = true; return null; } };
  assert.throws(() => decode(getter), TypeError);
  assert.equal(accessed, false);
  assert.throws(() => decode({ ...binding, [Symbol("hidden")]: true }), TypeError);
  assert.throws(() => decode(Object.assign(Object.create({ inherited: true }), binding)), TypeError);
  for (const [, malformed] of malformedBindings) assert.throws(() => decode(malformed), TypeError);
});

test("subscription binding validates exact committed Timer and exact null without changing state", async () => {
  const { requireSubscriptionTimerBindingForState: validate } = await import("../dist/subscription-timer-binding.js");
  const before = structuredClone(state);
  assert.deepEqual(validate(program, state, binding), binding);
  assert.deepEqual(validate(program, noTimerState, noTimerBinding), noTimerBinding);
  assert.deepEqual(state, before);
  assert.equal(Object.hasOwn(state, "subscriptionTimer"), false);
  assert.equal(validate(monitoredProgram, state, undefined), undefined);
});

test("subscription binding is required only for the exact subscription profile", async () => {
  const { requireSubscriptionTimerBindingForState: validate } = await import("../dist/subscription-timer-binding.js");
  assert.throws(() => validate(program, state, undefined), TypeError);
  assert.throws(() => validate(program, noTimerState, undefined), TypeError);
  for (const value of [binding, noTimerBinding]) {
    assert.throws(() => validate(monitoredProgram, state, value), TypeError);
  }
  const nearProfile = { ...program, identity: { ...program.identity,
    semanticProfile: `${program.identity.semanticProfile}-other`,
  } };
  assert.throws(() => validate(nearProfile, state, binding), TypeError);
});

test("subscription binding checks Timer cardinality before accepting a matching member", async () => {
  const { requireSubscriptionTimerBindingForState: validate } = await import("../dist/subscription-timer-binding.js");
  assert.throws(() => validate(program, state, noTimerBinding), TypeError);
  assert.throws(() => validate(program, noTimerState, binding), TypeError);
  const other = { ...timer, id: { ...timer.id, activation: timer.id.activation + 1 } };
  for (const timerWaits of [[timer, other], [other, timer], [timer, timer]]) {
    assert.throws(() => validate(program, { ...state, timerWaits }, binding), TypeError);
    assert.throws(() => validate(program, { ...state, timerWaits }, noTimerBinding), TypeError);
  }
});

test("subscription binding rejects stale complete identity and logical deadline", async () => {
  const { requireSubscriptionTimerBindingForState: validate } = await import("../dist/subscription-timer-binding.js");
  for (const id of [
    { ...timer.id, processInstanceId: "other-instance" },
    { ...timer.id, elementId: "other-element" },
    { ...timer.id, activation: timer.id.activation + 1 },
  ]) {
    assert.throws(() => validate(program, state, { ...binding, timer: { ...binding.timer, id } }), TypeError);
  }
  assert.throws(() => validate(program, state, {
    ...binding, timer: { ...binding.timer, logicalDeadlineMs: timer.deadlineMs + 1 },
  }), TypeError);
});

test("subscription physical due time is opaque apart from safe nonnegative integer shape", async () => {
  const { requireSubscriptionTimerBindingForState: validate } = await import("../dist/subscription-timer-binding.js");
  for (const dueTimeMs of [0, Number.MAX_SAFE_INTEGER]) {
    const candidate = { ...binding, timer: { ...binding.timer, dueTimeMs } };
    assert.deepEqual(validate(program, state, candidate), candidate);
  }
});
