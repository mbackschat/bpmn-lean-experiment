/**
 * Which root start an input starts, and the per-input facts `step` resets: an unnamed trigger that fires two starts is
 * ambiguous, a named one starts the start it names among those fired; a Conditional start fires on its predicate over
 * the submitted variables, a Signal start on its address, and a Message start writes its payload by the catch rule;
 * a delivery carrying variables is not admitted;
 * the outbox of Signals an input threw to the population holds only that input's broadcasts, which the host view
 * publishes with public origins.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { SignalAddressTag, admit, decodeProgram, hooks, hostView, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, duration, flow, juel, mapping, message, replace, signal, start, text, userWork, variable, wired, withFlows, withOptions,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

function decoded(json: Json): Program {
  const program = decodeProgram(wired(json));
  assert.ok(program.ok, program.ok ? "" : program.refusal);
  return program.value;
}

function admitted(json: Json): Program {
  const program = decoded(json);
  assert.equal(admit(program), null);
  return program;
}

/**
 * Two Timer starts `S1` and `S2`, each leading to the User Task `T`. Admission refuses the combination
 * (`start.rootCombination`); `step` still picks no start for an unnamed input that fires both.
 */
const twoTimerStarts = decoded(withFlows(
  append(replace(replace(base(), "S", start("S1", duration("PT1S"))), "T", activity("T", userWork())), start("S2", duration("PT2S"))),
  flow("f1", "S1", "T"), flow("f3", "S2", "T")));

/** Two None starts `S1` and `S2`, each leading to the User Task `T`; admission refuses them as it does two Timer starts. */
const twoNoneStarts = decoded(withFlows(
  append(replace(replace(base(), "S", start("S1")), "T", activity("T", userWork())), start("S2")),
  flow("f1", "S1", "T"), flow("f3", "S2", "T")));

/** `S -> T -> E` with `T` a User Task. */
const waiting = admitted(replace(base(), "T", activity("T", userWork())));

function run(program: Program, state: State | null, stimulus: Json): Outcome {
  const input = stimulusFromJson(stimulus);
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  return step(hooks, program, state, input.value[1]);
}

function committed(outcome: Outcome): State {
  assert.ok(outcome.ok, outcome.ok ? "" : outcome.failure.code);
  return outcome.value;
}

const timerStart = (startEvent?: string): Json => ({
  kind: "start", commandId: "start", instanceId: "I", variables: [], trigger: { kind: "timer", logicalTimeMs: 1_000 },
  ...(startEvent === undefined ? {} : { startEvent }),
});

test("an unnamed Timer trigger that fires two root starts is ambiguous", () => {
  const outcome = run(twoTimerStarts, null, timerStart());
  assert.deepEqual(outcome.ok ? null : outcome.failure, { tag: "rejected", code: "start-ambiguous" });
});

test("an unnamed None input with two None starts is ambiguous, and a named one starts the start it names", () => {
  const outcome = run(twoNoneStarts, null, { kind: "start", commandId: "start", instanceId: "I", variables: [] });
  assert.deepEqual(outcome.ok ? null : outcome.failure, { tag: "rejected", code: "start-ambiguous" });
  const started = committed(run(twoNoneStarts, null, { kind: "start", commandId: "start", instanceId: "I", variables: [], startEvent: "S2" }));
  assert.deepEqual(started.openItems.map((item) => item.element), ["T"]);
});

test("a Timer trigger naming one of the starts it fires starts that one", () => {
  const started = committed(run(twoTimerStarts, null, timerStart("S2")));
  assert.deepEqual(started.openItems.map((item) => item.element), ["T"]);
});

const userTask = { processInstanceId: "I", elementId: "T", activation: 1 };

test("a start applied to an instance that has already started is rejected, since only the state before it takes a start", () => {
  const started = committed(run(waiting, null, { kind: "start", commandId: "start", instanceId: "I", variables: [] }));
  const outcome = run(waiting, started, { kind: "start", commandId: "again", instanceId: "I", variables: [] });
  assert.deepEqual(outcome.ok ? null : outcome.failure, { tag: "rejected", code: "instance-already-started" });
});

test("a delivery carrying variables is not admitted", () => {
  const started = committed(run(waiting, null, { kind: "start", commandId: "start", instanceId: "I", variables: [] }));
  const outcome = run(waiting, started, {
    kind: "deliver", commandId: "d", occurrence: userTask, trigger: { kind: "signal", name: "S" },
    variables: [{ name: "x", value: { kind: "string", value: "y" } }],
  });
  assert.deepEqual(outcome.ok ? null : outcome.failure, { tag: "rejected", code: "delivery-variables-not-admitted" });
});

test("an input starts with an empty outbox, and the host view publishes a broadcast with its public origin", () => {
  const started = committed(run(waiting, null, { kind: "start", commandId: "start", instanceId: "I", variables: [] }));
  const thrown: State = {
    ...started,
    outbox: [{
      address: { tag: SignalAddressTag.Named, name: "S" }, variables: [], businessKey: null,
      origin: { processInstanceId: "I", element: "T", activation: 1 },
    }],
  };
  assert.deepEqual(hostView(waiting, thrown).broadcasts.map((intent) => intent.origin),
    [{ processInstanceId: "I", element: "T", activation: 1 }]);
  const completed = committed(run(waiting, thrown, {
    kind: "command", commandId: "c", occurrence: userTask, action: { kind: "completeUserTask", values: [] },
  }));
  assert.deepEqual(completed.outbox, []);
});

