import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivityBodyKind, CommandOutcome, ControlStateKind, EffectExecutionResultKind, StimulusKind, VariableValueKind,
  applyStimulusWithTrace, initialState, replayCommittedTransitions,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostAdmissionFailureCode, TemporalHostCapabilityResultKind,
  requireBpmnWorkflowContinuationStateV1 } from "@bpmn-lean/temporal-protocol";
import { parallelCommandInputs } from "../../../bpmn-source/test/parallel-scope-command-fixture.ts";

function commit(program: SemanticProcessProgram, state: RuntimeState, command: Stimulus) {
  const trace = applyStimulusWithTrace(program, state, command);
  assert.equal(trace.result.outcome, CommandOutcome.Committed, command.commandId);
  assert.equal(trace.result.internalStepBoundExceeded || trace.result.ambiguousInternalChoice, false);
  assert.deepEqual(replayCommittedTransitions(program, state, trace.committedTransitions), trace.result.state);
  assert.equal(trace.flowNodeOccurrenceLifecycles.length, trace.committedTransitions.length);
  assert.ok(trace.currentPositions);
  return trace;
}

function restore(program: SemanticProcessProgram, state: RuntimeState): RuntimeState {
  assert.equal(state.control.kind, ControlStateKind.Running);
  if (state.control.kind !== ControlStateKind.Running) assert.fail("Expected running checkpoint");
  const bytes = JSON.stringify(state);
  const restored = requireBpmnWorkflowContinuationStateV1(JSON.parse(bytes), program, state.control.instanceId);
  assert.equal(JSON.stringify(restored), bytes);
  return restored;
}

function refuseMutation(program: SemanticProcessProgram, state: RuntimeState, value: unknown, label: string): void {
  assert.notDeepEqual(value, state, `${label}: mutation must change the valid checkpoint`);
  assert.equal(state.control.kind, ControlStateKind.Running);
  if (state.control.kind !== ControlStateKind.Running) assert.fail("Expected running checkpoint");
  const instanceId = state.control.instanceId;
  assert.throws(() => requireBpmnWorkflowContinuationStateV1(value, program, instanceId), label);
}

function human(state: RuntimeState, elementId: string, activation: number, stop = false): Stimulus {
  const wait = state.userTaskWaits.find(({ id }) => id.elementId === elementId && id.activation === activation);
  assert.ok(wait);
  return { kind: StimulusKind.CompleteUserTaskInstance, commandId: `${elementId}-${activation}`, taskId: wait.id,
    submittedValues: stop ? [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } }] : [] };
}

function effect(state: RuntimeState, activation: number): Stimulus {
  const wait = state.effectWaits.find(({ id }) => id.activation === activation);
  assert.ok(wait);
  return { kind: StimulusKind.CompleteEffect, commandId: `effect-${activation}`, effectId: wait.id,
    result: { kind: EffectExecutionResultKind.Success,
      localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "accepted" } }] } };
}

for (const input of await parallelCommandInputs()) {
  test(`private PMIS continuation restores ${input.count} bodies and resumes exact commands and publications`, () => {
    const { program, start, count } = input;
    let state = commit(program, initialState, start).result.state;
    const advance = (command: Stimulus): void => {
      const expected = commit(program, state, command);
      const actual = commit(program, restore(program, state), command);
      assert.deepEqual(actual, expected);
      state = actual.result.state;
    };
    assert.equal(restore(program, state).variables.scopes.length, count);
    for (let activation = 1; activation <= count; activation += 1) {
      advance(human(state, "Review", activation));
      advance(effect(state, activation));
      advance(human(state, "Confirm", activation));
      assert.equal(restore(program, state).variables.scopes.length, count - activation);
    }
    advance(human(state, "PublishBatch", 1));
    assert.equal(state.control.kind, ControlStateKind.Completed);
    assert.throws(() => requireBpmnWorkflowContinuationStateV1(state, program, start.instanceId));
    const host = assessTemporalHostCapability(program);
    assert.equal(host.kind, TemporalHostCapabilityResultKind.Rejected);
    if (host.kind !== TemporalHostCapabilityResultKind.Rejected) assert.fail("Unexpected private host admission");
    assert.equal(host.failure.code, TemporalHostAdmissionFailureCode.ParallelSubProcessQualificationUnavailable);
  });
}

test("private PMIS continuation preserves early cancellation and resumes the parent wait", async () => {
  const { program, start } = (await parallelCommandInputs({ condition: true })).find(({ count }) => count === 2)!;
  let state = commit(program, initialState, start).result.state;
  for (const command of [human(state, "Review", 1, true), human(state, "Review", 2)]) {
    const expected = commit(program, state, command);
    assert.deepEqual(commit(program, restore(program, state), command), expected);
    state = expected.result.state;
  }
  for (const command of [effect(state, 1)]) state = commit(program, restore(program, state), command).result.state;
  const finalBody = human(state, "Confirm", 1);
  const expected = commit(program, state, finalBody);
  assert.deepEqual(commit(program, restore(program, state), finalBody), expected);
  state = restore(program, expected.result.state);
  assert.deepEqual(state.variables.scopes, []);
  assert.deepEqual(state.parallelScopeControllers, []);
  assert.deepEqual(state.effectWaits, []);
  const parent = human(state, "PublishBatch", 1);
  assert.deepEqual(commit(program, restore(program, state), parent), commit(program, state, parent));
});

