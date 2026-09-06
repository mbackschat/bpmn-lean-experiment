import assert from "node:assert/strict";
import test from "node:test";

import {
  ActivityBodyKind,
  ControlStateKind,
  LocalDataOwnerKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  SemanticTransitionKind,
  VariableValueKind,
  initialState,
  projectFlowNodeOccurrenceLifecycleDelta,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitDataInputOutputUserTaskOperation,
  RuntimeState,
  SemanticProcessProgram,
  VariableBinding,
} from "@bpmn-lean/semantic-core";
import { rootScopedProgram, rootScopeOccurrence } from "./root-scope-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

type PreparationModule = typeof import("../src/internal-transition-data-arming-preparation.ts");
type PatchModule = typeof import("../src/internal-transition-data-arming-patch.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type PublicationModule = typeof import("../src/internal-publication-template.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as PublicationModule;
const { deriveInternalDataArmingPreparation: prepare } = await import(
  new URL("../dist/internal-transition-data-arming-preparation.js", import.meta.url).href
) as PreparationModule;
const { applyInternalDataArmingPatch: applyPatch } = await import(
  new URL("../dist/internal-transition-data-arming-patch.js", import.meta.url).href
) as PatchModule;
const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind: Atom,
  deriveInternalTransitionFootprint,
  internalTransitionFootprintsAreIndependent,
  internalTransitionStateFootprintsAreIndependent,
} = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const processId = "Process_ParallelClaimAssessment";
const instanceId = "claim-4711";
const owner = rootScopeOccurrence(processId, instanceId);
const source: VariableBinding = {
  name: "Property_ClaimSummary",
  value: { kind: VariableValueKind.String, value: "Claim summary" },
};
function task(suffix: string): AwaitDataInputOutputUserTaskOperation {
  return {
    ...operationBase(`UserTask_${suffix}`),
    kind: SemanticOperationKind.AwaitDataInputOutputUserTask,
    input: `place:Flow_Ready_${suffix}`,
    output: `place:Flow_${suffix}_Done`,
    task: { elementId: `UserTask_${suffix}`, name: suffix },
    directInput: {
      associationId: `DataInputAssociation_${suffix}`,
      sourcePropertyId: source.name,
      targetDataInputId: `DataInput_${suffix}`,
      targetDataInputName: "Claim summary",
    },
    directOutput: {
      associationId: `DataOutputAssociation_${suffix}`,
      sourceDataOutputId: `DataOutput_${suffix}`,
      sourceDataOutputName: "Decision",
      targetPropertyId: `Property_${suffix}Decision`,
    },
  };
}
const leftOperation = task("Coverage");
const rightOperation = task("Payment");
const operations = [leftOperation, rightOperation];
const program: SemanticProcessProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: SemanticProfileId.ActivityDataInputOutputUserTask,
    sourceId: "parallel-claim-preparation",
    sourceOverlay: null,
    sourceSha256: "0".repeat(64),
  },
  processId,
  controlPlaces: [
    controlPlace("Flow_Ready_Coverage"), controlPlace("Flow_Ready_Payment"),
    controlPlace("Flow_Coverage_Done"), controlPlace("Flow_Payment_Done"),
  ],
  operations,
});
const before: RuntimeState = {
  ...initialState,
  control: { kind: ControlStateKind.Running, instanceId },
  scopeOccurrences: [{ id: owner, parent: null }],
  scopeActivations: [{ elementId: owner.definitionScopeId, count: 1 }],
  controlTokens: operations.map(({ input: placeId }) => ({ placeId, owner, multiplicity: 1 })),
  taskActivations: [{ elementId: leftOperation.task.elementId, count: 2 }],
  activityActivations: [{ elementId: leftOperation.task.elementId, count: 7 }],
  logicalTimeMs: 321,
  variables: { ...initialState.variables, process: { bindings: [source] } },
};
const candidate = { operation: leftOperation, owner };
function required(state = before, operation = leftOperation) {
  const prepared = prepare(program, state, { operation, owner });
  assert.notEqual(prepared, null);
  return prepared!;
}
function withBindings(bindings: ReadonlyArray<VariableBinding>): RuntimeState {
  return { ...before, variables: { ...before.variables, process: { bindings } } };
}

