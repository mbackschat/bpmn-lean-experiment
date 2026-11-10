/**
 * Timer recurrence (PC-TIMER-02, I1): a non-interrupting boundary on a User Task repeats a finite ISO cycle `n`
 * times at arming + k·period, `remaining` counting the firings left including the open one, and a Cron cycle at each
 * next match over UTC after the deadline it fired at; a cycle on a site that fires once waits for its first occurrence
 * only, published without recurrence. Dated intervals stay refused (`timer.cycle`).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import { activity, base, boundary, catchEvent, cycle, flow, replace, task, userWork, withFlows } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const handlerEnd: Json = {
  event: {
    header: { id: "EB", origin: { definition: null, sourceId: "EB" }, sourceType: "endEvent", parent: null },
    payload: { role: { throw: { record: "none" } }, placement: "finish", incoming: ["fb"], outgoing: [], alternativeThrows: [] },
  },
};

/** `S → T (User Task with boundary B on `lexeme`) → E`, `B → EB`. */
function hostProgram(lexeme: string, interrupting: boolean): Program {
  const host = task(activity("T", userWork(), { boundaries: [boundary("B", cycle(lexeme), { interrupting, outgoing: ["fb"] })] }))(base());
  const json = withFlows({ ...host, elements: [...(host.elements as Json[]), handlerEnd] }, flow("fb", "B", "EB"));
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
}

function run(program: Program, state: State | null, stimulus: Json): Outcome {
  const input = stimulusFromJson(stimulus);
  assert.ok(input.ok);
  return step(hooks, program, state, input.value[1]);
}

type Timer = { deadlineMs: number; recurrence: { periodMs: number | null; cron: string | null; remaining: number | null } | null };

function timers(state: State, element: string): Array<{ detail: Timer }> {
  return state.openItems
    .filter((item) => item.element === element && (item.kind as { tag: string }).tag === "timer")
    .map((item) => ({ detail: (item.kind as unknown as { detail: Timer }).detail }));
}

function started(program: Program): State {
  const outcome = run(program, null, { kind: "start", commandId: "start", instanceId: "I", variables: [] });
  assert.ok(outcome.ok, outcome.ok ? "" : outcome.failure.code);
  return outcome.value;
}

function fire(program: Program, state: State, element: string, logicalTimeMs: number, activation: number): Outcome {
  return run(program, state, {
    kind: "timerFire", commandId: `fire-${logicalTimeMs}`, logicalTimeMs,
    occurrence: { processInstanceId: "I", elementId: element, activation },
  });
}

test("a finite cycle fires n times, one period apart, counting down what remains", () => {
  const program = hostProgram("R3/PT10S", false);
  assert.equal(admit(program), null);
  let state = started(program);
  const seen: Array<[number, number | null]> = [];
  for (const [activation, at] of [[1, 10_000], [2, 20_000], [3, 30_000]] as const) {
    const [open] = timers(state, "B");
    assert.ok(open !== undefined);
    seen.push([open.detail.deadlineMs, open.detail.recurrence?.remaining ?? null]);
    const fired = fire(program, state, "B", at, activation);
    assert.ok(fired.ok, fired.ok ? "" : fired.failure.code);
    state = fired.value;
  }
  assert.deepEqual(seen, [[10_000, 3], [20_000, 2], [30_000, 1]]);
  assert.deepEqual(timers(state, "B"), []);
});

test("a Cron cycle fires at each next match after the deadline it fired at", () => {
  const program = hostProgram("0/30 * * * * ?", false);
  assert.equal(admit(program), null);
  let state = started(program);
  assert.deepEqual(timers(state, "B").map((open) => open.detail), [
    { deadlineMs: 30_000, recurrence: { periodMs: null, cron: "0/30 * * * * ?", remaining: null } },
  ]);
  const fired = fire(program, state, "B", 30_000, 1);
  assert.ok(fired.ok, fired.ok ? "" : fired.failure.code);
  state = fired.value;
  assert.deepEqual(timers(state, "B").map((open) => open.detail.deadlineMs), [60_000]);
});

test("a cycle on an interrupting boundary waits for its first occurrence only", () => {
  const program = hostProgram("R3/PT10S", true);
  assert.equal(admit(program), null);
  assert.deepEqual(timers(started(program), "B").map((open) => open.detail), [{ deadlineMs: 10_000, recurrence: null }]);
});

test("a cycle on a catch Event waits for its first occurrence only", () => {
  const json = replace(base(), "T", { ...catchEvent("T", cycle("R3/PT10S")) });
  const element = (json.elements as Json[]).find((entry) => "event" in entry) as { event: { payload: Json } };
  element.event.payload.outgoing = ["f2"];
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  assert.deepEqual(timers(started(decoded.value), "T").map((open) => open.detail), [{ deadlineMs: 10_000, recurrence: null }]);
});

const refused: ReadonlyArray<readonly [string, string]> = [
  ["R2/1970-01-01T00:01:00Z/PT20S", "timer.cycle"],
  ["R0/PT10S", "timer.cycle"],
  ["R+3/PT10S", "timer.cycle"],
  ["R/P1M", "timer.cycle"],
  ["0 0 12 L * ?", "timer.cron"],
  ["0 0 12 ? * MON", "timer.cron"],
  ["0 0 12 1 * 2", "timer.cron"],
  ["0 0 12 * * ? 2030", "timer.cron"],
  // Malformed for CIB's parser, refused under `malformedTimer = refused`.
  ["Rx/PT10S", "timer.cycle"],
  ["61 * * * * ?", "timer.cron"],
];

for (const [lexeme, code] of refused) {
  test(`the cycle ${lexeme} is refused as ${code}`, () => {
    assert.equal(admit(hostProgram(lexeme, false)), code);
  });
}
