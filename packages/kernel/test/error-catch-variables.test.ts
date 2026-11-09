/**
 * An Error boundary's catch variables under `ErrorCatchVariables.eventScope` (CIB-EXT-0028) and the output mappings of
 * the Sub-Process it interrupts under `ErrorPathOutputs.mapped` (CIB-EXT-0016). CIB sets the catch variables on the
 * host before it destroys the host and runs its output parameters (`BpmnExceptionHandler#propagateError:146-154`), so
 * an output mapping reads the caught values. The host is the Sub-Process `T`, `PS -> PT -> PE`, whose boundary `B`
 * catches `FAIL` into `failMessage` and leads to the User Task `W`; `T` maps the output `reason` from `failMessage`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";

import {
  activity, append, base, boundary, end, errorTrigger, flow, literalValue, mapping, scope, serviceWork, start, task, userWork,
  variable, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const cib = { errorCatchVariables: "eventScope", errorPathOutputs: "mapped", undeclaredWrite: "atInstanceRoot" };

function program(inputs: Json[]): Json {
  const host = scope("T", "embedded", {}, {
    inputs,
    outputs: [mapping("reason", variable("failMessage"))],
    boundaries: [boundary("B", errorTrigger({ code: "FAIL", messageVariable: "failMessage" }))],
  });
  const json = append(task(host)(base()), start("PS", null, [], "T"), activity("PT", serviceWork(), {}, "T"), end("PE", "none", "T"),
    activity("W", userWork()));
  return withOptions(withFlows(json, flow("pf1", "PS", "PT"), flow("pf2", "PT", "PE"), flow("fb", "B", "W"), flow("fw", "W", "E")), cib);
}

const stimulus = (json: Json) => {
  const decoded = stimulusFromJson({ commandId: "c", ...json });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

/** Start, fail `PT` with `FAIL` and the message `boom`, and return the root variables by name. */
function rootAfterCatch(json: Json): Record<string, unknown> {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const started = step(hooks, decoded.value, null, stimulus({ kind: "start", instanceId: "I", variables: [] }));
  assert.ok(started.ok, JSON.stringify(started));
  const caught = step(hooks, decoded.value, started.value, stimulus({
    kind: "effectResult",
    occurrence: { processInstanceId: "I", elementId: "PT", activation: 1 },
    outcome: { kind: "businessFailure", code: "FAIL", message: "boom", outputs: [] },
  }));
  assert.ok(caught.ok, JSON.stringify(caught));
  assert.deepEqual(caught.value.openItems.map((item) => item.element), ["W"]);
  return Object.fromEntries(caught.value.variables.flatMap((entry) => entry.entries));
}

const boom = { tag: "string", value: "boom" };

test("the interrupted host's output mapping reads the caught message", () => {
  assert.deepEqual(rootAfterCatch(program([])), { failMessage: boom, reason: boom });
});

test("the catch variable updates the host's same-named local, which the host's output mapping then reads", () => {
  const local = [mapping("failMessage", literalValue({ kind: "string", value: "initial" }))];
  assert.deepEqual(rootAfterCatch(program(local)), { reason: boom });
});
