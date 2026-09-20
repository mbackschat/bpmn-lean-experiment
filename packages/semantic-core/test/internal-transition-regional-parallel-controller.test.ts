import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, StimulusKind, VariableValueKind, applyInternalOperationStep,
} from "@bpmn-lean/semantic-core";
import { twoControllerOccurrences } from "./internal-regional-controller-fixture.ts";

const { deriveInternalRegionalPreparation: prepare, applyPreparedInternalRegionalTransition: apply } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { parallelMultiInstanceBindingsForState: bindings } = await import(
  new URL("../dist/parallel-multi-instance-binding.js", import.meta.url).href
) as typeof import("../src/parallel-multi-instance-binding.ts");
const { completeParallelMultiInstanceChild: completeChild } = await import(
  new URL("../dist/semantic-process-parallel-multi-instance-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-parallel-multi-instance-runtime.ts");

for (const kind of [Kind.ThrowError, Kind.TerminateScope] as const) {
  test(`${kind} preserves the complete partially finished PMI lifetime outside the selected scope activation`, () => {
    const fixture = twoControllerOccurrences(kind, Kind.AwaitParallelMultiInstanceUserTask);
    const { program, selected, firstOwner, valid } = fixture;
    const armed = bindings(program, fixture.state)!;
    assert.equal(armed.length, 2);
    const outside = armed.find(({ record }) => record.owner.activation !== firstOwner.activation)!;
    const state = completeChild(program, fixture.state, {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: "complete-independent-parallel-child",
      taskId: outside.taskWaits[1]!.id,
      submittedValues: [{ name: outside.operation.data.output.taskDataOutputId,
        value: { kind: VariableValueKind.String, value: "accepted" } }],
    });
    assert.ok(state !== null);
    valid(state);
    const before = bindings(program, state)!;
    const retained = before.find(({ record }) => record.owner.activation !== firstOwner.activation)!;
    const removed = before.find((binding) => binding !== retained)!;
    assert.equal(retained.operation.id, removed.operation.id);
    assert.equal(retained.record.owner.definitionScopeId, removed.record.owner.definitionScopeId);
    assert.equal(retained.controller.slots.length, 3);
    assert.equal(retained.taskWaits.length, 2);
    assert.equal(removed.taskWaits.length, 3);
    const prepared = prepare(program, state, selected);
    assert.ok(prepared !== null);
    const after = apply(program, state, prepared);
    assert.ok(after !== null);
    assert.deepEqual(after, applyInternalOperationStep(program, selected, state)?.successor);
    valid(after);
    assert.deepEqual(bindings(program, after), [retained]);
    assert.deepEqual(after.parallelMultiInstanceControllers, [retained.controller]);
    assert.deepEqual(after.activityOccurrences, [retained.record]);
    assert.deepEqual(after.timerWaits, [retained.timerWait]);
    for (const wait of retained.taskWaits) assert.ok(after.userTaskWaits.includes(wait));
    for (const wait of removed.taskWaits) assert.equal(after.userTaskWaits.includes(wait), false);
    for (const field of ["taskActivations", "messageActivations", "timerActivations", "effectActivations",
      "activityActivations", "scopeActivations", "callActivations", "eventRaceActivations"] as const) {
      assert.deepEqual(after[field], state[field]);
    }
    assert.deepEqual(after.variables.process, state.variables.process);
    const foreignOwner = { ...retained.record.owner, processInstanceId: "another-process" };
    assert.equal(bindings(program, { ...after,
      activityOccurrences: [{ ...retained.record, owner: foreignOwner }],
      userTaskWaits: after.userTaskWaits.map((wait) => retained.taskWaits.includes(wait)
        ? { ...wait, owner: foreignOwner } : wait),
      timerWaits: [{ ...retained.timerWait, owner: foreignOwner }],
    }), undefined, "moving every owner together must not disconnect the controller's Process identity");
    assert.equal(bindings(program, { ...after,
      userTaskWaits: after.userTaskWaits.filter((wait) => wait !== retained.taskWaits[0]),
    }), undefined, "a surviving controller requires every pending child, not one representative");
    assert.equal(bindings(program, { ...after, parallelMultiInstanceControllers: [] }), undefined,
      "forward-only validation misses the surviving parallel Activity without its controller");
    assert.equal(bindings(program, { ...after, timerWaits: [] }), undefined);
    assert.equal(bindings(program, { ...after, activityOccurrences: [retained.record, removed.record] }), undefined,
      "a removed controller must not leave an extra operation-owned Activity");
  });
}
