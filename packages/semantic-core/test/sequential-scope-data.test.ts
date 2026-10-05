import type { VariableMapping } from "../src/semantic-value-contract.ts";
import { program as scopeProgram } from "./embedded-subprocess-fixture.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState, ControlStateKind, SemanticOperationKind as Op, SemanticOriginKind,
  VariableValueKind as Value, MappingExpressionKind as Mapping, StimulusKind, applyInternalOperationStep, addActivityVariableScope } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId, SemanticOperation, VariableBinding } from "@bpmn-lean/semantic-core";
import type { EnterSequentialMultiInstanceScopeOperation } from "../src/semantic-process-contract.ts";
const { enterSequentialScope, completeSequentialScope } = await import(new URL("../dist/sequential-scope-runtime.js", import.meta.url).href) as typeof import("../src/sequential-scope-runtime.ts");
const { evaluateSequentialScopeInputs: inputs, writeSequentialScopeValues: write, SequentialScopeWriteKind: Write } =
  await import(new URL("../dist/sequential-scope-data.js", import.meta.url).href) as typeof import("../src/sequential-scope-data.ts");
const { analyzeSequentialScopeData, sequentialScopeStartDataAdmitted } = await import(new URL("../dist/sequential-scope-data-admission.js", import.meta.url).href) as typeof import("../src/sequential-scope-data-admission.ts");
const parent: ScopeOccurrenceId = { processInstanceId: "invoices", definitionScopeId: "root", activation: 1 };
const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement, elementId } as const);
const entry: EnterSequentialMultiInstanceScopeOperation = { kind: Op.EnterSequentialMultiInstanceScope, id: "enter",
  origin: origin("Batch"), input: "in", childEntry: "body-in", childScopeId: "body", normalOutput: "out",
  collectionName: "invoices", itemName: "invoice", completionBooleanName: "stop",
  bodyInputs: [{ target: "status", expression: { kind: Mapping.EnclosingVariable, name: "initialStatus" } }] };
const service: SemanticOperation = { kind: Op.AwaitEffect, id: "validate", origin: origin("Validate"), input: "body-in", output: "body-out",
  effect: { elementId: "Validate", descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "validateInvoice" },
    inputMappings: [], outputMappings: [] }, bpmnErrorRoute: null };
const program = { operations: [entry, service] };
function running(): RuntimeState {
  const state = enterSequentialScope(entry, { ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: parent.processInstanceId },
    controlTokens: [{ placeId: "in", owner: parent, multiplicity: 1 }], scopeOccurrences: [{ id: parent, parent: null }],
    variables: { ...initialState.variables, process: { bindings: [
      { name: "initialStatus", value: { kind: Value.Null } },
      { name: "invoice", value: { kind: Value.String, value: "parent-item-shadow" } },
      { name: "invoices", value: { kind: Value.StringList, value: ["INV-01", "INV-02"] } },
      { name: "status", value: { kind: Value.String, value: "parent-status" } },
      { name: "stop", value: { kind: Value.Boolean, value: false } },
    ] } } }, parent);
  assert.ok(state);
  return state;
}
function body(state: RuntimeState): ScopeOccurrenceId {
  const owner = state.variables.scopes[0]?.owner;
  assert.ok(owner);
  return owner;
}
const read = (name: string): readonly VariableMapping[] => [{ target: "argument", expression: { kind: Mapping.EnclosingVariable, name } }];