test("composed preparation copies input into one joined lifetime with distinct counter domains", () => {
  const prepared = required();
  const taskId = { processInstanceId: instanceId, elementId: leftOperation.task.elementId, activation: 3 };
  const activityId = { processInstanceId: instanceId, activityElementId: leftOperation.task.elementId, activation: 8 };
  const after = applyPatch(before, prepared.patch);
  assert.deepEqual(after, {
    ...before,
    controlTokens: [before.controlTokens[1]],
    userTaskWaits: [{ id: taskId, owner, name: "Coverage", output: leftOperation.output }],
    taskActivations: [{ elementId: leftOperation.task.elementId, count: 3 }],
    activityActivations: [{ elementId: leftOperation.task.elementId, count: 8 }],
    activityOccurrences: [{
      id: activityId, owner, operationId: leftOperation.id,
      body: { kind: ActivityBodyKind.UserTask, task: taskId }, attachedHandlers: [],
    }],
    variables: {
      ...before.variables,
      activities: [{
        owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: activityId },
        bindings: [{ name: leftOperation.directInput.targetDataInputId, value: source.value }],
      }],
    },
  });
  assert.notEqual(prepared.patch.inputBinding.value, source.value);
  assert.deepEqual(prepared.publicationTemplate.record, {
    logicalTimeMs: 321,
    transition: {
      kind: SemanticTransitionKind.InternalOperation,
      operationId: leftOperation.id, operationKind: leftOperation.kind,
      origin: leftOperation.origin, owner,
    },
    positionDelta: {
      consumedTokens: [{ sequenceFlowId: "Flow_Ready_Coverage", owner, multiplicity: 1 }],
      producedTokens: [], enteredScopes: [], exitedScopes: [],
    },
  });
  assert.deepEqual(prepared.publicationTemplate.lifecycle, {
    started: [{ anchor: { kind: "wait", id: taskId }, processId, elementId: taskId.elementId, owner }],
    ended: [],
  });
  assert.equal(prepared.footprint.reads.some(({ kind }) => kind === Atom.LogicalTime), true);
  assert.deepEqual(prepared.footprint.reads.filter(({ kind }) => kind === Atom.ProcessVariable), [
    { kind: Atom.ProcessVariable, name: source.name },
  ]);
  assert.equal(prepared.footprint.writes.some(({ kind }) => kind === Atom.ProcessVariable), false);
});

test("shared Process reads preserve complete sibling preparation and commute as raw local edits", () => {
  const left = required();
  const right = required(before, rightOperation);
  assert.equal(internalTransitionFootprintsAreIndependent(left.footprint, right.footprint), true);
  const afterLeft = applyPatch(before, left.patch);
  const afterRight = applyPatch(before, right.patch);
  assert.deepEqual(prepare(program, afterLeft, { operation: rightOperation, owner }), right);
  assert.deepEqual(prepare(program, afterRight, candidate), left);
  assert.deepEqual(applyPatch(afterLeft, right.patch), applyPatch(afterRight, left.patch));
  assert.deepEqual(before.variables.activities, []);
  const writer = { reads: [], writes: [{ kind: Atom.ProcessVariable, name: source.name }] } as const;
  assert.equal(internalTransitionStateFootprintsAreIndependent(left.footprint, writer), false);
});

test("composed preparation keeps absence distinct from present null and empty String", () => {
  for (const value of [{ kind: VariableValueKind.Null }, { kind: VariableValueKind.String, value: "" }] as const) {
    assert.notEqual(prepare(program, withBindings([{ name: source.name, value }]), candidate), null);
  }
  for (const bindings of [[], [source, source], [{ name: source.name, value: { kind: VariableValueKind.Boolean, value: true } }]] as const) {
    assert.equal(prepare(program, withBindings(bindings), candidate), null);
  }
});

