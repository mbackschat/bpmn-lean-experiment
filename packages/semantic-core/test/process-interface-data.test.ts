import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VariableValueKind,
  ControlStateKind,
  addProcessInterface,
  initialState,
  readProcessInterfaceInput,
  readProcessInterfaceOutput,
  selectProcessInterface,
  writeProcessInterfaceOutput,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId, ScopedVariables, VariableBinding } from "@bpmn-lean/semantic-core";
const { removeScopeOccurrenceContents, removeScopeOccurrenceSubtree } = await import(
  new URL("../dist/semantic-process-scope-cancellation.js", import.meta.url).href
) as typeof import("../src/semantic-process-scope-cancellation.ts");

const owner: ScopeOccurrenceId = {
  processInstanceId: "Called_1", definitionScopeId: "Called", activation: 2,
};
const input: VariableBinding = {
  name: "request", value: { kind: VariableValueKind.String, value: "supplier summary" },
};
const output: VariableBinding = { name: "decision", value: { kind: VariableValueKind.Null } };

function withInterface(): ScopedVariables {
  const result = addProcessInterface(initialState.variables, owner, input);
  assert.ok(result !== null);
  return result;
}

test("Process interface input is a snapshot, and an absent output differs from present null", () => {
  const mutableInput = {
    name: "request", value: { kind: VariableValueKind.String, value: "original" },
  } as const;
  const mutableOwner = { ...owner };
  const before = addProcessInterface(initialState.variables, mutableOwner, mutableInput);
  assert.ok(before !== null);
  assert.notEqual(before.processInterfaces[0]?.inputs[0], mutableInput);
  assert.notEqual(before.processInterfaces[0]?.inputs[0]?.value, mutableInput.value);
  mutableOwner.activation = 99;
  assert.equal(readProcessInterfaceOutput(before, owner, output.name), undefined);
  assert.deepEqual(readProcessInterfaceInput(before, owner, "request"), mutableInput);
  const after = writeProcessInterfaceOutput(before, owner, output);
  assert.ok(after !== null);
  assert.deepEqual(readProcessInterfaceOutput(after, owner, output.name), output);
  assert.equal(readProcessInterfaceOutput(before, owner, output.name), undefined);
  assert.deepEqual(after.process, before.process);
  assert.deepEqual(after.activities, before.activities);
  assert.deepEqual(after.processInterfaces[0]?.inputs, before.processInterfaces[0]?.inputs);
});

test("interface lookup uses every owner coordinate before selecting a port", () => {
  const others = [
    { ...owner, processInstanceId: "Called_2" },
    { ...owner, definitionScopeId: "Other" },
    { ...owner, activation: 3 },
  ];
  const variables: ScopedVariables = {
    ...initialState.variables,
    process: { bindings: [input] },
    processInterfaces: others.map((other) => ({ owner: other, inputs: [input], outputs: [output] })),
  };
  assert.equal(selectProcessInterface(variables, owner), undefined);
  assert.equal(readProcessInterfaceInput(variables, owner, input.name), undefined);
  assert.equal(readProcessInterfaceOutput(variables, owner, output.name), undefined);
  assert.equal(writeProcessInterfaceOutput(variables, owner, output), null);
  assert.deepEqual(variables.process.bindings, [input]);
});

test("a duplicate owner refuses even when only one duplicate contains the requested port", () => {
  const variables = withInterface();
  const ambiguous: ScopedVariables = {
    ...variables,
    processInterfaces: [...variables.processInterfaces, { owner, inputs: [], outputs: [output] }],
  };
  assert.equal(selectProcessInterface(ambiguous, owner), undefined);
  assert.equal(readProcessInterfaceInput(ambiguous, owner, input.name), undefined);
  assert.equal(readProcessInterfaceOutput(ambiguous, owner, output.name), undefined);
  assert.equal(addProcessInterface(ambiguous, owner, input), null);
  assert.equal(writeProcessInterfaceOutput(ambiguous, owner, output), null);
});

