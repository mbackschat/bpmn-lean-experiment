import assert from "node:assert/strict";
import { test } from "node:test";
import { SemanticOperationKind as Op, SemanticOriginKind, MappingExpressionKind as Mapping, VariableValueKind as Value, StimulusKind, EffectExecutionResultKind, initialState } from "@bpmn-lean/semantic-core";
import type { EnterSequentialMultiInstanceScopeOperation, SemanticOperation, VariableBinding, VariableMapping } from "@bpmn-lean/semantic-core";
import { program as base } from "./embedded-subprocess-fixture.ts";
const { analyzeSequentialScopeData: analyze, sequentialScopeStartDataAdmitted: start, sequentialScopeStimulusDataAdmitted: command } =
  await import(new URL("../dist/sequential-scope-data-admission.js", import.meta.url).href) as typeof import("../src/sequential-scope-data-admission.ts");
const { sequentialScopeProgramShape } = await import(new URL("../dist/sequential-scope-program-admission.js", import.meta.url).href) as typeof import("../src/sequential-scope-program-admission.ts");
const { initializeScopeVariables } = await import(new URL("../dist/scope-variable-data.js", import.meta.url).href) as typeof import("../src/scope-variable-data.ts");
const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement, elementId } as const);
const read = (target: string, name: string): VariableMapping => ({ target, expression: { kind: Mapping.EnclosingVariable, name } });
const entry: EnterSequentialMultiInstanceScopeOperation = { kind: Op.EnterSequentialMultiInstanceScope, id: "enter", origin: origin("Batch"),
  input: "in", normalOutput: "out", childScopeId: "body", childEntry: "body-in", collectionName: "items", itemName: "item",
  completionBooleanName: "stop", bodyInputs: [read("local", "seed")] };
const service: Extract<SemanticOperation, { kind: Op.AwaitEffect }> = { kind: Op.AwaitEffect, id: "service", origin: origin("Validate"),
  input: "body-in", output: "body-out", bpmnErrorRoute: null,
  effect: { elementId: "Validate", descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "validate" },
    inputMappings: [read("a", "item"), read("b", "local"), read("c", "account")], outputMappings: [] } };
function program(body = entry, task = service, scopeId = "body") {
  return { operations: [body, task], operationScopes: [{ operationId: body.id, scopeId: "root" }, { operationId: task.id, scopeId }] };
}

test("private profile shape requires the complete lifecycle rather than only allowed operation kinds", () => {
  assert.equal(sequentialScopeProgramShape([], 2), false);
  assert.equal(sequentialScopeProgramShape([entry, service], 2), false);
});
const bindings: readonly VariableBinding[] = [
  { name: "account", value: { kind: Value.Null } },
  { name: "items", value: { kind: Value.StringList, value: ["first", "second"] } },
  { name: "seed", value: { kind: Value.String, value: "ready" } },
  { name: "stop", value: { kind: Value.Boolean, value: false } },
];

test("body reads inherit locals and the item; initializers always require Process scalars", () => {
  const analysis = analyze(program());
  assert.ok(analysis);
  assert.deepEqual(analysis.requiredProcessScalars, ["account", "seed"]);
  assert.equal(start(analysis, bindings), true);
  assert.deepEqual(analyze(program({ ...entry, bodyInputs: [read("local", "local")] }))?.requiredProcessScalars, ["account", "local"]);
  assert.deepEqual(analyze(program({ ...entry, bodyInputs: [read("local", "item")] }))?.requiredProcessScalars, ["account", "item"]);
  assert.deepEqual(analyze(program(entry, service, "root"))?.requiredProcessScalars, ["account", "item", "local", "seed"]);
});

test("body initialization preserves Java-trimmed non-ASCII whitespace without broadening Service literals", () => {
  for (const value of ["\u00a0pending\u00a0", "\u2003pending\u2003"]) {
    assert.ok(analyze(program({ ...entry, bodyInputs: [{ target: "local", expression: { kind: Mapping.StringLiteral, value } }] })));
    assert.equal(analyze(program(entry, { ...service, effect: { ...service.effect,
      inputMappings: [{ target: "argument", expression: { kind: Mapping.StringLiteral, value } }] } })), undefined);
  }
  for (const value of ["", " pending", "pending\t", "${item}", "#{bean}"]) {
    assert.equal(analyze(program({ ...entry, bodyInputs: [{ target: "local", expression: { kind: Mapping.StringLiteral, value } }] })), undefined);
  }
});

test("protected names cannot become body locals or Service output targets", () => {
  for (const name of ["items", "item", "stop", "validate"]) {
    assert.equal(analyze(program({ ...entry, bodyInputs: [read(name, "seed")] })), undefined);
    for (const scope of ["root", "body"]) assert.equal(analyze(program(entry, { ...service, effect: { ...service.effect,
      outputMappings: [{ target: name, expression: { kind: Mapping.LocalVariable, name: "result" } }] } }, scope)), undefined);
  }
  for (const name of ["items", "stop", "validate"]) {
    assert.equal(analyze(program({ ...entry, bodyInputs: [read("local", name)] })), undefined);
    assert.equal(analyze(program(entry, { ...service, effect: { ...service.effect, inputMappings: [read("argument", name)] } })), undefined);
  }
  assert.equal(analyze(program({ ...entry, itemName: "items" })), undefined);
  assert.equal(analyze(program({ ...entry, collectionName: "validate" })), undefined);
});