test("body inputs resolve local null before Process data and captured item before a Process namesake", () => {
  const state = running();
  assert.deepEqual(inputs(program, state, body(state), read("status")), [{ name: "argument", value: { kind: Value.Null } }]);
  assert.deepEqual(inputs(program, state, body(state), read("invoice")), [{ name: "argument", value: { kind: Value.String, value: "INV-01" } }]);
  assert.deepEqual(inputs(program, state, body(state), read("initialStatus")), [{ name: "argument", value: { kind: Value.Null } }]);
  assert.equal(inputs(program, state, body(state), read("absent")), null);
  assert.deepEqual(inputs(program, state, body(state), [
    { target: "z", expression: { kind: Mapping.EnclosingVariable, name: "invoice" } },
    { target: "a", expression: { kind: Mapping.EnclosingVariable, name: "status" } },
  ]), [{ name: "a", value: { kind: Value.Null } }, { name: "z", value: { kind: Value.String, value: "INV-01" } }]);
  assert.equal(inputs(program, state, body(state), [...read("status"), ...read("invoice")]), null);
});
test("completion writes existing body names locally and creates other names at Process scope", () => {
  const state = running();
  for (const kind of [Write.UserTask, Write.ServiceTask]) {
    const result = write(program, state, body(state), [
      { name: "newValue", value: { kind: Value.String, value: "created" } },
      { name: "status", value: { kind: Value.String, value: "checked" } },
    ], kind);
    assert.ok(result);
    assert.deepEqual(result.scopes[0]?.bindings, [{ name: "status", value: { kind: Value.String, value: "checked" } }]);
    assert.deepEqual(result.process.bindings.find(({ name }) => name === "status"), state.variables.process.bindings.find(({ name }) => name === "status"));
    assert.deepEqual(result.process.bindings.find(({ name }) => name === "newValue"), { name: "newValue", value: { kind: Value.String, value: "created" } });
  }
});
test("only a User Task may write the selected Process condition and only as Boolean", () => {
  const state = running();
  const patch: readonly VariableBinding[] = [{ name: "stop", value: { kind: Value.Boolean, value: true } }];
  const result = write(program, state, body(state), patch, Write.UserTask);
  assert.ok(result);
  assert.deepEqual(result.process.bindings.find(({ name }) => name === "stop"), patch[0]);
  assert.deepEqual(result.scopes, state.variables.scopes);
  assert.equal(write(program, state, body(state), patch, Write.ServiceTask), null);
  assert.equal(write(program, state, body(state), [{ name: "status", value: { kind: Value.Boolean, value: true } }], Write.UserTask), null);
  assert.equal(write(program, state, body(state), [{ name: "stop", value: { kind: Value.String, value: "true" } }], Write.UserTask), null);
});
test("protected names and stale or ambiguous body ownership reject atomically", () => {
  const state = running();
  const saved = structuredClone(state);
  for (const name of ["invoices", "invoice", "validateInvoice"]) {
    assert.equal(write(program, state, body(state), [{ name, value: { kind: Value.Null } }], Write.UserTask), null);
  }
  const owner = body(state);
  for (const candidate of [
    { ...state, sequentialScopeControllers: [] },
    { ...state, sequentialScopeControllers: [...(state.sequentialScopeControllers ?? []), ...(state.sequentialScopeControllers ?? [])] },
    { ...state, variables: { ...state.variables, scopes: [...state.variables.scopes, ...state.variables.scopes] } },
  ]) {
    assert.equal(inputs(program, candidate, owner, read("status")), null);
    assert.equal(write(program, candidate, owner, [], Write.UserTask), null);
  }
  assert.equal(inputs(program, state, { ...owner, activation: owner.activation + 1 }, read("status")), null);
  assert.deepEqual(state, saved);
});

