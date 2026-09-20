import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, ParallelMultiInstanceCompletionPolicy, StimulusKind,
  VariableValueKind, applyInternalOperationStep, compareCanonicalStrings,
  isWellFormedSemanticProcessProgram, projectCurrentControlPositions, projectOpenFlowNodeOccurrences,
  runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";
import { sequentialOperationFromTask } from "./internal-sequential-operation-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

const { removeCalledProcessSubtreesForCallers: removeCalls } = await import(
  new URL("../dist/semantic-process-call-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-call-runtime.ts");
const { sequentialMultiInstanceBindingsForState: sequentialBindings } = await import(
  new URL("../dist/sequential-multi-instance-binding.js", import.meta.url).href
) as typeof import("../src/sequential-multi-instance-binding.ts");
const { parallelMultiInstanceBindingsForState: parallelBindings } = await import(
  new URL("../dist/parallel-multi-instance-binding.js", import.meta.url).href
) as typeof import("../src/parallel-multi-instance-binding.ts");
const { completeParallelMultiInstanceChild: completeChild } = await import(
  new URL("../dist/semantic-process-parallel-multi-instance-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-parallel-multi-instance-runtime.ts");
const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");
const { deriveInternalRegionalPreparation: prepare } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");

for (const family of [Kind.AwaitSequentialMultiInstanceUserTask, Kind.AwaitParallelMultiInstanceUserTask] as const) {
  test(`Call cleanup withdraws both called ${family} lifetimes and preserves the caller's complete lifetime`, () => {
    const parallel = family === Kind.AwaitParallelMultiInstanceUserTask;
    const bindings = parallel ? parallelBindings : sequentialBindings;
    const fixture = regionalPairFixture(Kind.ReturnProcess, Kind.ReturnProcess);
    const root = fixture.state.scopeOccurrences.find(({ id, parent }) =>
      parent === null && id.processInstanceId === fixture.start.instanceId)!;
    const originals = [...fixture.branches.map(({ name }) => {
      const original = fixture.program.operations.find(({ id }) => id === `operation:${name}_Task`);
      assert.ok(original?.kind === Kind.AwaitUserTask);
      return original;
    }), fixture.side];
    const replacements = originals.map((original) => {
      assert.ok(original.kind === Kind.AwaitUserTask);
      const scopeId = fixture.program.operationScopes.find(({ operationId }) => operationId === original.id)!.scopeId;
      const owner = fixture.state.scopeOccurrences.find(({ id }) => id.definitionScopeId === scopeId)!.id;
      const { operation: sequential, boundary } = sequentialOperationFromTask(original, original.task.elementId);
      const operation = parallel ? { ...sequential, kind: Kind.AwaitParallelMultiInstanceUserTask,
        completionCondition: { kind: "stringEquals", variable: "completionPolicy", value: ParallelMultiInstanceCompletionPolicy.First },
      } as const : sequential;
      const normal = controlPlace(`${original.task.elementId}_Review_Normal`);
      const mergeInputs: [string, string] = [normal.id, boundary.id];
      const merge = { ...operationBase(`${original.task.elementId}_Review_Merge`), kind: Kind.MergeExclusive,
        inputs: mergeInputs.sort(compareCanonicalStrings), output: original.output } as const;
      return { operation: { ...operation, normalOutput: normal.id }, boundary, normal, merge, scopeId, owner };
    });
    const completions: SemanticOperation[] = parallel ? replacements.map(({ operation }) => ({
      id: `${operation.id}:complete`, origin: operation.origin, kind: Kind.CompleteParallelMultiInstanceUserTask,
      entryOperationId: operation.id, taskElementId: operation.task.elementId, normalOutput: operation.normalOutput,
    })) : [];
    const program: SemanticProcessProgram = { ...fixture.program,
      operations: [...fixture.program.operations.map((original) =>
        replacements.find(({ operation }) => operation.id === original.id)?.operation ?? original),
      ...replacements.map(({ merge }) => merge), ...completions].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      operationScopes: [...fixture.program.operationScopes,
        ...replacements.map(({ merge, scopeId }) => ({ operationId: merge.id, scopeId })),
        ...completions.map(({ id }, index) => ({ operationId: id, scopeId: replacements[index]!.scopeId }))]
        .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
      controlPlaces: [...fixture.program.controlPlaces, ...replacements.flatMap(({ boundary, normal }) => [boundary, normal])]
        .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      controlPlaceScopes: [...fixture.program.controlPlaceScopes,
        ...replacements.flatMap(({ boundary, normal, scopeId }) => [
          { controlPlaceId: boundary.id, scopeId }, { controlPlaceId: normal.id, scopeId }])]
        .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
    };
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(supportsSemanticProcessExecution(fixture.start, program), false);
    let state: RuntimeState = { ...fixture.state,
      ...(parallel ? { parallelMultiInstanceControllers: [] } : { sequentialMultiInstanceControllers: [] }),
      controlTokens: [...fixture.state.controlTokens,
        ...replacements.slice(0, 2).map(({ operation, owner }) => ({ placeId: operation.input, owner, multiplicity: 1 }))]
        .sort(compareTokenPlaces),
      variables: { ...fixture.state.variables, process: { bindings: [
        { name: replacements[0]!.operation.data.input.dataObjectReferenceId,
          value: { kind: VariableValueKind.StringList, value: ["first", "second", "third"] } },
        ...(parallel ? [{ name: "completionPolicy", value: { kind: VariableValueKind.String, value: "all" } as const }] : []),
      ] } },
    };
    const valid = (candidate: RuntimeState) => {
      assert.deepEqual(runtimeStateDefects(program, fixture.start.instanceId, candidate), []);
      assert.notEqual(projectCurrentControlPositions(program, candidate), null);
      assert.notEqual(projectOpenFlowNodeOccurrences(program, candidate), null);
      assert.notEqual(bindings(program, candidate), undefined);
    };
    valid(state);
    for (const { operation } of replacements) {
      const step = applyInternalOperationStep(program, operation, state);
      assert.ok(step !== null);
      state = step.successor;
      valid(state);
    }
    if (parallel) {
      const caller = parallelBindings(program, state)!.find(({ controller }) =>
        controller.id.processInstanceId === fixture.start.instanceId)!;
      const progressed = completeChild(program, state, { kind: StimulusKind.CompleteUserTaskInstance,
        commandId: "complete-caller-middle-child", taskId: caller.taskWaits[1]!.id,
        submittedValues: [{ name: caller.operation.data.output.taskDataOutputId,
          value: { kind: VariableValueKind.String, value: "accepted" } }],
      });
      assert.ok(progressed !== null);
      state = progressed;
      valid(state);
      assert.deepEqual(parallelBindings(program, state)!.map(({ taskWaits }) => taskWaits.length).sort(), [2, 3, 3]);
    }
    const before = bindings(program, state)!;
    assert.equal(before.length, 3);
    assert.equal(new Set(before.map(({ controller }) => controller.id.processInstanceId)).size, 3);
    const retained = before.find(({ controller }) => controller.id.processInstanceId === fixture.start.instanceId)!;
    assert.equal(prepare(program, state, fixture.branches[0]!.selected), null,
      "this tests cancellation cleanup; live called work still prevents normal Return");
    const after = removeCalls(state, [root.id]);
    valid(after);
    assert.deepEqual(bindings(program, after), [retained]);
    assert.deepEqual(after.calledProcessOccurrences, []);
    assert.deepEqual(after.scopeOccurrences, [root]);
    assert.deepEqual(parallel ? after.parallelMultiInstanceControllers : after.sequentialMultiInstanceControllers, [retained.controller]);
    assert.deepEqual(after.activityOccurrences, [retained.record]);
    const retainedWaits = "taskWaits" in retained ? retained.taskWaits : [retained.taskWait];
    assert.deepEqual(after.userTaskWaits, retainedWaits);
    assert.deepEqual(after.timerWaits, [retained.timerWait]);
    for (const field of ["taskActivations", "messageActivations", "timerActivations", "effectActivations",
      "activityActivations", "scopeActivations", "callActivations", "eventRaceActivations"] as const) {
      assert.deepEqual(after[field], state[field]);
    }
    assert.deepEqual(after.control, state.control);
    assert.deepEqual(after.variables, state.variables);
    assert.equal(after.logicalTimeMs, state.logicalTimeMs);
    assert.equal(after.endOccurrences, state.endOccurrences);
    const controllers = parallel ? state.parallelMultiInstanceControllers : state.sequentialMultiInstanceControllers;
    assert.ok(controllers);
    const controllerField = parallel ? "parallelMultiInstanceControllers" : "sequentialMultiInstanceControllers";
    assert.equal(bindings(program, { ...after, [controllerField]: controllers }), undefined,
      "retaining called controllers strands their record and wait references");
    assert.equal(bindings(program, { ...after, [controllerField]: [] }), undefined,
      "removing every controller loses the independent caller lifetime");
    assert.equal(bindings(program, { ...after,
      userTaskWaits: after.userTaskWaits.filter((wait) => wait !== retainedWaits[0]),
    }), undefined, "the caller's complete pending-child census must survive Call cleanup");
    assert.deepEqual(removeCalls(state, [{ ...root.id, activation: root.id.activation + 1 }]), state);
    assert.deepEqual(removeCalls(state, [{ ...root.id, processInstanceId: "unrelated-instance" }]), state);
  });
}
