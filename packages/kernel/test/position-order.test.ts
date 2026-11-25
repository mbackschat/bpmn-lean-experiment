/**
 * Order positions numbered at commit (DC13): an open item's position is pending under the unit that opened it until the
 * commit numbers it in the closure's position order, which under `orderInvariant` is the breadth-first order of the
 * units, read from no run log, so the published order of open waits is a function of the closure's end state. Every
 * occurrence takes a position from the same counter when its identity is issued, so the waits' positions are not
 * consecutive.
 *
 * The model forks to an Event-Based Gateway `G`, whose arms `C1` and `C2` wait on Conditions, and to the User Task `W`.
 * The token to `G` runs first, so `C1` and `C2` open before `W` in run order, while `W`'s unit is the shallower one.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, hostView, step, stimulusFromJson } from "./lean-paired.ts";
import type { Program } from "@bpmn-lean/kernel";

import {
  activity, append, base, catchEvent, end, flow, gateway, juel, replace, userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const atLeast = (threshold: number): Json => ({
  condition: {
    payload: {
      condition: juel({ identifier: { name: "amount" } }, { integer: { digits: String(threshold) } },
        { binary: { payload: { op: "ge", left: 0, right: 1 } } }),
      variableName: null, variableEvents: [],
    },
  },
});

function forked(): Program {
  const json = withFlows(
    append(replace(base(), "T", gateway("P", "parallel", { outgoing: ["p1", "p2"] })),
      gateway("G", { eventBased: { instantiation: "none" } }), catchEvent("C1", atLeast(1000)), catchEvent("C2", atLeast(500)),
      end("E1"), end("E2"), activity("W", userWork()), end("EW")),
    flow("p0", "S", "P"), flow("pe", "P", "E"), flow("p1", "P", "G"), flow("p2", "P", "W"), flow("g1", "G", "C1"),
    flow("g2", "G", "C2"), flow("c1", "C1", "E1"), flow("c2", "C2", "E2"), flow("w1", "W", "EW"));
  const options = { evaluator: "juel", conditionalRetrigger: "eachWrite", abnormalScopeEnd: "completesNormally", submission: "installsVariables" };
  const decoded = decodeProgram(wired(withOptions({ ...json, variables: ["amount"] }, options)));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

test("under orderInvariant the open waits of one closure publish in the breadth order of the units that opened them", () => {
  const program = forked();
  assert.equal(program.options.branchSchedule, "orderInvariant");
  const input = stimulusFromJson({ kind: "start", commandId: "start", instanceId: "I", variables: [] });
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  const started = step(program, null, input.value[1]);
  assert.ok(started.ok, JSON.stringify(started));
  assert.deepEqual(hostView(program, started.value).openWaits.map((wait) => wait.id.element), ["W", "C1", "C2"]);
  assert.deepEqual(started.value.openItems.map((item) => item.position).sort((left, right) => Number(left) - Number(right)),
    [6, 8, 10]);
  assert.equal(started.value.nextOrder, 11);
});
