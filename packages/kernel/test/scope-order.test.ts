/**
 * Scope occurrences ordered by their order positions (DC25): a scope occurrence takes a position when it is entered,
 * pending under the entering unit until the commit numbers it, and the readers that order scope occurrences read it:
 * which idle one completes first (`idleScope?`) and the order a clearing cancels them in (`subtree`). Under
 * `orderInvariant` that order is the breadth-first order of the entering units, read from no run log.
 *
 * The model forks to an intermediate Signal throw `X`, to the Sub-Process `A` and, in the waiting variant, to the User
 * Task `W` before a Terminate End. `X` begins the non-interrupting Signal Event Sub-Process `H` in the signal cascade its
 * token starts, which drains before the token to `A` moves, so `H` is entered first while `A`'s unit is the shallower
 * one: the run order of the entries and their position order differ for this model, which the tests assert first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, end, eventSubProcess, flow, gateway, replace, scope, signal, signalThrow, start, terminateThrow,
  throwing, userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

/** The forked model; `waiting` puts a User Task inside `A` and `H` and adds the branch `W` that terminates the instance. */
function forked(schedule: string, waiting: boolean): Program {
  const inner = (id: string): Json[] => waiting
    ? [activity(`${id}T`, userWork(), {}, id), end(`${id}E`, "none", id)]
    : [end(`${id}E`, "none", id)];
  const innerFlows = (id: string): Json[] => waiting
    ? [flow(`${id}1`, `${id}S`, `${id}T`), flow(`${id}2`, `${id}T`, `${id}E`)]
    : [flow(`${id}1`, `${id}S`, `${id}E`)];
  const json = withFlows(
    append(replace(base(), "T", gateway("P", "parallel", { outgoing: ["p1", "p2", ...(waiting ? ["p3"] : [])] })),
      throwing("X", signalThrow), end("XE"),
      scope("A", "embedded"), start("AS", null, [], "A"), ...inner("A"), end("AEnd"),
      scope("H", eventSubProcess(signal(), false)), start("HS", signal(), [], "H"), ...inner("H"),
      ...(waiting ? [activity("W", userWork()), end("WE", terminateThrow)] : [])),
    flow("p0", "S", "P"), flow("pe", "P", "E"), flow("p1", "P", "X"), flow("x1", "X", "XE"), flow("p2", "P", "A"),
    flow("a1", "A", "AEnd"), ...innerFlows("A"), ...innerFlows("H"),
    ...(waiting ? [flow("p3", "P", "W"), flow("w1", "W", "WE")] : []));
  const decoded = decodeProgram(wired(withOptions(json, { branchSchedule: schedule })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

function run(program: Program, state: State | null, json: Json): State {
  const input = stimulusFromJson(json);
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  const outcome = step(program, state, input.value[1]);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

const begin: Json = { kind: "start", commandId: "start", instanceId: "I", variables: [] };
const scopes = new Set(["A", "H"]);

/** The order the closure began `A` and `H` in, and the order their idle scope occurrences completed in. */
function entriesAndIdles(state: State): readonly [readonly string[], readonly string[]] {
  const entries = state.journal.flatMap((transition) => transition.started.map((fact) => fact.occurrence.element))
    .filter((element) => scopes.has(element));
  const idles = state.journal.flatMap((transition) =>
    transition.cause.tag === "idle" && transition.element !== null && scopes.has(transition.element) ? [transition.element] : []);
  return [entries, idles];
}

test("under orderInvariant two scope occurrences one closure enters turn idle in the breadth order of their entering units", () => {
  const [entries, idles] = entriesAndIdles(run(forked("orderInvariant", false), null, begin));
  assert.deepEqual(entries, ["H", "A"], "H is entered first");
  assert.deepEqual(idles, ["A", "H"]);
});

test("under declarationDepthFirst the same scope occurrences turn idle in the order they were entered", () => {
  const [entries, idles] = entriesAndIdles(run(forked("declarationDepthFirst", false), null, begin));
  assert.deepEqual(entries, ["H", "A"]);
  assert.deepEqual(idles, ["H", "A"]);
});

test("under orderInvariant a clearing cancels the scope occurrences of one level in their position order", () => {
  const program = forked("orderInvariant", true);
  const started = run(program, null, begin);
  assert.deepEqual(started.scopes.map((entry) => entry.id), ["", "1:H#0/", "1:A#0/"], "H is entered first");
  const completed = run(program, started, {
    kind: "command", commandId: "complete-W", occurrence: { processInstanceId: "I", elementId: "W", activation: 1 },
    action: { kind: "completeUserTask", values: [] },
  });
  const cancelled = completed.journal.flatMap((transition) => transition.ended)
    .flatMap(([key, terminal]) => terminal === "cancelled" && (key.element === "AT" || key.element === "HT") ? [key.element] : []);
  // A clearing journals the scope occurrences inside out, the reverse of `subtree`'s order, which puts `A` before `H`.
  assert.deepEqual(cancelled, ["HT", "AT"]);
});
