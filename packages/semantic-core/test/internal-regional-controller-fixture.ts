import assert from "node:assert/strict";
import {
  SemanticOperationKind as Kind, ParallelMultiInstanceCompletionPolicy, VariableValueKind,
  applyInternalOperationStep, compareCanonicalStrings,
  isWellFormedSemanticProcessProgram, projectCurrentControlPositions, projectOpenFlowNodeOccurrences,
  runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";
import { sequentialOperationFromTask } from "./internal-sequential-operation-fixture.ts";

const { sequentialMultiInstanceBindingsForState: sequentialBindings } = await import(
  new URL("../dist/sequential-multi-instance-binding.js", import.meta.url).href
) as typeof import("../src/sequential-multi-instance-binding.ts");
const { parallelMultiInstanceBindingsForState: parallelBindings } = await import(
  new URL("../dist/parallel-multi-instance-binding.js", import.meta.url).href
) as typeof import("../src/parallel-multi-instance-binding.ts");
const { compareTokenPlaces, compareScopeOccurrenceIds, sameScopeOccurrence, setActivationCount } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

export function twoControllerOccurrences(kind: Kind.ThrowError | Kind.TerminateScope,
  family: Kind.AwaitSequentialMultiInstanceUserTask | Kind.AwaitParallelMultiInstanceUserTask) {
  const fixture = regionalPairFixture(kind, Kind.CompleteScope);
  const branch = fixture.branches[0]!;
  const original = fixture.program.operations.find(({ id }) => id === `operation:${branch.name}_Sibling_Task`);
  assert.ok(original?.kind === Kind.AwaitUserTask);
  const { operation: sequential, boundary, boundaryEnd } = sequentialOperationFromTask(original, branch.name);
  const operation = family === Kind.AwaitSequentialMultiInstanceUserTask ? sequential : {
    ...sequential, kind: Kind.AwaitParallelMultiInstanceUserTask,
    completionCondition: { kind: "stringEquals", variable: "completionPolicy", value: ParallelMultiInstanceCompletionPolicy.First },
  } as const;
  const extraOperations: SemanticOperation[] = family === Kind.AwaitSequentialMultiInstanceUserTask ? [] : [{
    id: `${operation.id}:complete`, origin: operation.origin, kind: Kind.CompleteParallelMultiInstanceUserTask,
    entryOperationId: operation.id, taskElementId: operation.task.elementId, normalOutput: operation.normalOutput,
  }];
  const bindings = family === Kind.AwaitSequentialMultiInstanceUserTask ? sequentialBindings : parallelBindings;
  const program: SemanticProcessProgram = { ...fixture.program,
    operations: [...fixture.program.operations.map((candidate) => candidate === original ? operation : candidate), boundaryEnd, ...extraOperations]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...fixture.program.operationScopes, { operationId: boundaryEnd.id, scopeId: branch.scopeId },
      ...extraOperations.map(({ id }) => ({ operationId: id, scopeId: branch.scopeId }))]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
    controlPlaces: [...fixture.program.controlPlaces, boundary].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    controlPlaceScopes: [...fixture.program.controlPlaceScopes, { controlPlaceId: boundary.id, scopeId: branch.scopeId }]
      .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
  };
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(supportsSemanticProcessExecution(fixture.start, program), false);
  const first = fixture.state.userTaskWaits.find(({ id }) => id.elementId === original.task.elementId)!;
  let state: RuntimeState = { ...fixture.state,
    ...(family === Kind.AwaitSequentialMultiInstanceUserTask
      ? { sequentialMultiInstanceControllers: [] } : { parallelMultiInstanceControllers: [] }),
    userTaskWaits: fixture.state.userTaskWaits.filter((wait) => wait !== first),
    controlTokens: [...fixture.state.controlTokens, { placeId: operation.input, owner: first.owner, multiplicity: 1 }]
      .sort(compareTokenPlaces),
    variables: { ...fixture.state.variables, process: { bindings: [
      { name: operation.data.input.dataObjectReferenceId, value: { kind: VariableValueKind.StringList, value: ["first", "second", "third"] } },
      ...(family === Kind.AwaitParallelMultiInstanceUserTask ? [{ name: "completionPolicy",
        value: { kind: VariableValueKind.String, value: "all" } as const }] : []),
    ] } },
  };
  const valid = (candidate: RuntimeState) => {
    assert.deepEqual(runtimeStateDefects(program, fixture.start.instanceId, candidate), []);
    assert.notEqual(projectCurrentControlPositions(program, candidate), null);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, candidate), null);
    assert.notEqual(bindings(program, candidate), undefined);
  };
  const fire = (selected: SemanticOperation) => {
    const step = applyInternalOperationStep(program, selected, state);
    assert.ok(step !== null, selected.id);
    state = step.successor;
    valid(state);
  };
  valid(state);
  fire(operation);
  const parent = state.scopeOccurrences.find(({ id }) => sameScopeOccurrence(id, first.owner))?.parent;
  assert.ok(parent !== null && parent !== undefined);
  const trigger = program.operations.find(({ id }) => id === `operation:${branch.name}_Task`);
  assert.ok(trigger?.kind === Kind.AwaitUserTask);
  const activation = state.scopeActivations.find(({ elementId }) => elementId === branch.scopeId)!.count + 1;
  const secondOwner = { ...first.owner, activation };
  // The raw entry excludes a second live child of this definition. This constructed state tests
  // the runtime invariant's wider occurrence domain without claiming source or entry reachability.
  state = { ...state,
    scopeOccurrences: [...state.scopeOccurrences, { id: secondOwner, parent }]
      .sort((a, b) => compareScopeOccurrenceIds(a.id, b.id)),
    scopeActivations: setActivationCount(state.scopeActivations, branch.scopeId, activation),
    controlTokens: [...state.controlTokens,
      { placeId: operation.input, owner: secondOwner, multiplicity: 1 },
      { placeId: trigger.input, owner: secondOwner, multiplicity: 1 }].sort(compareTokenPlaces) };
  valid(state);
  fire(operation);
  fire(trigger);
  return { program, state, selected: branch.selected, firstOwner: first.owner, valid };
}
