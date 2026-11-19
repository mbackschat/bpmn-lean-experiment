/**
 * A completed called instance leaves no feature slot entry in its caller's state (DC24, #169): leaving the called root
 * removes its instance entry, so a loop of Calls holds the same slots whatever number of calls it completed
 * (`Kernel.Laws.State.leaveScope_instances`). The loop `S → U → T → U` waits at the User Task `U`; each completion of
 * `U` runs the Call `T`, whose called process `Called` runs `CS → CE` and completes in the same input.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, rootScope, step, stimulusFromJson } from "./lean-paired.ts";
import type { State } from "@bpmn-lean/kernel";

import {
  activity, append, base, callWork, definitionRef, end, flow, model, start, userWork, wired,
} from "./admission-refusal-support.ts";

const program = (() => {
  const caller = model([start("S"), activity("U", userWork()), activity("T", callWork())],
    [flow("f1", "S", "U"), flow("f2", "U", "T"), flow("f3", "T", "U")])(base());
  const decoded = decodeProgram(wired({
    ...append(caller, start("CS"), end("CE")),
    flows: [...(caller.flows as unknown[]), flow("cf", "CS", "CE")],
    processes: [{ definition: definitionRef("Called"), children: ["CS", "CE"], variables: [], executable: true }],
  }));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
})();

const stimulus = (raw: Record<string, unknown>) => {
  const decoded = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

/** The state after `calls` completions of `U`, each running one call of `T` to its end. */
function afterCalls(calls: number): State {
  const started = step(program, null, stimulus({ kind: "start", instanceId: "I", variables: [] }));
  assert.ok(started.ok, JSON.stringify(started));
  let state = started.value;
  for (let activation = 1; activation <= calls; activation += 1) {
    const outcome = step(program, state, stimulus({
      kind: "command", occurrence: { processInstanceId: "I", elementId: "U", activation },
      action: { kind: "completeUserTask", values: [] },
    }));
    assert.ok(outcome.ok, JSON.stringify(outcome));
    state = outcome.value;
  }
  return state;
}

test("a loop of completed calls keeps the process root's instance entry alone", () => {
  const two = afterCalls(2);
  const five = afterCalls(5);
  assert.deepEqual(five.slots, two.slots);
  assert.deepEqual(five.slots.instances.map((entry) => entry.root), [rootScope]);
  assert.deepEqual(five.openItems.map((item) => item.element), ["U"]);
});
