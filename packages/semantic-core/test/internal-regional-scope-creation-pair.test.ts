import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, SemanticTransitionKind, applyInternalOperationStep,
  compareCanonicalStrings, isWellFormedSemanticProcessProgram, projectControlPositionDelta,
  projectCurrentControlPositions, projectFlowNodeOccurrenceLifecycleDelta, projectOpenFlowNodeOccurrences,
  runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { InstantiatedInternalPublication } from "../src/internal-publication-template.ts";
import { regionalKinds } from "./internal-regional-pair-fixture.ts";
import { regionalScopeCreationFixture, scopeCreationKinds } from "./internal-regional-scope-creation-fixture.ts";

const { deriveInternalRegionalPreparation: prepareRegional, applyPreparedInternalRegionalTransition: applyRegional } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { deriveInternalScopeCreationPreparation: prepareCreation, applyPreparedInternalScopeCreation: applyCreation } = await import(
  new URL("../dist/internal-transition-scope-creation-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-scope-creation-preparation.ts");
const { internalTransitionStateFootprintsAreIndependent: independent, InternalTransitionStateAtomKind: Atom } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as typeof import("../src/internal-publication-template.ts");

function valid(program: SemanticProcessProgram, state: RuntimeState, instanceId: string) {
  assert.equal(isWellFormedSemanticProcessProgram(program), true, "structurally valid constructed Program");
  assert.deepEqual(runtimeStateDefects(program, instanceId, state), []);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
  assert.notEqual(projectCurrentControlPositions(program, state), null);
}

for (const kind of [Kind.ThrowError, Kind.TerminateScope] as const) {
  test(`${kind} rejects child creation inside its cancellation region before the child exists`, () => {
    const { program, state, start, regional, creation, owner } = regionalScopeCreationFixture(kind, Kind.EnterScope, false, true);
    valid(program, state, start.instanceId);
    const removal = prepareRegional(program, state, regional);
    const insertion = prepareCreation(program, state, creation);
    assert.ok(removal !== null && insertion !== null);
    assert.ok(removal.region.members.some((member) => JSON.stringify(member) === JSON.stringify(owner)));
    assert.equal(removal.region.members.some((member) => JSON.stringify(member) === JSON.stringify(insertion.patch.scope.id)), false);
    assert.equal(independent(removal.footprint, insertion.footprint), false);
    const omitted = { reads: removal.footprint.reads.filter((atom) => atom.kind !== Atom.OccurrenceRegion),
      writes: removal.footprint.writes.filter((atom) => atom.kind !== Atom.OccurrenceRegion &&
        !(atom.kind === Atom.TokenOwners && atom.placeId === creation.input)) };
    assert.equal(independent(omitted, insertion.footprint), true,
      "omitting region and changed-census dependencies falsely declares independence");
    const removed = applyRegional(program, state, removal);
    const inserted = applyCreation(program, state, insertion);
    assert.ok(removed !== null && inserted !== null);
    valid(program, removed, start.instanceId);
    valid(program, inserted, start.instanceId);
    assert.equal(prepareCreation(program, removed, creation), null);
    assert.equal(applyCreation(program, removed, insertion), null);
    const changed = prepareRegional(program, inserted, regional);
    assert.ok(changed !== null);
    assert.ok(changed.region.members.some((member) => JSON.stringify(member) === JSON.stringify(insertion.patch.scope.id)));
    assert.notDeepEqual(changed, removal);
    assert.equal(applyRegional(program, inserted, removal), null,
      "the stale artifact cannot cancel a newly enlarged region");
  });
}

for (const regionalKind of regionalKinds) for (const creationKind of scopeCreationKinds)
for (const bounded of regionalKind === Kind.CompleteScope ? [false, true] : [false])
for (const multiplicity of creationKind === Kind.EnterScope ? [1, 3] : [1]) {
  test(`${regionalKind}/${creationKind}${bounded ? "/bounded" : ""}/tokens=${multiplicity} preserves preparations, exact states and accepted publication`, () => {
    const fixture = regionalScopeCreationFixture(regionalKind, creationKind, bounded);
    const { program, start, regional, creation } = fixture;
    const state: RuntimeState = { ...fixture.state, controlTokens: fixture.state.controlTokens.map((token) =>
      token.placeId === creation.input ? { ...token, multiplicity } : token) };
    valid(program, state, start.instanceId);
    assert.equal(supportsSemanticProcessExecution(start, program), false,
      "constructed pair evidence establishes no source/profile reachability");
    const removal = prepareRegional(program, state, regional);
    const insertion = prepareCreation(program, state, creation);
    assert.ok(removal !== null && insertion !== null);
    assert.equal(independent(removal.footprint, insertion.footprint), true);
    const expected = instantiateInternalPublicationBatch("regional-scope", 43,
      [removal.publicationTemplate, insertion.publicationTemplate]);
    assert.ok(expected !== null);
    assert.deepEqual(expected.map(({ transitionIndex }) => transitionIndex), [43, 44]);
    let final: RuntimeState | undefined;
    for (const order of [[removal, insertion], [insertion, removal]]) {
      assert.deepEqual(instantiateInternalPublicationBatch("regional-scope", 43,
        order.map(({ publicationTemplate }) => publicationTemplate)), expected);
      let current = state;
      const actual: InstantiatedInternalPublication[] = [];
      for (const [index, member] of order.entries()) {
        for (const remaining of order.slice(index)) {
          assert.deepEqual("selection" in remaining
            ? prepareRegional(program, current, regional) : prepareCreation(program, current, creation), remaining);
        }
        const operation = "selection" in member ? regional : creation;
        const step = applyInternalOperationStep(program, operation, current);
        const next = "selection" in member ? applyRegional(program, current, member) : applyCreation(program, current, member);
        assert.ok(step !== null && step.owner !== null && next !== null);
        assert.deepEqual(next, step.successor);
        valid(program, next, start.instanceId);
        const publication: InstantiatedInternalPublication = expected.find(({ alternative }) => alternative.operationId === operation.id)!;
        const positionDelta = projectControlPositionDelta(program, current, next);
        const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, current, next,
          { kind: "internal", operation, owner: step.owner }, "regional-scope", publication.transitionIndex);
        assert.ok(positionDelta !== null && lifecycle !== null);
        actual.push({ alternative: member.alternative, transitionIndex: publication.transitionIndex,
          record: { logicalTimeMs: current.logicalTimeMs,
            transition: { kind: SemanticTransitionKind.InternalOperation, operationId: operation.id,
              operationKind: operation.kind, origin: operation.origin, owner: step.owner }, positionDelta }, lifecycle });
        current = next;
      }
      assert.deepEqual(actual.sort((a, b) => compareCanonicalStrings(a.alternative.operationId, b.alternative.operationId)), expected);
      if (final === undefined) final = current;
      else assert.deepEqual(current, final, "canonical raw state agrees without normalizing at assertion time");
      assert.ok(current.scopeOccurrences.some(({ id }) => JSON.stringify(id) === JSON.stringify(insertion.patch.scope.id)));
      assert.equal(current.controlTokens.find(({ placeId }) => placeId === creation.input)?.multiplicity ?? 0, multiplicity - 1);
      assert.equal(current.logicalTimeMs, state.logicalTimeMs);
      assert.equal(current.endOccurrences, state.endOccurrences + (regionalKind === Kind.TerminateScope ? 1 : 0));
      for (const key of ["taskActivations", "messageActivations", "timerActivations", "effectActivations",
        "activityActivations", "eventRaceActivations"] as const) assert.deepEqual(current[key], state[key]);
      for (const key of ["scopeActivations", "callActivations"] as const) {
        assert.equal(current[key].find(({ elementId }) => elementId === "Unrelated:é😀")?.count,
          state[key].find(({ elementId }) => elementId === "Unrelated:é😀")?.count);
      }
    }
  });
}
