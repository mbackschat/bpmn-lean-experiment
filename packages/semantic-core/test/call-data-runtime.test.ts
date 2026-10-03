import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyInternalOperation, CallDataKind, ControlStateKind, initialState,
  SemanticOperationKind, VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState, ScalarCallData, ScalarIoSpecification, SemanticOperation, VariableValue,
} from "@bpmn-lean/semantic-core";
import {
  callActivityProgram as program, callElementId, calledProcessId, calledScopeId,
  callerScopeId, expectedCalledInstanceId, instanceId,
} from "./call-activity-fixture.ts";

const { invokeCalledProcess, returnCalledProcess } = await import(
  new URL("../dist/semantic-process-call-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-call-runtime.ts");
const { deriveInternalTransitionPreparation: prepare, applyPreparedInternalTransition: applyPrepared } = await import(
  new URL("../dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../src/internal-transition-batch.ts");
const { internalTransitionStateFootprintsAreIndependent: independent, InternalTransitionStateAtomKind: Atom } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint.ts");

function specification(ownerId: string): ScalarIoSpecification {
  return {
    ownerId, id: `${ownerId}_io`,
    input: { id: `${ownerId}_input`, name: "descriptive input" },
    output: { id: `${ownerId}_output`, name: "descriptive output" },
    inputSet: { id: `${ownerId}_inputs`, name: null, dataInputRefs: [`${ownerId}_input`] },
    outputSet: { id: `${ownerId}_outputs`, name: null, dataOutputRefs: [`${ownerId}_output`] },
  };
}

const data: ScalarCallData = {
  kind: CallDataKind.Scalar,
  callerProperties: ["Receipt", "Request", "Result", "Unrelated"],
  call: specification(callElementId), called: specification(calledProcessId),
  directInput: {
    associationId: "ReadRequest", source: { kind: "property", propertyId: "Request" },
    targetDataInputId: `${callElementId}_input`, targetDataInputName: "descriptive input",
  },
  directOutput: {
    associationId: "WriteResult", sourceDataOutputId: `${callElementId}_output`,
    sourceDataOutputName: "descriptive output", target: { kind: "property", propertyId: "Result" },
  },
};
const invokeControl = program.operations.find((operation) => operation.kind === SemanticOperationKind.InvokeProcess)!;
const returnControl = program.operations.find((operation) => operation.kind === SemanticOperationKind.ReturnProcess)!;
const invokeOperation = { ...invokeControl, data };
const returnOperation = { ...returnControl, data };
const caller = { processInstanceId: instanceId, definitionScopeId: callerScopeId, activation: 1 };
const called = { processInstanceId: expectedCalledInstanceId, definitionScopeId: calledScopeId, activation: 1 };
const unrelated = { ...caller, definitionScopeId: "scope:Unrelated" };
const stringValue = (value: string): VariableValue => ({ kind: VariableValueKind.String, value });
const outsideInterface = { owner: unrelated, inputs: [{ name: "Outside", value: stringValue("retain") }], outputs: [] };

function beforeInvocation(value: VariableValue = stringValue("supplier")): RuntimeState {
  return {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId },
    scopeOccurrences: [{ id: caller, parent: null }],
    controlTokens: [{ placeId: invokeOperation.input, owner: caller, multiplicity: 1 }],
    variables: {
      ...initialState.variables,
      process: { bindings: [
        { name: "Request", value },
        { name: "Result", value: stringValue("old result") },
        { name: "Unrelated", value: stringValue("untouched") },
      ] },
      processInterfaces: [outsideInterface],
    },
  };
}

function beforeReturn(value: VariableValue = stringValue("approved")): RuntimeState {
  const invoked = invokeCalledProcess(invokeControl, beforeInvocation(), caller);
  assert.ok(invoked !== null);
  return {
    ...invoked, controlTokens: [],
    variables: { ...invoked.variables, processInterfaces: [outsideInterface, {
      owner: called,
      inputs: [{ name: data.called.input.id, value: stringValue("supplier") }],
      outputs: [{ name: data.called.output.id, value }],
    }] },
  };
}

function apply(operation: SemanticOperation, state: RuntimeState) {
  const preserved = structuredClone(state);
  const result = applyInternalOperation(program, operation, state);
  assert.deepEqual(state, preserved, "raw evaluation cannot mutate its predecessor");
  return result;
}

for (const value of [stringValue("supplier"), { kind: VariableValueKind.Null }] as const) {
  test(`scalar invocation snapshots the exact request and preserves caller data: ${value.kind}`, () => {
    const before = beforeInvocation(value);
    const after = apply(invokeOperation, before);
    assert.ok(after !== null);
    assert.deepEqual(after.variables.process, before.variables.process);
    assert.deepEqual(after.variables.activities, before.variables.activities);
    assert.deepEqual(after.variables.processInterfaces, [outsideInterface, {
      owner: called, inputs: [{ name: data.called.input.id, value }], outputs: [],
    }]);
    assert.notEqual(after.variables.processInterfaces[1]?.inputs[0]?.value, value);
    assert.deepEqual({ ...after, variables: before.variables }, invokeCalledProcess(invokeControl, before, caller));
  });

  test(`scalar return copies only the selected output before disposal: ${value.kind}`, () => {
    const before = beforeReturn(value);
    const after = apply(returnOperation, before);
    assert.ok(after !== null);
    assert.deepEqual(after.variables.process.bindings, before.variables.process.bindings.map((binding) =>
      binding.name === "Result" ? { name: "Result", value } : binding));
    assert.deepEqual(after.variables.processInterfaces, [outsideInterface]);
    const controlAfter = returnCalledProcess(returnControl, before);
    assert.ok(controlAfter !== null);
    assert.deepEqual({ ...after, variables: controlAfter.variables }, controlAfter);
    assert.equal(apply(returnOperation, after), null, "return cannot produce a second continuation");
  });
}

test("scalar invocation refuses absent, duplicate and non-scalar request bindings atomically", () => {
  const before = beforeInvocation();
  const request = before.variables.process.bindings[0]!;
  for (const bindings of [
    before.variables.process.bindings.slice(1),
    [...before.variables.process.bindings, request],
    [{ ...request, value: { kind: VariableValueKind.Boolean, value: true } }],
  ] as const) {
    assert.equal(apply(invokeOperation, { ...before, variables: { ...before.variables, process: { bindings } } }), null);
  }
});

test("scalar invocation refuses an occupied exact interface owner without control-only fallback", () => {
  const before = beforeInvocation();
  assert.equal(apply(invokeOperation, { ...before, variables: { ...before.variables,
    processInterfaces: [...before.variables.processInterfaces, { owner: called, inputs: [], outputs: [] }],
  } }), null);
});

test("scalar return requires one exact interface owner and one exact available scalar output", () => {
  const before = beforeReturn();
  const selected = before.variables.processInterfaces[1]!;
  for (const interfaces of [
    [outsideInterface],
    [selected, { ...selected, outputs: [] }],
    [{ ...selected, outputs: [] }],
    [{ ...selected, outputs: [...selected.outputs, ...selected.outputs] }],
    [{ ...selected, outputs: [{ name: data.call.output.id, value: stringValue("wrong port") }] }],
    [{ ...selected, outputs: [{ name: data.called.output.id, value: { kind: VariableValueKind.Boolean, value: true } }] }],
    ...[
      { ...called, processInstanceId: "OtherInstance" },
      { ...called, definitionScopeId: "OtherScope" },
      { ...called, activation: 2 },
    ].map((owner) => [{ ...selected, owner }]),
  ] as const) {
    assert.equal(apply(returnOperation, { ...before, variables: { ...before.variables, processInterfaces: interfaces } }), null);
  }
});

test("scalar return still requires called-root quiescence", () => {
  const before = beforeReturn();
  assert.equal(apply(returnOperation, { ...before,
    controlTokens: [{ placeId: "place:Called_End", owner: called, multiplicity: 1 }],
  }), null);
});

test("scalar evaluators refuse mismatched declarations while empty evaluators retain their storage domain", () => {
  const invalid = { ...data, called: { ...data.called, ownerId: "WrongProcess" } };
  assert.equal(apply({ ...invokeOperation, data: invalid }, beforeInvocation()), null);
  assert.equal(apply({ ...returnOperation, data: invalid }, beforeReturn()), null);
  assert.deepEqual(apply(invokeControl, beforeInvocation()), invokeCalledProcess(invokeControl, beforeInvocation(), caller));
  assert.deepEqual(apply(returnControl, beforeReturn()), returnCalledProcess(returnControl, beforeReturn()));
});

const scalarProgram = { ...program, operations: program.operations.map((operation) => {
  switch (operation.kind) {
    case SemanticOperationKind.InvokeProcess: return invokeOperation;
    case SemanticOperationKind.ReturnProcess: return returnOperation;
    default: return operation;
  }
}) };

for (const [operation, owner, predecessor] of [
  [invokeOperation, caller, beforeInvocation], [returnOperation, called, beforeReturn],
] as const) {
  test(`prepared ${operation.kind} preserves the raw scalar transfer and rejects changed data`, () => {
    const state = predecessor();
    const prepared = prepare(scalarProgram, state, { operation, owner });
    assert.ok(prepared !== null);
    assert.deepEqual(applyPrepared(scalarProgram, state, prepared), apply(operation, state));
    const changed = predecessor(stringValue("changed after preparation"));
    assert.equal(applyPrepared(scalarProgram, changed, prepared), null);
    const unchangedSource = { ...state, variables: { ...state.variables, process: {
      bindings: state.variables.process.bindings.map((binding) => binding.name === "Unrelated"
        ? { ...binding, value: stringValue("changed unrelated Property") } : binding),
    } } };
    assert.deepEqual(prepare(scalarProgram, unchangedSource, { operation, owner }), prepared);
    assert.deepEqual(applyPrepared(scalarProgram, unchangedSource, prepared), apply(operation, unchangedSource));
  });
}

test("scalar preparation cannot fall back to control preparation when its required data is unavailable", () => {
  const invocation = beforeInvocation();
  const missingRequest = { ...invocation, variables: { ...invocation.variables, process: { bindings: [] } } };
  assert.equal(prepare(scalarProgram, missingRequest, { operation: invokeOperation, owner: caller }), null);
  const returning = beforeReturn();
  const missingOutput = { ...returning, variables: { ...returning.variables, processInterfaces: [] } };
  assert.equal(prepare(scalarProgram, missingOutput, { operation: returnOperation, owner: called }), null);
});

test("scalar Call footprints protect request reads, fresh interface ownership and return writes", () => {
  const invocation = prepare(scalarProgram, beforeInvocation(), { operation: invokeOperation, owner: caller });
  const returning = prepare(scalarProgram, beforeReturn(), { operation: returnOperation, owner: called });
  assert.ok(invocation !== null && returning !== null);
  const request = { kind: Atom.ProcessVariable, name: "Request" } as const;
  const result = { kind: Atom.ProcessVariable, name: "Result" } as const;
  const calledInput = { kind: Atom.ProcessInterfaceInput, owner: called, dataInputId: data.called.input.id } as const;
  assert.equal(independent(invocation.footprint, { reads: [], writes: [request] }), false);
  assert.equal(independent({ ...invocation.footprint,
    reads: invocation.footprint.reads.filter((atom) => atom.kind !== Atom.ProcessVariable),
  }, { reads: [], writes: [request] }), true, "omitting the request dependency admits the competing write");
  assert.equal(independent(invocation.footprint, { reads: [calledInput], writes: [] }), false);
  assert.equal(independent(returning.footprint, { reads: [result], writes: [] }), false);
  assert.equal(independent({ ...returning.footprint,
    writes: returning.footprint.writes.filter((atom) => atom.kind !== Atom.ProcessVariable),
  }, { reads: [result], writes: [] }), true, "omitting copy-back admits an early caller read");
  for (const footprint of [invocation.footprint, returning.footprint]) {
    assert.equal(independent(footprint, { reads: [], writes: [{ kind: Atom.ProcessVariable, name: "Unrelated" }] }), true);
  }
});
