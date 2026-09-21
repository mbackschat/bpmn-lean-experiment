import assert from "node:assert/strict";
import { SemanticOperationKind as Kind, compareCanonicalStrings } from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { InternalScopeCreationOperation } from "../src/internal-transition-scope-creation-preparation.ts";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";
import type { RegionalKind } from "./internal-regional-pair-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

export const scopeCreationKinds = [Kind.EnterScope, Kind.InvokeProcess] as const;
export type ScopeCreationKind = typeof scopeCreationKinds[number];

/** The pending side branch creates a scope beside an enabled regional operation. */
export function regionalScopeCreationFixture(regionalKind: RegionalKind, kind: ScopeCreationKind,
  boundedCompletion = false, insideRegion = false) {
  const fixture = regionalPairFixture(regionalKind, Kind.CompleteScope, boundedCompletion);
  const side = insideRegion
    ? fixture.program.operations.find(({ id }) => id === `operation:${fixture.branches[0]!.name}_Sibling_Task`)
    : fixture.side;
  assert.ok(side?.kind === Kind.AwaitUserTask);
  let state: RuntimeState = fixture.state;
  if (insideRegion) {
    const wait = state.userTaskWaits.find(({ id }) => id.elementId === side.task.elementId);
    assert.ok(wait !== undefined);
    state = { ...state, userTaskWaits: state.userTaskWaits.filter((entry) => entry !== wait),
      controlTokens: [...state.controlTokens, { placeId: side.input, owner: wait.owner, multiplicity: 1 }]
        .sort(compareTokenPlaces) };
  }
  const owner = state.controlTokens.find(({ placeId }) => placeId === side.input)!.owner;
  const name = side.origin.elementId;
  const scopeId = "scope:Side_Created:é😀";
  const calledProcessId = "Process_Side_Created:é😀";
  const entry = "place:Side_Created_Entry";
  const end = "place:Side_Created_End";
  const creation: InternalScopeCreationOperation = kind === Kind.EnterScope
    ? { ...operationBase(name), kind, input: side.input, childEntry: entry, childScopeId: scopeId }
    : { ...operationBase(name), kind, input: side.input, calledEntry: entry, calledProcessId,
      calledRootScopeId: scopeId, returnOperationId: "operation:Return_Side_Created" };
  const additions: SemanticOperation[] = [
    { ...operationBase("Side_Created_Task"), kind: Kind.AwaitUserTask, input: entry, output: end,
      task: { elementId: "Side_Created_Task", name: "Review created work" } },
    { ...operationBase("Side_Created_End"), kind: Kind.ReachNoneEnd, input: end },
    kind === Kind.EnterScope
      ? { ...operationBase("Complete_Side_Created"), origin: creation.origin, kind: Kind.CompleteScope,
        scopeId, parentOutput: side.output }
      : { ...operationBase("Return_Side_Created"), origin: creation.origin, kind: Kind.ReturnProcess,
        calledProcessId, calledRootScopeId: scopeId, callerOutput: side.output },
  ];
  const program: SemanticProcessProgram = { ...fixture.program,
    definitionScopes: [...fixture.program.definitionScopes, { id: scopeId,
      parentScopeId: kind === Kind.EnterScope ? owner.definitionScopeId : null,
      originElementId: kind === Kind.EnterScope ? name : calledProcessId }]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operations: [...fixture.program.operations.map((operation) => operation === side ? creation : operation), ...additions]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...fixture.program.operationScopes, ...additions.map((operation) => ({ operationId: operation.id, scopeId }))]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
    controlPlaces: [...fixture.program.controlPlaces, ...[entry, end].map((place) => controlPlace(place.slice(6)))]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    controlPlaceScopes: [...fixture.program.controlPlaceScopes, ...[entry, end].map((controlPlaceId) => ({ controlPlaceId, scopeId }))]
      .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
  };
  return { ...fixture, program, state, creation, owner, regional: fixture.branches[0]!.selected };
}
