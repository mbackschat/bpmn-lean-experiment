/**
 * The wire forms of compensation: a program whose subject names two handlers, one marked `forCompensation`, and whose
 * compensation options all take their non-default value encodes back to the JSON it decoded from; the default values are
 * every other fixture's.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, encodeProgram } from "./lean-paired.ts";

import { activity, append, base, task, userWork, withOptions } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const nonDefault: Json = {
  compensationOrder: "allAtOnce",
  compensationHandlerFailure: "propagatesFromTrigger",
  implicitCompensation: "everySubProcess",
  errorExitCompensation: "compensatesContained",
  multiInstanceCompensation: "perInstance",
  transactionMethods: "compatibilityAsCompensate",
  compensationReferenceScope: "eventSubProcessParent",
};

/** `T` names the handlers `H` and `H2`; `H` is marked for compensation. */
function compensating(): Json {
  const program = task(activity("T", userWork(), { compensationHandlers: ["H", "H2"] }))(withOptions(base(), nonDefault));
  return append(program, activity("H", "manual", { incoming: [], outgoing: [], forCompensation: true }),
    activity("H2", "manual", { incoming: [], outgoing: [] }));
}

test("a program's handler list, compensation mark and non-default compensation options encode back unchanged", () => {
  const program = compensating();
  const decoded = decodeProgram(program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.deepEqual(encodeProgram(decoded.value), program);
});
