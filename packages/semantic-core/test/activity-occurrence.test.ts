/**
 * A handler wait must not outlive the Activity occurrence it is attached to.
 *
 * `removeScopeOccurrenceSubtree` filters every runtime collection by *owner inside the subtree*, and a
 * bounded Sub-Process's boundary deadline is owned by the **parent** occurrence. It is therefore
 * outside the removed subtree by construction and survives the removal of the child it guards. The
 * bounded-scope family avoids that today only because its own two victory arms withdraw the deadline
 * by hand; the Error, incident-cancellation, and `terminateScope` routes reach the same region without
 * doing so, and no registered profile composes any of them with a bounded Sub-Process.
 *
 * That unreachability is why the oracle is the invariant rather than a schedule: no public transition
 * can produce the state, so the state is constructed from a committed one and handed to the predicate.
 * The predicate admits it today, because the stranded deadline still names a live owner and
 * `RSI-OWN-01` is satisfied, so nothing in either language reports a region whose handler outlived it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  applyStimulus,
  initialState,
  runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";

import { boundedScopeProgram, instanceId, start } from "./bounded-scope-fixture.ts";

function armedState(): RuntimeState {
  const started = applyStimulus(boundedScopeProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

function defects(state: RuntimeState): ReadonlyArray<string> {
  return runtimeStateDefects(boundedScopeProgram, instanceId, state);
}

test("the armed state is admitted, and its deadline is owned outside the child region", () => {
  const state = armedState();
  const child = state.scopeOccurrences.find(({ parent }) => parent !== null);
  assert.ok(child !== undefined, "arming must create one child occurrence");
  assert.equal(state.timerWaits.length, 1);
  // The precondition the whole defect rests on. Without it the deadline would be removed with the
  // subtree and there would be nothing to strand.
  assert.notEqual(
    state.timerWaits[0]?.owner.definitionScopeId,
    child.id.definitionScopeId,
  );
  assert.deepEqual(defects(state), []);
});

test("a region removal that leaves its attached deadline behind is refused", () => {
  const state = armedState();
  const child = state.scopeOccurrences.find(({ parent }) => parent !== null);
  assert.ok(child !== undefined);

  // Exactly what owner-filtered subtree removal produces: the child region is gone, every token and
  // wait it owned is gone, and the parent-owned deadline is untouched.
  const stranded: RuntimeState = {
    ...state,
    scopeOccurrences: state.scopeOccurrences.filter((candidate) =>
      candidate.id.definitionScopeId !== child.id.definitionScopeId
    ),
    controlTokens: state.controlTokens.filter(({ owner }) =>
      owner.definitionScopeId !== child.id.definitionScopeId
    ),
    userTaskWaits: state.userTaskWaits.filter(({ owner }) =>
      owner.definitionScopeId !== child.id.definitionScopeId
    ),
  };

  assert.notDeepEqual(
    defects(stranded),
    [],
    "a deadline whose Activity body is gone must be refused, not admitted",
  );
});

/**
 * Anti-vacuity, and it is what makes the refusal attributable.
 *
 * Removing the region *and* its attached deadline is a complete withdrawal and must stay admitted. If
 * this failed too, the test above would be reporting the subtree removal rather than the stranding.
 */
test("removing the region together with its attached deadline stays admitted", () => {
  const state = armedState();
  const child = state.scopeOccurrences.find(({ parent }) => parent !== null);
  assert.ok(child !== undefined);

  const withdrawn: RuntimeState = {
    ...state,
    scopeOccurrences: state.scopeOccurrences.filter((candidate) =>
      candidate.id.definitionScopeId !== child.id.definitionScopeId
    ),
    controlTokens: state.controlTokens.filter(({ owner }) =>
      owner.definitionScopeId !== child.id.definitionScopeId
    ),
    userTaskWaits: state.userTaskWaits.filter(({ owner }) =>
      owner.definitionScopeId !== child.id.definitionScopeId
    ),
    timerWaits: [],
    activityOccurrences: [],
  };

  assert.deepEqual(defects(withdrawn), []);
});