test("private PMIS continuation refuses malformed live population, frames, capture and issuance", async t => {
  const { program, start } = (await parallelCommandInputs()).find(({ count }) => count === 2)!;
  const state = commit(program, initialState, start).result.state;
  const controller = state.parallelScopeControllers![0]!;
  const frame = state.variables.scopes[0]!;
  const activity = state.activityOccurrences.find(({ body }) => body.kind === ActivityBodyKind.ParallelChildScopes)!;
  assert.equal(activity.body.kind, ActivityBodyKind.ParallelChildScopes);
  if (activity.body.kind !== ActivityBodyKind.ParallelChildScopes) assert.fail("Expected parallel activity");
  const body = activity.body;
  const { parallelScopeControllers: _controllers, ...missingController } = state;
  const invalid: [string, unknown][] = [
    ["missing controller", missingController],
    ["empty controllers", { ...state, parallelScopeControllers: [] }],
    ["duplicate controller", { ...state, parallelScopeControllers: [controller, controller] }],
    ["unknown state field", { ...state, extra: true }],
    ["missing frame", { ...state, variables: { ...state.variables, scopes: state.variables.scopes.slice(1) } }],
    ["duplicate frame", { ...state, variables: { ...state.variables, scopes: [...state.variables.scopes, frame] } }],
    ["missing body", { ...state, scopeOccurrences: state.scopeOccurrences.filter(({ id }) =>
      id.definitionScopeId !== frame.owner.definitionScopeId || id.activation !== frame.owner.activation) }],
    ["wrong parent", { ...state, scopeOccurrences: state.scopeOccurrences.map(scope => scope.id.definitionScopeId === frame.owner.definitionScopeId
      ? { ...scope, parent: { ...scope.parent!, activation: 99 } } : scope) }],
    ["wrong entry", { ...state, activityOccurrences: state.activityOccurrences.map(value => value === activity ? { ...value, operationId: "wrong" } : value) }],
    ["missing population member", { ...state, activityOccurrences: state.activityOccurrences.map(value => value === activity
      ? { ...value, body: { ...body, iterations: body.iterations.slice(1) } } : value) }],
    ["rewound scope issuance", { ...state, scopeActivations: [] }],
    ["rewound activity issuance", { ...state, activityActivations: [] }],
    ["rewound task issuance", { ...state, taskActivations: [] }],
    ["duplicate issuance", { ...state, taskActivations: [...state.taskActivations, state.taskActivations[0]] }],
    ["changed capture", { ...state, variables: { ...state.variables, process: { bindings: [{ name: "items",
      value: { kind: VariableValueKind.StringList, value: ["changed", "same-invoice"] } }] } } }],
  ];
  for (const patch of [{ total: 1 }, { total: 17 }, { completed: 1 }, { completed: -1 }, { extra: true },
    { id: { ...controller.id, activation: 99 } }])
    invalid.push([`controller ${JSON.stringify(patch)}`, { ...state, parallelScopeControllers: [{ ...controller, ...patch }] }]);
  for (const patch of [{ extra: true }, { owner: { ...frame.owner, activation: 99 } }, { bindings: [] },
    { bindings: frame.bindings.map(value => ({ ...value, value: { kind: VariableValueKind.Boolean, value: true } })) }])
    invalid.push([`frame ${JSON.stringify(patch)}`, { ...state, variables: { ...state.variables,
      scopes: state.variables.scopes.map(value => value === frame ? { ...value, ...patch } : value) } }]);
  for (const patch of [{ item: "changed" }, { loopCounter: 1 }, { extra: true },
    { scope: { ...body.iterations[0]!.scope, definitionScopeId: "wrong" } }])
    invalid.push([`iteration ${JSON.stringify(patch)}`, { ...state, activityOccurrences: state.activityOccurrences.map(value => value === activity
      ? { ...value, body: { ...body, iterations: body.iterations.map((iteration, index) => index === 0 ? { ...iteration, ...patch } : iteration) } } : value) }]);
  const pending = commit(program, state, human(state, "Review", 1)).result.state;
  await t.test("rewound effect issuance", () => refuseMutation(program, pending,
    { ...pending, effectActivations: [] }, "rewound effect issuance"));
  for (const [label, value] of invalid) await t.test(label, () => refuseMutation(program, state, value, label));
});

test("private PMIS continuation refuses retained body records after zero entry or complete retirement", async () => {
  const inputs = await parallelCommandInputs();
  const { program, start } = inputs.find(({ count }) => count === 1)!;
  const live = commit(program, initialState, start).result.state;
  let retired = commit(program, live, human(live, "Review", 1)).result.state;
  retired = commit(program, retired, effect(retired, 1)).result.state;
  retired = commit(program, retired, human(retired, "Confirm", 1)).result.state;
  const zero = commit(program, initialState, inputs.find(({ count }) => count === 0)!.start).result.state;
  for (const state of [zero, retired]) {
    restore(program, state);
    for (const invalid of [
      { ...state, parallelScopeControllers: live.parallelScopeControllers },
      { ...state, variables: { ...state.variables, scopes: live.variables.scopes } },
      { ...state, activityOccurrences: live.activityOccurrences },
      { ...state, scopeOccurrences: live.scopeOccurrences },
      { ...state, sequentialScopeControllers: [] },
    ]) refuseMutation(program, state, invalid, "retained body records");
  }
});