test("both data-arming orders publish exactly the accepted wait starts at arbitrary indices", () => {
  const left = required();
  const right = required(before, rightOperation);
  for (const ordered of [[left, right], [right, left]]) {
    let current = before;
    for (const [index, prepared] of ordered.entries()) {
      const successor = applyPatch(current, prepared.patch);
      const transitionIndex = 17 + index;
      const instantiated = instantiateInternalPublicationBatch("claim-review", transitionIndex,
        [prepared.publicationTemplate]);
      assert.ok(instantiated !== null);
      const actual = projectFlowNodeOccurrenceLifecycleDelta(program, current, successor, {
        kind: "internal", operation: prepared.operation, owner,
      }, "claim-review", transitionIndex);
      assert.ok(actual !== null);
      assert.deepEqual(instantiated[0]?.lifecycle, actual);
      current = successor;
    }
  }
  assert.deepEqual(
    instantiateInternalPublicationBatch("claim-review", 17,
      [left.publicationTemplate, right.publicationTemplate]),
    instantiateInternalPublicationBatch("claim-review", 17,
      [right.publicationTemplate, left.publicationTemplate]),
  );
});

test("composed preparation refuses ambiguous declarations, owners and token buckets", () => {
  const otherDeclaration = { ...leftOperation, id: "operation:DuplicateDeclaration" };
  const duplicateDeclarer = { ...program, operations: [...program.operations, otherDeclaration] };
  assert.equal(prepare(duplicateDeclarer, before, candidate), null);
  assert.equal(prepare(program, before, { ...candidate, operation: { ...leftOperation, output: "stale" } }), null);
  assert.equal(prepare(program, { ...before, scopeOccurrences: [] }, candidate), null);
  assert.equal(prepare(program, { ...before, scopeOccurrences: [...before.scopeOccurrences, ...before.scopeOccurrences] }, candidate), null);
  assert.equal(prepare(program, { ...before, controlTokens: [...before.controlTokens, before.controlTokens[0]!] }, candidate), null);
  assert.equal(prepare(program, { ...before, controlTokens: before.controlTokens.slice(1) }, candidate), null);
  assert.equal(prepare(program, before, { ...candidate, owner: null }), null);
});

test("composed preparation separates tagged local scopes and rejects Activity body or public-anchor collisions", () => {
  const prepared = required();
  const taskId = prepared.patch.wait.id;
  const activityId = prepared.patch.record.id;
  const effectScope = { owner: { kind: LocalDataOwnerKind.EffectOccurrence, id: taskId }, bindings: [] } as const;
  const effectBefore = { ...before, variables: { ...before.variables, activities: [effectScope] } };
  assert.notEqual(prepare(program, effectBefore, candidate), null);
  const activityScope = { owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: activityId }, bindings: [] } as const;
  assert.equal(prepare(program, { ...before, variables: { ...before.variables, activities: [activityScope] } }, candidate), null);
  assert.equal(prepare(program, { ...before, activityOccurrences: [prepared.patch.record] }, candidate), null);
  assert.equal(prepare(program, {
    ...before,
    activityOccurrences: [{ ...prepared.patch.record, id: { ...activityId, activation: 99 } }],
  }, candidate), null);
  assert.equal(prepare(program, {
    ...before,
    timerWaits: [{ id: taskId, owner, deadlineMs: 1000, output: leftOperation.output }],
  }, candidate), null);
});

test("composed preparation rejects unsafe issuance while preserving the unavailable production footprint", () => {
  for (const counter of [Number.MAX_SAFE_INTEGER, -1, Number.POSITIVE_INFINITY]) {
    for (const field of ["taskActivations", "activityActivations"] as const) {
      assert.equal(prepare(program, {
        ...before, [field]: [{ elementId: leftOperation.task.elementId, count: counter }],
      }, candidate), null);
    }
  }
  const footprint = required().footprint;
  assert.equal(footprint.writes.some((atom) => atom.kind === Atom.Activation && atom.occurrenceKind === InternalOccurrenceKind.Activity), true);
  assert.equal(footprint.writes.some((atom) => atom.kind === Atom.Activation && atom.occurrenceKind === InternalOccurrenceKind.UserTask), true);
  assert.equal(deriveInternalTransitionFootprint(program, before, candidate), null);
});
