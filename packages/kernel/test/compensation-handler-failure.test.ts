/**
 * A handler that an Error leaves uncaught (COMPENSATION-SEMANTICS-SPEC I11, COMPH-FAIL-01): under `failsInstance` the
 * process instance fails, and an Error End Event inside a handler Sub-Process is the failure's origin, as an effect's
 * reported Error is. `S -> U -> E`, `E` a Compensation End; `U` is compensable by the Sub-Process `H`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { chain, committedState, compensateAll, complete, drive, handlerScope, instance, raiseError, userTask } from "./compensation-support.ts";

test("an Error End inside a handler Sub-Process fails the instance and is the failure's origin", () => {
  const program = chain([userTask("U", "H")], compensateAll, handlerScope("H", [], raiseError("UNDO")));
  const state = committedState(drive(program, complete("U")));
  const at = (element: string) => ({ processInstanceId: instance, element, activation: 1 });
  assert.equal(state.status, "failed");
  assert.deepEqual(state.failure, {
    code: "UNDO", message: null, occurrence: at("HE"), related: [["trigger", at("E")], ["handler", at("H")]],
  });
});
