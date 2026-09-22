import assert from "node:assert/strict";
import { SemanticOperationKind as Kind, applyInternalOperationStep, compareCanonicalStrings } from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { RegionalKind } from "./internal-regional-pair-fixture.ts";
import { regionalScopeCreationFixture } from "./internal-regional-scope-creation-fixture.ts";
import type { ScopeCreationKind } from "./internal-regional-scope-creation-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

/** Constructed complete frontier with one member from each prepared family, not a profile-admission witness. */
export function regionalBatchFixture(kind: RegionalKind, creationKind: ScopeCreationKind, bounded = false) {
  const fixture = regionalScopeCreationFixture(kind, creationKind, bounded);
  const completed = applyInternalOperationStep(fixture.program, fixture.branches[1]!.selected, fixture.state);
  assert.ok(completed !== null);
  let prefix = completed.successor;
  if (bounded) {
    const merge = fixture.program.operations.find(({ id }) => id === `operation:${fixture.branches[1]!.name}_Merge`);
    assert.ok(merge !== undefined);
    const merged = applyInternalOperationStep(fixture.program, merge, prefix);
    assert.ok(merged !== null);
    prefix = merged.successor;
  }
  const place = (name: string) => `place:${name}`;
  const local = { ...operationBase("Local_Fork"), kind: Kind.Duplicate, input: place("Local_Input"),
    outputs: [place("Local_Left"), place("Local_Right")] } as const;
  const arming = { ...operationBase("Arm_Task"), kind: Kind.AwaitUserTask, input: place("Arm_Input"),
    output: place("Arm_Output"), task: { elementId: "Arm_Task", name: "Review independent work" } } as const;
  const names = ["Local_Input", "Local_Left", "Local_Right", "Arm_Input", "Arm_Output"];
  const program: SemanticProcessProgram = { ...fixture.program,
    operations: [...fixture.program.operations.map((operation) => {
      if (operation.id === "operation:Outer_Fork" && operation.kind === Kind.Duplicate) {
        return { ...operation, outputs: [...operation.outputs, local.input, arming.input].sort(compareCanonicalStrings) };
      }
      if (operation.id === "operation:Outer_Join" && operation.kind === Kind.Synchronize) {
        return { ...operation, inputs: [...operation.inputs, ...local.outputs, arming.output].sort(compareCanonicalStrings) };
      }
      return operation;
    }), local, arming].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...fixture.program.operationScopes, ...[local, arming].map(({ id }) =>
      ({ operationId: id, scopeId: fixture.owner.definitionScopeId }))]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
    controlPlaces: [...fixture.program.controlPlaces, ...names.map(controlPlace)]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    controlPlaceScopes: [...fixture.program.controlPlaceScopes, ...names.map((name) =>
      ({ controlPlaceId: place(name), scopeId: fixture.owner.definitionScopeId }))]
      .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
  };
  const state: RuntimeState = { ...prefix,
    controlTokens: [...prefix.controlTokens, ...[local.input, arming.input].map((placeId) =>
      ({ placeId, owner: fixture.owner, multiplicity: 1 }))].sort(compareTokenPlaces) };
  return { ...fixture, program, state, local, arming };
}
