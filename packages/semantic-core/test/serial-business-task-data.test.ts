import assert from "node:assert/strict";
import { test } from "node:test";
import * as core from "@bpmn-lean/semantic-core";
import {
  MappingExpressionKind, VariableValueKind, completeActivityVariableScope,
  createEffectLocalDataOwner, evaluateInputMappings,
} from "@bpmn-lean/semantic-core";
import type { VariableMapping } from "@bpmn-lean/semantic-core";
import { deriveInternalTransitionFootprint, effectFrontier, effectProgram, InternalTransitionStateAtomKind } from "./internal-commutation-fixture.ts";

const binding = (name: string, value: string) => ({ name, value: { kind: VariableValueKind.String, value } } as const);
const owner = { processInstanceId: "invoice", elementId: "Validate", activation: 1 };
const inputs: VariableMapping[] = [
  { target: "payload", expression: { kind: MappingExpressionKind.EnclosingVariable, name: "request" } },
  { target: "echo", expression: { kind: MappingExpressionKind.EnclosingVariable, name: "payload" } },
];

test("effect inputs read one enclosing snapshot regardless of local target order", () => {
  const context = [binding("payload", "parent"), binding("request", "reviewed")];
  const before = structuredClone(context);
  const expected = [binding("echo", "parent"), binding("payload", "reviewed")];
  assert.deepEqual(evaluateInputMappings(inputs, context), expected);
  assert.deepEqual(evaluateInputMappings([...inputs].reverse(), context), expected);
  assert.deepEqual(context, before);
});

test("missing and duplicated enclosing bindings refuse input capture", () => {
  assert.equal(evaluateInputMappings(inputs, [binding("payload", "parent")]), null);
  assert.equal(evaluateInputMappings(inputs, [binding("payload", "a"), binding("payload", "b"), binding("request", "reviewed")]), null);
});

test("captured arguments validate against their declaration without rereading changed Process data", () => {
  const mappings: VariableMapping[] = [...inputs, { target: "literal", expression: { kind: MappingExpressionKind.StringLiteral, value: "fixed" } }];
  const snapshot = [binding("echo", "parent"), binding("literal", "fixed"), binding("payload", "reviewed")];
  assert.equal(core.inputMappingSnapshotMatches(mappings, snapshot), true);
  assert.equal(core.inputMappingSnapshotMatches(mappings, [...snapshot].reverse()), false);
  assert.equal(core.inputMappingSnapshotMatches(mappings, [snapshot[0]!, binding("literal", "forged"), snapshot[2]!]), false);
  assert.equal(core.inputMappingSnapshotMatches(mappings, [snapshot[0]!, snapshot[1]!]), false);
  assert.equal(core.inputMappingSnapshotMatches(mappings, [...snapshot, binding("surplus", "x")]), false);
});

test("present null is an input value and requires explicit permission in a success result", () => {
  const nullBinding = { name: "result", value: { kind: VariableValueKind.Null } } as const;
  assert.deepEqual(evaluateInputMappings([inputs[0]!], [{ ...nullBinding, name: "request" }]), [{ ...nullBinding, name: "payload" }]);
  const variables = { processInterfaces: [], process: { bindings: [] }, activities: [{ owner: createEffectLocalDataOwner(owner), bindings: [binding("result", "input-value")] }] };
  const outputs = ["decision", "receipt"].map(target => ({ target, expression: { kind: MappingExpressionKind.LocalVariable, name: "result" } } as const));
  assert.equal(completeActivityVariableScope(variables, owner, outputs, [], true), null);
  assert.equal(completeActivityVariableScope(variables, owner, outputs, [nullBinding], false), null);
  assert.deepEqual(completeActivityVariableScope(variables, owner, outputs, [nullBinding], true)?.process.bindings, [
    { ...nullBinding, name: "decision" }, { ...nullBinding, name: "receipt" },
  ]);
});

test("one explicit local result can feed two declared outputs without parent fallback", () => {
  const variables = {
    processInterfaces: [],
    process: { bindings: [binding("result", "parent"), binding("unrelated", "keep")] },
    activities: [{ owner: createEffectLocalDataOwner(owner), bindings: [binding("payload", "reviewed")] }],
  };
  const outputs = ["decision", "receipt"].map(target => ({ target, expression: { kind: MappingExpressionKind.LocalVariable, name: "result" } } as const));
  const before = structuredClone(variables);
  assert.equal(completeActivityVariableScope(variables, owner, outputs, [], false), null);
  const completed = completeActivityVariableScope(variables, owner, outputs, [binding("result", "approved")], false);
  assert.deepEqual(completed, {
    processInterfaces: [],
    process: { bindings: [binding("decision", "approved"), binding("receipt", "approved"), binding("result", "parent"), binding("unrelated", "keep")] },
    activities: [],
  });
  assert.deepEqual(variables, before);
});

test("shared enclosing inputs reserve each Process read once and refuse missing data", () => {
  const original = effectProgram.operations[0]!;
  assert.equal(original.kind, core.SemanticOperationKind.AwaitEffect);
  if (original.kind !== core.SemanticOperationKind.AwaitEffect) throw new Error("Expected effect fixture");
  const operation = { ...original, effect: { ...original.effect, inputMappings: ["a", "b"].map(target => ({ target, expression: { kind: MappingExpressionKind.EnclosingVariable, name: "request" } } as const)) } };
  const program = { ...effectProgram, operations: [operation] };
  const state = { ...effectFrontier, variables: { ...effectFrontier.variables, process: { bindings: [binding("request", "reviewed")] } } };
  const candidate = { operation, owner: state.scopeOccurrences[0]!.id };
  const footprint = deriveInternalTransitionFootprint(program, state, candidate);
  assert.ok(footprint);
  assert.deepEqual(footprint.reads.filter(({ kind }) => kind === InternalTransitionStateAtomKind.ProcessVariable), [{ kind: InternalTransitionStateAtomKind.ProcessVariable, name: "request" }]);
  assert.equal(deriveInternalTransitionFootprint(program, effectFrontier, candidate), null);
});
