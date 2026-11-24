/**
 * Every join under `orderInvariant` fires as its slot's own unit (DC16): an arrival only parks, and the slot fires once
 * the closure is otherwise quiescent, consuming on each flow the arrival of least order position and continuing with the
 * consumed one of greatest (DC15 (b)). Under `declarationDepthFirst` the arrival that makes a join ready fires it in
 * place, as CIB continues the arriving execution.
 *
 * The model forks to a Signal throw `X`, the Task `T` and the Parallel join `J` directly. `X` and `T` both reach `J`
 * on the flow `m` through the Task `M`, the direct branch on `p3`. The throw's completion runs as a signal before the
 * token to `T` moves, so the arrival through `X` reaches `J` before the one through `T`, though its unit is the deeper
 * one: the arrivals' run order and their position order differ. Fired in place, `J` fires when the arrival through `X`
 * completes it, before the arrival through `T` exists, and keeps that one parked; fired as its own unit, it sees both
 * on `m` and consumes the one of least position, the arrival through `T`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Program, State } from "@bpmn-lean/kernel";

import {
  activity, base, end, eventSubProcess, flow, gateway, model, scope, signal, signalThrow, start, throwing, userWork, wired,
  withOptions,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const task = (id: string): Json => activity(id, "manual");

/** The forked model under `schedule`, its join `J` of kind `kind`. */
function forked(schedule: string, kind: Json | string): Program {
  const json = model([
    start("S"), gateway("P", "parallel"), throwing("X", signalThrow), task("T"), task("M"), gateway("J", kind),
    activity("U", userWork()), end("E"),
    scope("H", eventSubProcess(signal(), false)), start("HS", signal(), [], "H"), end("HE", "none", "H"),
  ], [
    flow("s", "S", "P"), flow("p1", "P", "X"), flow("p2", "P", "T"), flow("p3", "P", "J"), flow("x1", "X", "M"),
    flow("t1", "T", "M"), flow("m", "M", "J"), flow("j", "J", "U"), flow("u", "U", "E"), flow("h", "HS", "HE"),
  ])(base());
  const decoded = decodeProgram(wired(withOptions(json, { branchSchedule: schedule })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

function started(program: Program): State {
  const input = stimulusFromJson({ kind: "start", commandId: "start", instanceId: "I", variables: [] });
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  const outcome = step(program, null, input.value[1]);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

/** Per transition naming `J`: its cause, the activations of `J` it began and those it ended. */
function joinTransitions(state: State): readonly string[] {
  return state.journal.flatMap((transition) => {
    const begun = transition.started.filter((fact) => fact.occurrence.element === "J").map((fact) => fact.occurrence.activation);
    const ended = transition.ended.filter(([key]) => key.element === "J").map(([key]) => key.activation);
    return transition.element === "J" || begun.length > 0 || ended.length > 0
      ? [`${transition.cause.tag} began ${begun.join(",")} ended ${ended.join(",")}`] : [];
  });
}

/** The activations of the occurrences parked at `J`. */
function parkedAtJ(state: State): readonly number[] {
  return state.slots.parked.map((waiting) => state.occurrences.find((occurrence) => occurrence.id === waiting.occurrence))
    .map((occurrence) => occurrence?.activation ?? 0);
}

test("under orderInvariant a Parallel join fires as its own unit after every arrival parked, keeping the greatest", () => {
  const state = started(forked("orderInvariant", "parallel"));
  // `J` 1 arrives on `p3`, `J` 2 through `X` and `J` 3 through `T`, each only parking; the slot then fires in an idle
  // transition of its own, and the consumed occurrences' completions run as its batch, `J` 1 ending with none.
  assert.deepEqual(joinTransitions(state), [
    "arrive began 1 ended ", "arrive began 2 ended ", "arrive began 3 ended ", "idle began  ended ",
    "signal began  ended 1", "signal began  ended 3",
  ]);
  assert.deepEqual(parkedAtJ(state), [2], "the arrival through X, of greater position on m, stays parked");
});

test("under declarationDepthFirst the same Parallel join fires in place, in the arrival that completes it", () => {
  const state = started(forked("declarationDepthFirst", "parallel"));
  assert.ok(joinTransitions(state).every((line) => !line.startsWith("idle")), joinTransitions(state).join("; "));
});

test("under orderInvariant an Inclusive join fires as its own unit too", () => {
  const state = started(forked("orderInvariant", { inclusive: { candidates: [], default: null } }));
  assert.ok(joinTransitions(state).some((line) => line.startsWith("idle")), joinTransitions(state).join("; "));
});
