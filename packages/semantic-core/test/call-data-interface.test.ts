import assert from "node:assert/strict";
import { test } from "node:test";
import { CallDataKind, callDataInterfaceValid, CheckedNodeKind, isCallDataInterface, profileAllowsCheckedProcessShape, profileAllowsProgramShape, SemanticOperationKind } from "@bpmn-lean/semantic-core";
import type { ScalarCallData, ScalarIoSpecification } from "@bpmn-lean/semantic-core";
import { callActivityProgram } from "./call-activity-fixture.ts";

function specification(ownerId: string): ScalarIoSpecification {
  return {
    ownerId, id: `${ownerId}_io`,
    input: { id: `${ownerId}_input`, name: null },
    output: { id: `${ownerId}_output`, name: null },
    inputSet: { id: `${ownerId}_inputs`, name: null, dataInputRefs: [`${ownerId}_input`] },
    outputSet: { id: `${ownerId}_outputs`, name: null, dataOutputRefs: [`${ownerId}_output`] },
  };
}

const data: ScalarCallData = {
  kind: CallDataKind.Scalar,
  callerProperties: ["Receipt", "Request", "Result"],
  call: specification("DueDiligenceCall"),
  called: specification("DueDiligenceProcess"),
  directInput: {
    associationId: "ReadSummary", source: { kind: "property", propertyId: "Request" },
    targetDataInputId: "DueDiligenceCall_input", targetDataInputName: null,
  },
  directOutput: {
    associationId: "WriteDecision", sourceDataOutputId: "DueDiligenceCall_output",
    sourceDataOutputName: null, target: { kind: "property", propertyId: "Result" },
  },
};

function valid(candidate: ScalarCallData, properties: ReadonlyArray<string> = candidate.callerProperties) {
  return callDataInterfaceValid({ ...candidate, callerProperties: properties }, "DueDiligenceCall", "DueDiligenceProcess");
}

test("Call wire shapes retain the explicit empty or complete scalar declaration", () => {
  assert.equal(isCallDataInterface({ kind: CallDataKind.Empty }), true);
  assert.equal(isCallDataInterface(data), true);
});

test("the predecessor Call profile cannot silently admit scalar interfaces", () => {
  const program = callActivityProgram;
  assert.equal(profileAllowsProgramShape(program.identity.semanticProfile, program.operations, 2), true);
  const operations = program.operations.map((operation) =>
    operation.kind === SemanticOperationKind.InvokeProcess || operation.kind === SemanticOperationKind.ReturnProcess
      ? { ...operation, data } : operation);
  assert.equal(profileAllowsProgramShape(program.identity.semanticProfile, operations, 2), false);
});

test("the predecessor checked profile cannot acquire scalar Call meaning", () => {
  const nodes = [
    { kind: CheckedNodeKind.NoneStartEvent, id: "CallerStart" },
    { kind: CheckedNodeKind.CallActivity, id: "Call", calledProcessId: "Process", data: { kind: CallDataKind.Empty } },
    { kind: CheckedNodeKind.UserTask, id: "CallerTask", name: null },
    { kind: CheckedNodeKind.NoneEndEvent, id: "CallerEnd" },
    { kind: CheckedNodeKind.NoneStartEvent, id: "CalledStart" },
    { kind: CheckedNodeKind.UserTask, id: "CalledTask", name: null },
    { kind: CheckedNodeKind.NoneEndEvent, id: "CalledEnd" },
  ] as const;
  const profile = callActivityProgram.identity.semanticProfile;
  assert.equal(profileAllowsCheckedProcessShape(profile, nodes, 2), true);
  assert.equal(profileAllowsCheckedProcessShape(profile,
    nodes.map((node) => node.kind === CheckedNodeKind.CallActivity ? { ...node, data } : node), 2), false);
});

test("Call wire shapes reject absent, extra, mistyped and wrong-direction fields", () => {
  for (const value of [undefined, null, [], {}, { kind: "unknown" },
    { kind: CallDataKind.Empty, call: data.call },
    { ...data, callerProperties: null }, { ...data, callerProperties: [42] },
    { ...data, called: { ...data.called, output: { id: "Output", name: 42 } } },
    { ...data, call: { ...data.call, inputSet: { ...data.call.inputSet, optionalInputRefs: [] } } },
    { ...data, directInput: { ...data.directInput, source: { kind: "processDataOutput", dataOutputId: "x" } } },
    { ...data, directOutput: { ...data.directOutput, target: { kind: "processDataInput", dataInputId: "x" } } },
    { ...data, directOutput: { ...data.directOutput, transformation: null } },
  ]) assert.equal(isCallDataInterface(value), false);
  for (const key of Object.keys(data)) {
    const omitted = { ...data } as Record<string, unknown>;
    delete omitted[key];
    assert.equal(isCallDataInterface(omitted), false, key);
  }
});

test("distinct owned singleton Call and Process ports correspond without names", () => {
  assert.equal(valid(data), true);
  assert.equal(callDataInterfaceValid({ kind: CallDataKind.Empty }, "Call", "Process"), true);
});

test("display names do not decide correspondence", () => {
  assert.equal(valid({ ...data, called: { ...data.called,
    input: { ...data.called.input, name: "Different request label" },
    output: { ...data.called.output, name: "Different result label" },
  } }), true);
});

test("caller associations stop at Call ports rather than crossing to Process ports", () => {
  assert.equal(valid({ ...data, directInput: { ...data.directInput,
    targetDataInputId: data.called.input.id } }), false);
  assert.equal(valid({ ...data, directOutput: { ...data.directOutput,
    sourceDataOutputId: data.called.output.id } }), false);
});

test("interface owners and local set references cannot alias another declaration", () => {
  assert.equal(valid({ ...data, called: { ...data.called, ownerId: data.call.ownerId } }), false);
  assert.equal(valid({ ...data, call: { ...data.call, ownerId: "OtherCall" } }), false);
  for (const references of [[], [data.call.input.id], [data.called.input.id, data.called.input.id]]) {
    assert.equal(valid({ ...data, called: { ...data.called,
      inputSet: { ...data.called.inputSet, dataInputRefs: references } } }), false);
  }
  assert.equal(valid({ ...data, called: { ...data.called,
    outputSet: { ...data.called.outputSet, dataOutputRefs: [data.call.output.id] } } }), false);
});

test("caller endpoints must be distinct declared Properties", () => {
  assert.equal(valid(data, ["Request", "Receipt"]), false);
  assert.equal(valid({ ...data, directOutput: { ...data.directOutput,
    target: { kind: "property", propertyId: "Request" } } }), false);
  assert.equal(valid({ ...data, directInput: { ...data.directInput,
    source: { kind: "processDataInput", dataInputId: "Request" } } }), false);
  assert.equal(valid({ ...data, directOutput: { ...data.directOutput,
    target: { kind: "processDataOutput", dataOutputId: "Result" } } }), false);
});

test("global identity separation includes unused Properties and all retained data declarations", () => {
  assert.equal(valid(data, ["Request", "Result", data.called.inputSet.id]), false);
  assert.equal(valid(data, ["Request", "Result", "Request"]), false);
  assert.equal(valid({ ...data, directOutput: { ...data.directOutput,
    associationId: data.directInput.associationId } }), false);
  assert.equal(valid({ ...data, called: { ...data.called, id: data.call.id } }), false);
  assert.equal(valid({ ...data, called: { ...data.called,
    outputSet: { ...data.called.outputSet, id: "" } } }), false);
});
