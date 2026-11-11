/**
 * Which root start an input starts, and the per-input facts `step` resets: an unnamed trigger that fires two starts is
 * ambiguous, a named one starts the start it names among those fired; a delivery carrying variables is not admitted;
 * the outbox of Signals an input threw to the population holds only that input's broadcasts, which the host view
 * publishes with public origins.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { SignalAddressTag, admit, decodeProgram, hooks, hostView, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import { activity, append, base, duration, flow, replace, start, userWork, wired, withFlows } from "./admission-refusal-support.ts";
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

test("a Timer trigger naming one of the starts it fires starts that one", () => {
  const started = committed(run(twoTimerStarts, null, timerStart("S2")));
  assert.deepEqual(started.openItems.map((item) => item.element), ["T"]);
});

const userTask = { processInstanceId: "I", elementId: "T", activation: 1 };

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
