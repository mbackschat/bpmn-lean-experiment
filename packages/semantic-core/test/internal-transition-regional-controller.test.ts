import assert from "node:assert/strict";
import test from "node:test";
import { SemanticOperationKind as Kind, applyInternalOperationStep } from "@bpmn-lean/semantic-core";
import { twoControllerOccurrences } from "./internal-regional-controller-fixture.ts";

const { deriveInternalRegionalPreparation: prepare, applyPreparedInternalRegionalTransition: apply } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { sequentialMultiInstanceBindingsForState: bindings } = await import(
  new URL("../dist/sequential-multi-instance-binding.js", import.meta.url).href
) as typeof import("../src/sequential-multi-instance-binding.ts");

for (const kind of [Kind.ThrowError, Kind.TerminateScope] as const) {
  test(`${kind} withdraws one complete SMI lifetime and preserves another activation of the same operation`, () => {
    const { program, state, selected, firstOwner, valid } = twoControllerOccurrences(kind, Kind.AwaitSequentialMultiInstanceUserTask);
    const before = bindings(program, state)!;
    assert.equal(before.length, 2);
    assert.equal(before[0]!.operation.id, before[1]!.operation.id);
    assert.equal(before[0]!.record.owner.definitionScopeId, before[1]!.record.owner.definitionScopeId);
    assert.notEqual(before[0]!.record.owner.activation, before[1]!.record.owner.activation);
    const removed = before.find(({ record }) => record.owner.activation === firstOwner.activation)!;
    const retained = before.find((binding) => binding !== removed)!;
    const prepared = prepare(program, state, selected);
    assert.ok(prepared !== null);
    const after = apply(program, state, prepared);
    assert.ok(after !== null);
    assert.deepEqual(after, applyInternalOperationStep(program, selected, state)?.successor);
    valid(after);
    assert.deepEqual(bindings(program, after), [retained]);
    assert.deepEqual(after.sequentialMultiInstanceControllers, [retained.controller]);
    assert.deepEqual(after.activityOccurrences, [retained.record]);
    assert.deepEqual(after.timerWaits, [retained.timerWait]);
    assert.ok(after.userTaskWaits.includes(retained.taskWait));
    assert.equal(after.userTaskWaits.includes(removed.taskWait), false);
    for (const field of ["taskActivations", "messageActivations", "timerActivations", "effectActivations",
      "activityActivations", "scopeActivations", "callActivations", "eventRaceActivations"] as const) {
      assert.deepEqual(after[field], state[field]);
    }
    assert.equal(bindings(program, { ...after, sequentialMultiInstanceControllers: [] }), undefined,
      "forward-only validation misses the surviving Activity with its controller removed");
    assert.equal(bindings(program, { ...after, timerWaits: [] }), undefined);
    assert.equal(bindings(program, { ...after, activityOccurrences: [retained.record, removed.record] }), undefined,
      "equal pre-state counts cannot justify independently filtered successor populations");
  });
}
