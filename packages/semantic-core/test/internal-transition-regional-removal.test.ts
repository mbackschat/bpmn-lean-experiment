import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, SemanticTransitionKind, applyInternalOperationStep,
  isWellFormedSemanticProcessProgram, projectControlPositionDelta,
  projectCurrentControlPositions, projectFlowNodeOccurrenceLifecycleDelta,
  projectOpenFlowNodeOccurrences, runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { PreparedInternalRegionalTransition } from "../src/internal-transition-regional-preparation.ts";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";
import type { RegionalKind } from "./internal-regional-pair-fixture.ts";

const { deriveInternalRegionalPreparation: prepare, applyPreparedInternalRegionalTransition: apply } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { deriveInternalRegionalPublication } = await import(
  new URL("../dist/internal-transition-regional-publication.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-publication.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as typeof import("../src/internal-publication-template.ts");
const { internalTransitionStateFootprintsAreIndependent: independent } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint.ts");

function containingTermination(right: RegionalKind, bounded: boolean) {
  const fixture = regionalPairFixture(Kind.ReturnProcess, right, bounded);
  const { side, state } = fixture;
  assert.ok(side.kind === Kind.AwaitUserTask);
  const root = state.scopeOccurrences.find(({ id, parent }) =>
    parent === null && id.processInstanceId === fixture.start.instanceId);
  assert.ok(root !== undefined);
  const operation: Extract<SemanticOperation, { kind: Kind.TerminateScope }> = {
    id: side.id, origin: side.origin, kind: Kind.TerminateScope, input: side.input, scopeId: root.id.definitionScopeId,
  };
  const program: SemanticProcessProgram = { ...fixture.program,
    operations: fixture.program.operations.map((candidate) => candidate.id === side.id ? operation :
      candidate.kind === Kind.Synchronize ? { ...candidate, inputs: candidate.inputs.filter((id) => id !== side.output) } : candidate),
    controlPlaces: fixture.program.controlPlaces.filter(({ id }) => id !== side.output),
    controlPlaceScopes: fixture.program.controlPlaceScopes.filter(({ controlPlaceId }) => controlPlaceId !== side.output),
  };
  return { ...fixture, program, operation, root };
}

function valid(program: SemanticProcessProgram, state: RuntimeState, instanceId: string) {
  assert.deepEqual(runtimeStateDefects(program, instanceId, state), []);
  assert.notEqual(projectCurrentControlPositions(program, state), null);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
}

for (const [right, bounded] of [
  [Kind.ReturnProcess, false], [Kind.CompleteScope, true], [Kind.TerminateScope, false],
] as const) {
  test(`containing Terminate removes directed Calls and ${right} ownership with exact publication`, () => {
    const { program, state, start, operation, root, branches } = containingTermination(right, bounded);
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(supportsSemanticProcessExecution(start, program), false,
      "constructed composition does not admit a source profile");
    valid(program, state, start.instanceId);
    assert.equal(state.calledProcessOccurrences.length, right === Kind.ReturnProcess ? 2 : 1);
    assert.equal(state.timerWaits.length, bounded ? 1 : 0);
    assert.equal(state.userTaskWaits.length, right === Kind.TerminateScope ? 1 : 0);
    if (bounded) assert.equal(state.activityOccurrences.length, 1);
    const predecessor = structuredClone(state);
    const prepared = prepare(program, state, operation);
    assert.ok(prepared !== null);
    assert.equal(prepared.region.members.length, 3);
    assert.deepEqual(prepared.region.members, state.scopeOccurrences.map(({ id }) => id));
    const returning = prepare(program, state, branches[0]!.selected);
    assert.ok(returning !== null);
    assert.equal(returning.region.members.length, 1);
    assert.notDeepEqual(returning.region.root, root.id, "Call edges never include the caller in the called region");
    assert.equal(independent(prepared.footprint, returning.footprint), false);

    const step = applyInternalOperationStep(program, operation, state);
    assert.ok(step !== null && step.owner !== null);
    const after = apply(program, state, prepared);
    assert.ok(after !== null);
    assert.deepEqual(after, step.successor);
    valid(program, after, start.instanceId);
    assert.deepEqual(after.scopeOccurrences, [root]);
    assert.deepEqual(after.calledProcessOccurrences, []);
    assert.deepEqual(after.userTaskWaits, []);
    assert.deepEqual(after.activityOccurrences, []);
    assert.deepEqual(after.timerWaits, []);
    assert.deepEqual(after.controlTokens, []);
    assert.deepEqual(projectOpenFlowNodeOccurrences(program, after), []);
    assert.equal(after.endOccurrences, state.endOccurrences + 1);
    assert.deepEqual(after.variables, state.variables);
    assert.equal(after.logicalTimeMs, state.logicalTimeMs);
    for (const key of ["taskActivations", "messageActivations", "timerActivations", "effectActivations",
      "activityActivations", "scopeActivations", "callActivations", "eventRaceActivations"] as const) {
      assert.deepEqual(after[key], state[key], key);
    }
    assert.deepEqual(state, predecessor);

    const positionDelta = projectControlPositionDelta(program, state, after);
    const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, state, after,
      { kind: "internal", operation, owner: step.owner }, "containing-termination", 63);
    assert.ok(positionDelta !== null && lifecycle !== null);
    const expected = [{ alternative: prepared.alternative, transitionIndex: 63,
      record: { logicalTimeMs: state.logicalTimeMs, transition: {
        kind: SemanticTransitionKind.InternalOperation, operationId: operation.id,
        operationKind: operation.kind, origin: operation.origin, owner: step.owner,
      }, positionDelta }, lifecycle }];
    assert.deepEqual(instantiateInternalPublicationBatch("containing-termination", 63,
      [prepared.publicationTemplate]), expected);

    const rootOnly = { root: prepared.region.root, members: [prepared.region.root] };
    const incompletePublication = deriveInternalRegionalPublication(program, state, prepared.selection, rootOnly);
    assert.ok(incompletePublication !== null);
    assert.notDeepEqual(instantiateInternalPublicationBatch("containing-termination", 63,
      [incompletePublication]), expected, "omitting directed descendants loses actual scope exits");
    const forged: PreparedInternalRegionalTransition = { ...prepared, region: rootOnly,
      publicationTemplate: incompletePublication };
    assert.equal(apply(program, state, forged), null);
    assert.deepEqual(state, predecessor);

    const completion = program.operations.find((candidate) => candidate.kind === Kind.CompleteScope &&
      candidate.scopeId === root.id.definitionScopeId && candidate.parentOutput === null);
    assert.ok(completion !== undefined);
    const completed = applyInternalOperationStep(program, completion, after);
    assert.ok(completed !== null);
    valid(program, completed.successor, start.instanceId);
    assert.equal(completed.successor.control.kind, "completed");
    assert.deepEqual(completed.successor.scopeOccurrences, []);
    assert.deepEqual(completed.successor.controlTokens, []);
    assert.deepEqual(completed.successor.calledProcessOccurrences, []);
    assert.equal(completed.successor.endOccurrences, after.endOccurrences);
  });
}