test("Start requires every pre-entry scalar even for an empty collection and preserves present null", () => {
  const analysis = analyze(program());
  assert.ok(analysis);
  for (const missing of bindings) assert.equal(start(analysis, bindings.filter(value => value !== missing)), false);
  assert.equal(start(analysis, bindings.map(binding => binding.name === "items"
    ? { ...binding, value: { kind: Value.StringList, value: [] } } : binding)), true);
  assert.equal(start(analysis, [...bindings, bindings[3]!]), false);
  assert.equal(start(analysis, [...bindings].reverse()), false);
  for (const name of ["seed", "stop", "items"]) assert.equal(start(analysis, bindings.map(binding => binding.name === name
    ? { ...binding, value: { kind: Value.Boolean, value: true } } : binding)), name === "stop");
});

test("Start enforces existing collection limits and rejects unrelated typed or handler bindings", () => {
  const analysis = analyze(program());
  assert.ok(analysis);
  for (const items of [Array(17).fill("x"), ["é".repeat(257)], Array(16).fill("x".repeat(512))]) {
    assert.equal(start(analysis, bindings.map(binding => binding.name === "items"
      ? { ...binding, value: { kind: Value.StringList, value: items } } : binding)), false);
  }
  assert.equal(start(analysis, [...bindings, { name: "validate", value: { kind: Value.Null } }]), false);
  assert.equal(start(analysis, [...bindings, { name: "unrelated", value: { kind: Value.Boolean, value: false } }]), false);
  assert.equal(start(analysis, [...bindings, { name: "unrelated", value: { kind: Value.Null } }]), true);
});

test("parent and body human commands protect the same names and alone may write the Boolean condition", () => {
  const definition = { ...base, ...program(), identity: { ...base.identity, semanticProfile: "cibseven-2.2.0-sequential-multi-instance-subprocess-draft" } };
  for (const elementId of ["ParentReview", "BodyReview"]) {
    const stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "complete", taskId: { processInstanceId: "batch", elementId, activation: 1 } } as const;
    for (const name of ["items", "item", "validate", "stop"]) {
      assert.equal(command(definition, { ...stimulus, submittedValues: [{ name, value: { kind: Value.Null } }] }), false);
    }
    assert.equal(command(definition, { ...stimulus, submittedValues: [{ name: "stop", value: { kind: Value.Boolean, value: true } }] }), true);
    assert.equal(command(definition, { ...stimulus, submittedValues: [{ name: "local", value: { kind: Value.Null } }] }), true);
  }
  const effect = { kind: StimulusKind.CompleteEffect, commandId: "effect", effectId: { processInstanceId: "batch", elementId: "Validate", activation: 1 } } as const;
  assert.equal(command(definition, { ...effect, result: { kind: EffectExecutionResultKind.Success,
    localPatch: [{ name: "result", value: { kind: Value.Null } }] } }), true);
  assert.equal(command(definition, { ...effect, result: { kind: EffectExecutionResultKind.Success,
    localPatch: [{ name: "stop", value: { kind: Value.Boolean, value: true } }] } }), false);
});


test("accepted Start data initializes the declared body from one unchanged Process snapshot", () => {
  const body = { ...entry, bodyInputs: [read("a", "seed"), read("local", "seed"),
    { target: "seed", expression: { kind: Mapping.StringLiteral, value: "local replacement" } } as const,
    read("z", "seed")] };
  const analysis = analyze(program(body));
  assert.ok(analysis);
  const owner = { processInstanceId: "batch", definitionScopeId: "body", activation: 1 };
  for (const source of [{ kind: Value.Null } as const, { kind: Value.String, value: "Process seed" } as const]) {
    for (const items of [[], ["first", "second"]]) {
      const values = bindings.map(binding => binding.name === "seed" ? { ...binding, value: source }
        : binding.name === "items" ? { ...binding, value: { kind: Value.StringList, value: items } as const } : binding);
      assert.equal(start(analysis, values), true);
      const variables = { ...initialState.variables, process: { bindings: values } };
      const saved = structuredClone(variables);
      const initialized = initializeScopeVariables(variables, owner, body.bodyInputs);
      assert.ok(initialized);
      assert.deepEqual(initialized.scopes, [{ owner, bindings: [
        { name: "a", value: source },
        { name: "local", value: source },
        { name: "seed", value: { kind: Value.String, value: "local replacement" } },
        { name: "z", value: source },
      ] }]);
      assert.deepEqual(initialized.process, variables.process);
      assert.deepEqual(variables, saved);
      assert.equal(initializeScopeVariables(initialized, owner, body.bodyInputs), null);
    }
  }
});
