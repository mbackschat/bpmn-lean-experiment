/**
 * Two scope occurrences of different roles under one parent and element (KD1): the Call Activity `T`, holding the
 * local `P` (an `ioParameter`), enters its locals' scope occurrence and then its called root, both in the process root
 * for `T`. Both draw on the one counter of that parent and element, so their keys differ, and the instance's standing
 * keys stay apart (`Kernel.Laws.State.localsCalled_apart`). `Called` runs `CS → CW → CE`, waiting at the User Task `CW`.
 * Admission refuses a Call's input mappings (`activity.inputMappings`), so the case runs ungated: the kernel carries the
 * full shape whatever admission admits, and its keys must keep the two roles apart before admission widens.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, rootScope, step, stimulusFromJson } from "./lean-paired.ts";

import {
  activity, append, base, callWork, definitionRef, end, flow, literalValue, mapping, start, task, userWork, withFlows, wired,
} from "./admission-refusal-support.ts";

const program = withFlows({
  ...append(task(activity("T", callWork(), { inputs: [mapping("P", literalValue({ kind: "string", value: "local" }))] }))(base()),
    start("CS"), activity("CW", userWork()), end("CE")),
  processes: [{ definition: definitionRef("Called"), children: ["CS", "CW", "CE"], variables: [], executable: true }],
}, flow("cf1", "CS", "CW"), flow("cf2", "CW", "CE"));

test("a Call's locals and its called root, entered under one parent for one element, take distinct keys", () => {
  const decoded = decodeProgram(wired(program));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), "activity.inputMappings");
  const stimulus = stimulusFromJson({ commandId: "c", kind: "start", instanceId: "I", variables: [] });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  const outcome = step(decoded.value, null, stimulus.value[1]);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  const entered = outcome.value.scopes.filter((scope) => scope.element === "T");
  assert.equal(entered.length, 2);
  const [locals, root] = entered;
  assert.ok(locals !== undefined && root !== undefined);
  assert.equal(locals.calledInstance, null);
  assert.notEqual(root.calledInstance, null);
  assert.notEqual(locals.id, root.id);
  assert.ok(outcome.value.variables.some(([scope, entries]) => scope === locals.id && entries.some(([name]) => name === "P")));
  const keys = outcome.value.scopes.map((scope) => scope.id);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes(rootScope));
  assert.deepEqual(outcome.value.openItems.map((item) => item.element), ["CW"]);
});