const { completeOrdinaryUserTask } = await import(new URL("../dist/semantic-process-user-task-runtime.js", import.meta.url).href) as typeof import("../src/semantic-process-user-task-runtime.ts");
test("ordinary human completion applies body-local writes and the Process condition atomically", () => {
  const state = running();
  const owner = body(state);
  const taskId = { processInstanceId: owner.processInstanceId, elementId: "Review", activation: 1 };
  const waiting: RuntimeState = { ...state, controlTokens: [], userTaskWaits: [{ id: taskId, owner, name: null, output: "body-end" }] };
  const submittedValues: readonly VariableBinding[] = [
    { name: "status", value: { kind: Value.String, value: "approved" } },
    { name: "stop", value: { kind: Value.Boolean, value: true } },
  ];
  const after = completeOrdinaryUserTask({ ...scopeProgram, ...program }, waiting,
    { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review-completion", taskId, submittedValues });
  assert.ok(after);
  assert.deepEqual(after.variables.scopes[0]?.bindings, [submittedValues[0]]);
  assert.deepEqual(after.variables.process.bindings.find(({ name }) => name === "status"),
    state.variables.process.bindings.find(({ name }) => name === "status"));
  assert.deepEqual(after.variables.process.bindings.find(({ name }) => name === "stop"), submittedValues[1]);
  assert.deepEqual(after.controlTokens, [{ owner, placeId: "body-end", multiplicity: 1 }]);
  assert.deepEqual(after.userTaskWaits, []);
  assert.deepEqual(after.sequentialScopeControllers, state.sequentialScopeControllers);
  assert.equal(completeOrdinaryUserTask({ ...scopeProgram, ...program }, waiting,
    { kind: StimulusKind.CompleteUserTaskInstance, commandId: "rejected-item-write", taskId, submittedValues: [{ name: "invoice", value: { kind: Value.Null } }] }), null);
});


test("Service arming snapshots current body locals and item instead of Process namesakes", () => {
  const state = running();
  const saved = structuredClone(state);
  assert.equal(service.kind, Op.AwaitEffect);
  const operation = { ...service, effect: { ...service.effect, inputMappings: [
    { target: "item", expression: { kind: Mapping.EnclosingVariable, name: "invoice" } },
    { target: "status", expression: { kind: Mapping.EnclosingVariable, name: "status" } },
  ] } } as const;
  const selected = { ...scopeProgram, operations: [entry, operation], operationScopes: [
    { operationId: entry.id, scopeId: "root" }, { operationId: operation.id, scopeId: "body" },
  ] };
  const step = applyInternalOperationStep(selected, operation, state);
  assert.ok(step);
  assert.deepEqual(step.owner, body(state));
  assert.deepEqual(step.successor.effectWaits[0]?.arguments, [
    { name: "item", value: { kind: Value.String, value: "INV-01" } },
    { name: "status", value: { kind: Value.Null } },
  ]);
  assert.equal(applyInternalOperationStep(selected, operation,
    { ...state, sequentialScopeControllers: [] }), null);
  assert.deepEqual(state, saved);
});

const { completeSequentialScopeEffectData } = await import(new URL("../dist/sequential-scope-data.js", import.meta.url).href) as typeof import("../src/sequential-scope-data.ts");
test("Service results map explicit locals into the body and dispose only their effect data", () => {
  const state = running();
  const owner = body(state);
  const operation = { ...service, effect: { ...service.effect, outputMappings: [
    { target: "status", expression: { kind: Mapping.LocalVariable, name: "result" } },
  ] } } as const;
  const selected = { ...scopeProgram, operations: [entry, operation], operationScopes: [
    { operationId: entry.id, scopeId: "root" }, { operationId: operation.id, scopeId: "body" },
  ] };
  const armed = applyInternalOperationStep(selected, operation, state)?.successor;
  assert.ok(armed);
  const wait = armed.effectWaits[0];
  assert.ok(wait);
  const sibling = { ...wait.id, elementId: "Sibling" };
  const withSibling = { ...armed, variables: addActivityVariableScope(armed.variables, sibling, []) };
  const completedWithSibling = completeSequentialScopeEffectData(selected, withSibling, wait,
    [{ name: "result", value: { kind: Value.Null } }]);
  assert.ok(completedWithSibling);
  assert.deepEqual(completedWithSibling.activities, withSibling.variables.activities.filter(scope =>
    !armed.variables.activities.includes(scope)));
  for (const activities of [[], [...armed.variables.activities, ...armed.variables.activities]]) {
    assert.equal(completeSequentialScopeEffectData(selected,
      { ...armed, variables: { ...armed.variables, activities } }, wait,
      [{ name: "result", value: { kind: Value.Null } }]), null);
  }
  const saved = structuredClone(armed);
  for (const value of [{ kind: Value.Null }, { kind: Value.String, value: "accepted" }] as const) {
    const variables = completeSequentialScopeEffectData(selected, armed, wait, [{ name: "result", value }]);
    assert.ok(variables);
    assert.deepEqual(variables.scopes[0]?.bindings, [{ name: "status", value }]);
    assert.deepEqual(variables.process, armed.variables.process);
    assert.deepEqual(variables.activities, []);
  }
  assert.equal(completeSequentialScopeEffectData(selected, armed, wait, []), null);
  assert.equal(completeSequentialScopeEffectData(selected, { ...armed, sequentialScopeControllers: [] }, wait,
    [{ name: "result", value: { kind: Value.Null } }]), null);
  for (const target of ["invoice", "invoices", "stop", "validateInvoice"]) {
    assert.equal(completeSequentialScopeEffectData(selected, armed,
      { ...wait, outputMappings: [{ target, expression: { kind: Mapping.LocalVariable, name: "result" } }] },
      [{ name: "result", value: { kind: Value.Null } }]), null);
  }
  assert.deepEqual(armed, saved);
  assert.deepEqual(owner, body(armed));
});

const { deriveInternalTransitionFootprint, internalTransitionStateFootprintsAreIndependent, InternalTransitionStateAtomKind: Atom } =
  await import(new URL("../dist/internal-transition-footprint.js", import.meta.url).href) as typeof import("../src/internal-transition-footprint.ts");
const { stateSetsAreDisjoint } = await import(new URL("../dist/internal-transition-footprint-ordering.js", import.meta.url).href) as typeof import("../src/internal-transition-footprint-ordering.ts");
const { deriveInternalOrdinaryArmingPreparation } = await import(new URL("../dist/internal-transition-ordinary-arming-preparation.js", import.meta.url).href) as typeof import("../src/internal-transition-ordinary-arming-preparation.ts");

test("prepared Service arming tracks body data, captured item and actual Process fallback", () => {
  const state = running();
  const owner = body(state);
  const operation = { ...service, effect: { ...service.effect, inputMappings: [
    { target: "item", expression: { kind: Mapping.EnclosingVariable, name: "invoice" } },
    { target: "status", expression: { kind: Mapping.EnclosingVariable, name: "status" } },
    { target: "fallback", expression: { kind: Mapping.EnclosingVariable, name: "initialStatus" } },
  ] } } as const;
  const selected = { ...scopeProgram, operations: [entry, operation],
    definitionScopes: [
      { id: "root", parentScopeId: null, originElementId: scopeProgram.processId },
      { id: "body", parentScopeId: "root", originElementId: "Batch" },
    ],
    operationScopes: [{ operationId: entry.id, scopeId: "root" }, { operationId: operation.id, scopeId: "body" }],
    controlPlaceScopes: [{ controlPlaceId: operation.input, scopeId: "body" }],
    controlPlaces: [{ id: operation.input, origin: { kind: SemanticOriginKind.BpmnSequenceFlow as const, elementId: "body-flow" } }],
  };
  const candidate = { operation, owner };
  const footprint = deriveInternalTransitionFootprint(selected, state, candidate);
  assert.ok(footprint);
  assert.deepEqual(footprint.reads.filter(atom => atom.kind === Atom.ProcessVariable),
    [{ kind: Atom.ProcessVariable, name: "initialStatus" }]);
  const locals = { kind: Atom.ScopeVariableScope, owner } as const;
  const controller = { kind: Atom.SequentialScopeController, id: state.activityOccurrences[0]!.id, owner: parent } as const;
  for (const dependency of [locals, controller]) {
    assert.equal(stateSetsAreDisjoint(footprint.reads, [dependency]), false);
    assert.equal(stateSetsAreDisjoint(footprint.writes, [dependency]), true);
    assert.equal(stateSetsAreDisjoint([dependency], [{ kind: Atom.OccurrenceRegion, region: { root: parent, members: [parent, owner] } }]), false);
  }
  assert.equal(stateSetsAreDisjoint(footprint.reads, [{ ...locals, owner: { ...owner, activation: 2 } }]), true);
  assert.ok(footprint.reads.some(atom => atom.kind === Atom.ActivityAssociation));
  const activity = state.activityOccurrences[0]!;
  assert.ok("scope" in activity.body);
  const populationConflicts = [2, 3].map(activation => {
    const competing = { ...activity, id: { ...activity.id, activation },
      body: { ...activity.body, scope: { ...owner, activation } } };
    const changed = { ...state, activityOccurrences: [...state.activityOccurrences, competing] };
    assert.equal(inputs(selected, changed, owner, operation.effect.inputMappings), null);
    const mutation = [{ kind: Atom.ActivityAssociation, record: competing }] as const;
    return [stateSetsAreDisjoint(footprint.reads, mutation), stateSetsAreDisjoint(mutation, footprint.reads)];
  });
  assert.deepEqual(populationConflicts, [[false, false], [false, false]]);

  assert.ok(footprint.reads.some(atom => atom.kind === Atom.ScopeParent));
  const noShadows = { ...state, variables: { ...state.variables, process: { bindings:
    state.variables.process.bindings.filter(({ name }) => name !== "status" && name !== "invoice") } } };
  const prepared = deriveInternalOrdinaryArmingPreparation(selected, noShadows, candidate);
  assert.ok(prepared);
  assert.deepEqual(prepared.patch.kind === "effect" && prepared.patch.wait.arguments, [
    { name: "fallback", value: { kind: Value.Null } },
    { name: "item", value: { kind: Value.String, value: "INV-01" } },
    { name: "status", value: { kind: Value.Null } },
  ]);
  const siblingOperation = { ...operation, id: "sibling", origin: origin("Sibling"), input: "sibling-in",
    effect: { ...operation.effect, elementId: "Sibling" } };
  const parallelProgram = { ...selected, operations: [...selected.operations, siblingOperation],
    operationScopes: [...selected.operationScopes, { operationId: siblingOperation.id, scopeId: "body" }],
    controlPlaceScopes: [...selected.controlPlaceScopes, { controlPlaceId: siblingOperation.input, scopeId: "body" }],
    controlPlaces: [...selected.controlPlaces, { id: siblingOperation.input,
      origin: { kind: SemanticOriginKind.BpmnSequenceFlow as const, elementId: "sibling-flow" } }],
  };
  const parallelState = { ...state, controlTokens: [...state.controlTokens,
    { placeId: siblingOperation.input, owner, multiplicity: 1 }] };
  const left = deriveInternalTransitionFootprint(parallelProgram, parallelState, candidate);
  const right = deriveInternalTransitionFootprint(parallelProgram, parallelState, { operation: siblingOperation, owner });
  assert.ok(left && right);
  assert.equal(internalTransitionStateFootprintsAreIndependent(left, right), true);
  assert.equal(deriveInternalTransitionFootprint(selected, { ...state, sequentialScopeControllers: [] }, candidate), null);
  assert.equal(deriveInternalTransitionFootprint(selected,
    { ...state, variables: { ...state.variables, scopes: [] } }, candidate), null);
});


test("human and Service writes retain admitted Process inputs for the next body", () => {
  const completion = { kind: Op.CompleteSequentialMultiInstanceScope, id: "complete",
    origin: entry.origin, entryOperationId: entry.id } as const;
  const definition = { ...program, operations: [...program.operations, completion], operationScopes: [
    { operationId: entry.id, scopeId: "root" }, { operationId: service.id, scopeId: "body" },
    { operationId: completion.id, scopeId: "body" },
  ] };
  const analysis = analyzeSequentialScopeData(definition);
  assert.ok(analysis);
  for (const kind of [Write.UserTask, Write.ServiceTask]) {
    for (const value of [{ kind: Value.Null } as const, { kind: Value.String, value: "new Process input" } as const]) {
      const before = running();
      const saved = structuredClone(before);
      assert.equal(sequentialScopeStartDataAdmitted(analysis, before.variables.process.bindings), true);
      const variables = write(definition, before, body(before), [
        { name: "initialStatus", value },
        { name: "status", value: { kind: Value.String, value: "finished local work" } },
      ], kind);
      assert.ok(variables);
      assert.equal(sequentialScopeStartDataAdmitted(analysis, variables.process.bindings), true);
      const next = completeSequentialScope(definition, completion, { ...before, variables, controlTokens: [] });
      assert.ok(next);
      assert.deepEqual(next.variables.scopes[0]?.bindings, [{ name: "status", value }]);
      assert.deepEqual(next.variables.process, variables.process);
      assert.equal(next.sequentialScopeControllers?.[0]?.completed, 1);
      assert.equal(next.sequentialScopeControllers?.[0]?.currentItem, "INV-02");
      assert.deepEqual(before, saved);
    }
  }
});