/** `S -> T -> E` whose start `S` waits for `trigger`, with `T` a User Task, under `options`. */
const startingOn = (trigger: Json, options: Json = {}, outputs: Json[] = []): Program => decoded({
  ...withOptions(replace(replace(base(), "S", start("S", trigger, outputs)), "T", activity("T", userWork())), options),
  variables: ["received", "shift"],
});

const integer = (value: number): Json => ({ kind: "integer", value });

const startWith = (trigger: Json, variables: Json[] = [], startEvent?: string): Json => ({
  kind: "start", commandId: "start", instanceId: "I", variables, trigger, ...(startEvent === undefined ? {} : { startEvent }),
});

const rejected = (outcome: Outcome): unknown => (outcome.ok ? null : outcome.failure);

/** `${amount >= 1000}` under JUEL, filtered on `variableName` when given. */
const largeOrder = (variableName: string | null = null): Json => ({
  condition: {
    payload: {
      condition: juel({ identifier: { name: "amount" } }, { integer: { digits: "1000" } }, { binary: { payload: { op: "ge", left: 0, right: 1 } } }),
      variableName, variableEvents: [],
    },
  },
});

const conditional = { conditionalStart: "submittedContext", evaluator: "juel", conditionalRetrigger: "eachWrite" };

test("a Conditional root start fires on its predicate over the submitted variables alone", () => {
  const program = startingOn(largeOrder(), conditional);
  const condition = { kind: "condition" };
  assert.deepEqual(committed(run(program, null, startWith(condition, [{ name: "amount", value: integer(2500) }]))).openItems
    .map((item) => item.element), ["T"]);
  assert.deepEqual(rejected(run(program, null, startWith(condition, [{ name: "amount", value: integer(10) }]))),
    { tag: "rejected", code: "no-start-event" });
  assert.deepEqual(rejected(run(program, null, startWith(condition))), { tag: "rejected", code: "no-start-event" });
  const flagged = startingOn({ condition: { payload: { condition: juel({ identifier: { name: "expedite" } }), variableName: null, variableEvents: [] } } },
    conditional);
  assert.deepEqual(rejected(run(flagged, null, startWith(condition, [{ name: "expedite", value: { kind: "null" } }]))),
    { tag: "rolledBack", code: "condition-not-boolean" });
});

test("a Conditional root start filtered on a variable the input does not submit does not fire", () => {
  const program = startingOn(largeOrder("urgent"), conditional);
  assert.deepEqual(rejected(run(program, null, startWith({ kind: "condition" }, [{ name: "amount", value: integer(2500) }]))),
    { tag: "rejected", code: "no-start-event" });
});

test("a named Conditional input evaluates only the start it names", () => {
  const failing = { condition: { payload: { condition: juel({ identifier: { name: "flag" } }), variableName: null, variableEvents: [] } } };
  const program = decoded(withFlows(append(
    withOptions(replace(replace(base(), "S", start("S", largeOrder())), "T", activity("T", userWork())), conditional),
    start("S2", failing)), flow("f9", "S2", "T")));
  const variables = [{ name: "amount", value: integer(2500) }, { name: "flag", value: { kind: "null" } }];
  assert.ok(committed(run(program, null, startWith({ kind: "condition" }, variables, "S"))));
  assert.deepEqual(rejected(run(program, null, startWith({ kind: "condition" }, variables))),
    { tag: "rolledBack", code: "condition-not-boolean" });
});

test("a Signal root start fires on its Signal's QName under the identifier reading, never on a name", () => {
  const program = startingOn(signal());
  assert.ok(committed(run(program, null, startWith({ kind: "signal", signalRef: { id: "Sig" }, variables: [] }))));
  assert.deepEqual(rejected(run(program, null, startWith({ kind: "signal", name: "S", variables: [] }))),
    { tag: "rejected", code: "no-start-event" });
});

test("a Signal start carrying variables is rejected while a Signal carries no data, and installs them otherwise", () => {
  const variables = [{ name: "shift", value: integer(1) }];
  const trigger = { kind: "signal", signalRef: { id: "Sig" }, variables };
  assert.deepEqual(rejected(run(startingOn(signal()), null, startWith(trigger))),
    { tag: "rejected", code: "signal-variables-not-admitted" });
  const started = committed(run(startingOn(signal(), { signalPayload: "variables" }), null, startWith(trigger)));
  assert.deepEqual(started.variables.find((entry) => entry.scope === 0)?.entries.map(([name]) => name), ["shift"]);
});

test("a Message root start requires a payload exactly when it writes one", () => {
  const named = message({ messageRef: "M", name: text("M") });
  const channel = { kind: "directMessage", messageId: "M" };
  const carrying = (payload?: Json): Json => ({ kind: "message", channel, ...(payload === undefined ? {} : { payload }) });
  const writing = startingOn(named, {}, [mapping("received", variable("payload"))]);
  assert.deepEqual(rejected(run(writing, null, startWith(carrying()))), { tag: "rejected", code: "message-payload-required" });
  const started = committed(run(writing, null, startWith(carrying(integer(7)))));
  assert.deepEqual(started.variables.find((entry) => entry.scope === 0)?.entries, [["received", { tag: "int", value: 7 }]]);
  assert.deepEqual(rejected(run(startingOn(named), null, startWith(carrying(integer(7))))),
    { tag: "rejected", code: "message-payload-not-accepted" });
});
