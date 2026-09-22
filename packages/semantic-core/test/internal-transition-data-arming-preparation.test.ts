import assert from "node:assert/strict";
import test from "node:test";

import {
  ActivityBodyKind,
  ControlStateKind,
  CorrelationScalarPathLanguage,
  LocalDataOwnerKind,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  SemanticTransitionKind,
  VariableValueKind,
  applyInternalOperationStep,
  compareCanonicalStrings,
  initialState,
  isWellFormedRuntimeState,
  isWellFormedSemanticProcessProgram,
  projectFlowNodeOccurrenceLifecycleDelta,
  projectOpenFlowNodeOccurrences,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitDataInputOutputUserTaskOperation,
  RuntimeState,
  SemanticProcessProgram,
  VariableBinding,
} from "@bpmn-lean/semantic-core";
import { rootScopedProgram, rootScopeOccurrence } from "./root-scope-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import type { InternalOrdinaryArmingOperation as OrdinaryOperation } from "../src/internal-transition-ordinary-arming-patch.ts";

type PreparationModule = typeof import("../src/internal-transition-data-arming-preparation.ts");
type PatchModule = typeof import("../src/internal-transition-data-arming-patch.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type PublicationModule = typeof import("../src/internal-publication-template.ts");
type OrdinaryPreparationModule = typeof import("../src/internal-transition-ordinary-arming-preparation.ts");
type OrdinaryPatchModule = typeof import("../src/internal-transition-ordinary-arming-patch.ts");
const { deriveInternalOrdinaryArmingPreparation: prepareOrdinary } = await import(
  new URL("../dist/internal-transition-ordinary-arming-preparation.js", import.meta.url).href
) as OrdinaryPreparationModule;
const { applyInternalOrdinaryArmingPatch: applyOrdinaryPatch } = await import(
  new URL("../dist/internal-transition-ordinary-arming-patch.js", import.meta.url).href
) as OrdinaryPatchModule;
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
  assert.deepEqual(new Set(prepared.footprint.reads.flatMap((atom) =>
    atom.kind === Atom.TokenOwners ? [atom.placeId] : []
  )), new Set([leftOperation.input]));
  assert.deepEqual(new Set(prepared.footprint.writes.flatMap((atom) =>
    atom.kind === Atom.TokenOwners ? [atom.placeId] : []
  )), new Set([leftOperation.input]));
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
  assert.notEqual(prepared.patch.bindings[0]!.value, source.value);
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

test("standalone input preparation copies only a unique String or Null while output ignores Process data", () => {
  const { directOutput: _output, ...input } = leftOperation;
  const { directInput: _input, ...output } = rightOperation;
  const inputOperation = { ...input, kind: SemanticOperationKind.AwaitDataInputUserTask } as const;
  const outputOperation = { ...output, kind: SemanticOperationKind.AwaitDataOutputUserTask } as const;
  const standalone = { ...program, operations: [inputOperation, outputOperation] };
  const available = [
    { kind: VariableValueKind.Null },
    { kind: VariableValueKind.String, value: "" },
    { kind: VariableValueKind.String, value: "Quote: \"; slash: \\; newline: \n" },
  ] as const;
  for (const value of available) {
    const state = withBindings([{ name: source.name, value }]);
    const prepared = prepare(standalone, state, { operation: inputOperation, owner });
    assert.ok(prepared !== null);
    assert.deepEqual(prepared.patch.bindings, [{ name: inputOperation.directInput.targetDataInputId, value }]);
    assert.notEqual(prepared.patch.bindings[0]!.value, value);
    assert.deepEqual(applyPatch(state, prepared.patch), applyInternalOperationStep(standalone, inputOperation, state)?.successor);
  }
  const unavailable: ReadonlyArray<ReadonlyArray<VariableBinding>> = [
    [], [source, source],
    [{ name: source.name, value: { kind: VariableValueKind.Boolean, value: true } }],
    [{ name: source.name, value: { kind: VariableValueKind.Integer, value: 1 } }],
    [{ name: source.name, value: { kind: VariableValueKind.StringList, value: [] } }],
  ];
  for (const bindings of unavailable) {
    const state = withBindings(bindings);
    assert.equal(prepare(standalone, state, { operation: inputOperation, owner }), null);
    const prepared = prepare(standalone, state, { operation: outputOperation, owner });
    assert.ok(prepared !== null);
    assert.deepEqual(prepared.patch.bindings, []);
    assert.deepEqual(applyPatch(state, prepared.patch), applyInternalOperationStep(standalone, outputOperation, state)?.successor);
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
  const effectScope = {
    owner: {
      kind: LocalDataOwnerKind.EffectOccurrence,
      id: { processInstanceId: activityId.processInstanceId, elementId: activityId.activityElementId, activation: activityId.activation },
    },
    bindings: [],
  } as const;
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

function ordinaryOperations(): ReadonlyArray<OrdinaryOperation> {
  const input = "place:Flow_Ready_Ordinary";
  const output = "place:Flow_Ordinary_Done";
  const channel = {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_Claim", interfaceOperationId: "Operation_Claim", messageId: "Message_Claim",
  } as const;
  const message = { elementId: "MessageCatch_Claim", channel };
  const messageBase = { ...operationBase(message.elementId), input, output, message };
  return [
    { ...operationBase("UserTask_Ordinary"), kind: SemanticOperationKind.AwaitUserTask,
      input, output, task: { elementId: "UserTask_Ordinary", name: "Ordinary review" } },
    { ...messageBase, kind: SemanticOperationKind.AwaitMessage },
    { ...messageBase, kind: SemanticOperationKind.AwaitPayloadMessage,
      directOutput: { associationId: "MessageOutputAssociation", sourceDataOutputId: "MessageOutput",
        sourceDataOutputName: "Message result", targetPropertyId: "Property_MessageResult" } },
    { ...messageBase, kind: SemanticOperationKind.AwaitCorrelatedPayloadMessage,
      correlationKeyId: "ClaimKey", correlationPropertyId: "ClaimProperty",
      payloadSelector: { language: CorrelationScalarPathLanguage, body: "payload" },
      processPropertySelector: { language: CorrelationScalarPathLanguage,
        body: `property:${source.name}`, propertyId: source.name } },
    { ...operationBase("Timer_Claim"), kind: SemanticOperationKind.AwaitTimer,
      input, output, timer: { elementId: "Timer_Claim", durationMs: 1000 } },
    { ...operationBase(leftOperation.task.elementId), id: "operation:Effect_Claim",
      kind: SemanticOperationKind.AwaitEffect, input, output, bpmnErrorRoute: null,
      effect: { elementId: leftOperation.task.elementId,
        descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "urn:bpmn-lean:effect-operation:probe-v1" },
        inputMappings: [],
        outputMappings: [] } },
  ];
}

function mixedProgram(ordinary: OrdinaryOperation): SemanticProcessProgram {
  const placeNames = ["Flow_Start_Fork", "Flow_Ready_Coverage", "Flow_Ready_Ordinary",
    "Flow_Coverage_Done", "Flow_Ordinary_Done", "Flow_Join_End"];
  return rootScopedProgram({
    ...program,
    controlPlaces: placeNames.map(controlPlace).sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    operations: [
      { ...operationBase("Start_Claim"), kind: SemanticOperationKind.Initiate, output: "place:Flow_Start_Fork" },
      { ...operationBase("Fork_Claim"), kind: SemanticOperationKind.Duplicate, input: "place:Flow_Start_Fork",
        outputs: [leftOperation.input, ordinary.input] },
      leftOperation, ordinary,
      { ...operationBase("Join_Claim"), kind: SemanticOperationKind.Synchronize,
        inputs: [leftOperation.output, ordinary.output], output: "place:Flow_Join_End" },
      { ...operationBase("End_Claim"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:Flow_Join_End" },
    ],
  });
}

for (const ordinary of ordinaryOperations()) {
  test(`composed and ${ordinary.kind} preserve complete preparation, raw state and accepted publication`, () => {
    const mixed = mixedProgram(ordinary);
    const state: RuntimeState = {
      ...before,
      controlTokens: [leftOperation.input, ordinary.input].map((placeId) => ({ placeId, owner, multiplicity: 1 })),
      effectActivations: ordinary.kind === SemanticOperationKind.AwaitEffect
        ? [{ elementId: ordinary.effect.elementId, count: 7 }] : [],
      variables: ordinary.kind === SemanticOperationKind.AwaitEffect
        ? { ...before.variables, process: { bindings: [{ name: source.name, value: { kind: VariableValueKind.Null } }] } }
        : before.variables,
    };
    assert.equal(isWellFormedSemanticProcessProgram(mixed), true);
    const data = prepare(mixed, state, candidate);
    const wait = prepareOrdinary(mixed, state, { operation: ordinary, owner });
    assert.ok(data !== null && wait !== null);
    assert.equal(internalTransitionFootprintsAreIndependent(data.footprint, wait.footprint), true);
    const afterData = applyPatch(state, data.patch);
    const afterOrdinary = applyOrdinaryPatch(state, wait.patch);
    assert.deepEqual(prepareOrdinary(mixed, afterData, { operation: ordinary, owner }), wait);
    assert.deepEqual(prepare(mixed, afterOrdinary, candidate), data);
    const dataThenOrdinary = applyOrdinaryPatch(afterData, wait.patch);
    assert.deepEqual(dataThenOrdinary, applyPatch(afterOrdinary, data.patch));
    for (const intermediate of [state, afterData, afterOrdinary, dataThenOrdinary]) {
      assert.equal(isWellFormedRuntimeState(mixed, instanceId, intermediate), true);
      assert.notEqual(projectOpenFlowNodeOccurrences(mixed, intermediate), null);
    }
    const entries = [
      { operation: data.operation, template: data.publicationTemplate, apply: (current: RuntimeState) => applyPatch(current, data.patch) },
      { operation: wait.operation, template: wait.publicationTemplate, apply: (current: RuntimeState) => applyOrdinaryPatch(current, wait.patch) },
    ];
    for (const order of [entries, entries.toReversed()]) {
      let current = state;
      for (const [index, entry] of order.entries()) {
        const successor = entry.apply(current);
        assert.deepEqual(applyInternalOperationStep(mixed, entry.operation, current)?.successor, successor);
        const actual = projectFlowNodeOccurrenceLifecycleDelta(mixed, current, successor,
          { kind: "internal", operation: entry.operation, owner }, "mixed-claim", 23 + index);
        assert.ok(actual !== null);
        const instantiated = instantiateInternalPublicationBatch("mixed-claim", 23 + index, [entry.template]);
        assert.ok(instantiated !== null);
        assert.deepEqual(instantiated[0]?.lifecycle, actual);
        current = successor;
      }
    }
    assert.deepEqual(
      instantiateInternalPublicationBatch("mixed-claim", 23, entries.map(({ template }) => template)),
      instantiateInternalPublicationBatch("mixed-claim", 23, entries.toReversed().map(({ template }) => template)),
    );
    if (ordinary.kind === SemanticOperationKind.AwaitCorrelatedPayloadMessage) {
      const writer = { reads: [], writes: [{ kind: Atom.ProcessVariable, name: source.name }] } as const;
      for (const footprint of [data.footprint, wait.footprint]) {
        assert.deepEqual(footprint.reads.filter(({ kind }) => kind === Atom.ProcessVariable),
          [{ kind: Atom.ProcessVariable, name: source.name }]);
        assert.equal(footprint.writes.some(({ kind }) => kind === Atom.ProcessVariable), false);
        assert.equal(internalTransitionStateFootprintsAreIndependent(footprint, writer), false);
      }
    }
    if (ordinary.kind === SemanticOperationKind.AwaitEffect) {
      assert.deepEqual(dataThenOrdinary.variables.activities.map(({ owner: local }) => local.kind),
        [LocalDataOwnerKind.EffectOccurrence, LocalDataOwnerKind.ActivityOccurrence]);
      const collision = { ...state, effectActivations: [{ elementId: ordinary.effect.elementId, count: 2 }] };
      const colliding = prepareOrdinary(mixed, collision, { operation: ordinary, owner });
      assert.ok(colliding !== null);
      assert.equal(internalTransitionFootprintsAreIndependent(data.footprint, colliding.footprint), false);
    }
  });
}