test("duplicate binding names and non-scalar values cannot become available ports", () => {
  for (const bindings of [
    [input, input],
    [{ ...input, value: { kind: VariableValueKind.Boolean, value: true } }],
  ] as const) {
    const variables: ScopedVariables = {
      ...initialState.variables,
      processInterfaces: [{ owner, inputs: bindings, outputs: bindings }],
    };
    assert.equal(readProcessInterfaceInput(variables, owner, input.name), undefined);
    assert.equal(readProcessInterfaceOutput(variables, owner, input.name), undefined);
  }
  for (const value of [
    { kind: VariableValueKind.Boolean, value: true },
    { kind: VariableValueKind.Integer, value: 1 },
    { kind: VariableValueKind.StringList, value: ["unsupported"] },
  ] as const) {
    assert.equal(addProcessInterface(initialState.variables, owner, { ...input, value }), null);
    assert.equal(writeProcessInterfaceOutput(withInterface(), owner, { ...output, value }), null);
  }
});

test("insertion orders complete owners numerically and preserves all existing stores", () => {
  const orderedOwners = [
    { ...owner, activation: 2 },
    { ...owner, activation: 10 },
    { ...owner, definitionScopeId: "Other" },
    { ...owner, processInstanceId: "Called_2" },
  ];
  const initial: ScopedVariables = {
    ...initialState.variables, process: { bindings: [input] },
  };
  let variables = initial;
  for (const currentOwner of [...orderedOwners].reverse()) {
    const added = addProcessInterface(variables, currentOwner, input);
    assert.ok(added !== null);
    variables = added;
  }
  assert.deepEqual(variables.processInterfaces.map((scope) => scope.owner), orderedOwners);
  assert.deepEqual(variables.process, initial.process);
  assert.deepEqual(variables.activities, initial.activities);
  assert.equal(addProcessInterface(variables, owner, input), null);
});

test("writing one Process output preserves equal-name sibling ports and immutable inputs", () => {
  const variables: ScopedVariables = {
    ...withInterface(),
    processInterfaces: [
      { owner, inputs: [input], outputs: [] },
      { owner: { ...owner, activation: 3 }, inputs: [input], outputs: [output] },
    ],
  };
  const filled = writeProcessInterfaceOutput(variables, owner, output);
  assert.ok(filled !== null);
  const replacement: VariableBinding = {
    name: output.name, value: { kind: VariableValueKind.String, value: "approved" },
  };
  const replaced = writeProcessInterfaceOutput(filled, owner, replacement);
  assert.ok(replaced !== null);
  assert.deepEqual(replaced, {
    ...variables,
    processInterfaces: [
      { owner, inputs: [input], outputs: [replacement] },
      variables.processInterfaces[1],
    ],
  });
  assert.equal(writeProcessInterfaceOutput(filled, owner, { ...output, name: "wrong-port" }), null);
  const duplicateOutput: ScopedVariables = {
    ...variables, processInterfaces: [{ owner, inputs: [input], outputs: [output, output] }],
  };
  assert.equal(writeProcessInterfaceOutput(duplicateOutput, owner, output), null);
  assert.deepEqual(variables.processInterfaces[0]?.outputs, []);
});

for (const [name, remove, retainRoot] of [
  ["contents", removeScopeOccurrenceContents, true],
  ["subtree", removeScopeOccurrenceSubtree, false],
] as const) {
  test(`regional ${name} removal disposes only interfaces whose full owners are removed`, () => {
    const root = { id: owner, parent: null };
    const child = { id: { ...owner, definitionScopeId: "Child" }, parent: owner };
    const sibling = { id: { ...owner, activation: 3 }, parent: null };
    const interfaces = [root, child, sibling].map(({ id }) => ({
      owner: id, inputs: [input], outputs: [output],
    }));
    const before: RuntimeState = {
      ...initialState,
      control: { kind: ControlStateKind.Running, instanceId: owner.processInstanceId },
      scopeOccurrences: [root, child, sibling],
      variables: { ...initialState.variables, processInterfaces: interfaces },
    };
    const after = remove(before, root);
    const retained = retainRoot ? [interfaces[0], interfaces[2]] : [interfaces[2]];
    assert.deepEqual(after.variables.processInterfaces, retained);
    assert.deepEqual(after.variables.process, before.variables.process);
    assert.deepEqual(after.variables.activities, before.variables.activities);
    assert.deepEqual(after.scopeOccurrences, retainRoot ? [root, sibling] : [sibling]);
    assert.deepEqual(before.variables.processInterfaces, interfaces);
  });
}
