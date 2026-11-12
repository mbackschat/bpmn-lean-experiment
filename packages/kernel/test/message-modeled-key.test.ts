/**
 * A delivery to a catch whose modeled correlation key `OrderKey = orderId` is evaluated when the delivery is matched
 * (`messageCorrelation = modeledKey`, PC-MESSAGE-08): a key outside the String domain, an unbound one included, is the
 * delivery's `unsupported` refusal and leaves the wait open, never a mismatch or a semantic failure
 * ([population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#restrictions)).
 *
 * `Start -> T -> End`, `T` a Message catch on Operation `O` of Interface `I`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import { base, catchEvent, channel, criterion, message, replace, variable, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const decoded = decodeProgram(wired({
  ...replace(base(), "T", catchEvent("T", message({ ...channel(), correlation: [criterion("OrderKey", variable("orderId"))] }))),
  variables: ["orderId"],
}));
assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
const program: Program = decoded.value;
assert.equal(admit(program), null);

function run(state: State | null, raw: Json): Outcome {
  const input = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  return step(program, state, input.value[1]);
}

function started(variables: Json[]): State {
  const outcome = run(null, { kind: "start", instanceId: "I", variables });
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

const deliverKey = (state: State, key: string): Outcome => run(state, {
  kind: "deliver", occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
  trigger: { kind: "message", channel: { kind: "operationMessage", messageId: "M", interfaceId: "I", interfaceOperationId: "O" } },
  correlation: [{ target: { kind: "processVariable", name: "OrderKey" }, expected: { kind: "string", value: key } }],
});

test("a key whose variable is unbound refuses the delivery as unsupported", () => {
  const state = started([]);
  assert.deepEqual(deliverKey(state, "o-7"), { ok: false, failure: { tag: "unsupported", code: "correlation-key-unbound" } });
  assert.ok(state.openItems.some((item) => item.element === "T"));
});

test("a key whose variable is unbound refuses a delivery carrying no criteria or more than one", () => {
  const state = started([]);
  const unbound = { ok: false, failure: { tag: "unsupported", code: "correlation-key-unbound" } };
  const deliver = (correlation: Json[]): Outcome => run(state, {
    kind: "deliver", occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
    trigger: { kind: "message", channel: { kind: "operationMessage", messageId: "M", interfaceId: "I", interfaceOperationId: "O" } },
    correlation,
  });
  assert.deepEqual(deliver([]), unbound);
  assert.deepEqual(deliver([
    { target: { kind: "processVariable", name: "OrderKey" }, expected: { kind: "string", value: "o-7" } },
    { target: { kind: "processVariable", name: "Other" }, expected: { kind: "string", value: "x" } },
  ]), unbound);
});

test("a key bound to an empty String refuses the delivery as unsupported", () => {
  const state = started([{ name: "orderId", value: { kind: "string", value: "" } }]);
  assert.deepEqual(deliverKey(state, "o-7"), { ok: false, failure: { tag: "unsupported", code: "correlation-key-empty" } });
});

test("a bound key fires the catch on an equal value and rejects another", () => {
  const state = started([{ name: "orderId", value: { kind: "string", value: "o-7" } }]);
  assert.deepEqual(deliverKey(state, "o-8"), { ok: false, failure: { tag: "rejected", code: "message-correlation-mismatch" } });
  const fired = deliverKey(state, "o-7");
  assert.ok(fired.ok, JSON.stringify(fired));
  assert.ok(!fired.value.openItems.some((item) => item.element === "T"));
});
