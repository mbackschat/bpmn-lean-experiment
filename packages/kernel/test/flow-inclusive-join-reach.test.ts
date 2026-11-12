/**
 * PC-CF-04: an Inclusive join's reach through a loop. The join fires once no position of its scope occurrence can
 * reach an incoming flow that holds no token without passing the gateway (BPMN 2.0.2 §13.4.3, Table 13.3); the search
 * visits each flow once, so a position inside a loop that never leads to the empty flow ends the search instead of
 * keeping the join waiting until the search's fuel runs out ([flow spec](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#inclusive-join-activation-and-reach)).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, base, end, flow, gateway, start, userWork, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";

const literal = (value: boolean): Json => ({ simpleBoolean: { body: { literal: { value } } } });

/**
 * `S -> X`, an Exclusive split whose default `x1` reaches the Parallel fork `P` and whose `x2`, never taken, the User
 * Task `Z`. `P` sends `p1` straight to the Inclusive join `J` and `p2` to the User Task `Y`, which enters the loop
 * `M -> K -> k1 -> M`; `K` leaves it by `k2` to `exit`. `Z` enters `J` by `jz`, and `J` leads to the User Task `Done`.
 */
function program(exit: "EY" | "Z"): Json {
  const elements = [
    start("S"), gateway("X", { exclusive: { candidates: ["x2"], default: "x1" } }), activity("Z", userWork()),
    gateway("P", "parallel"), activity("Y", userWork()), gateway("M", { exclusive: { candidates: [], default: null } }),
    gateway("K", { exclusive: { candidates: ["k1"], default: "k2" } }), end("EY"),
    gateway("J", { inclusive: { candidates: [], default: null } }), activity("Done", userWork()), end("E"),
  ];
  const flows = [
    flow("f1", "S", "X"), flow("x1", "X", "P"), flow("x2", "X", "Z", literal(false)), flow("p1", "P", "J"), flow("p2", "P", "Y"),
    flow("y", "Y", "M"), flow("m", "M", "K"), flow("k1", "K", "M", literal(false)), flow("k2", "K", exit), flow("jz", "Z", "J"),
    flow("j", "J", "Done"), flow("f2", "Done", "E"),
  ];
  return wired({ ...base(), elements, flows });
}

/** The User Tasks open after the instance starts. */
function openAfterStart(json: Json): readonly string[] {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  const stimulus = stimulusFromJson({ kind: "start", commandId: "start", instanceId: "I", variables: [] });
  assert.ok(stimulus.ok);
  const outcome = step(decoded.value, null, stimulus.value[1]);
  assert.ok(outcome.ok);
  return outcome.value.openItems.map((item) => item.element).sort();
}

test("an Inclusive join fires while a loop that cannot reach its empty incoming flow holds a position", () => {
  assert.deepEqual(openAfterStart(program("EY")), ["Done", "Y"]);
});

test("an Inclusive join waits while a loop whose exit reaches its empty incoming flow holds a position", () => {
  assert.deepEqual(openAfterStart(program("Z")), ["Y"]);
});
