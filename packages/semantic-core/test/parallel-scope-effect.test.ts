import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState, ControlStateKind, SemanticOperationKind as Op, SemanticOriginKind,
  MappingExpressionKind as Mapping, VariableValueKind as Value, EffectExecutionResultKind, StimulusKind, CommandOutcome, LocalDataOwnerKind } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId, VariableMapping, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { program as baseProgram } from "./embedded-subprocess-fixture.ts";
const { enterParallelScope } = await import(new URL("../dist/parallel-scope-runtime.js", import.meta.url).href
) as typeof import("../src/parallel-scope-runtime.ts");
const { deriveInternalOrdinaryArmingPatch } = await import(
  new URL("../dist/internal-transition-ordinary-arming-patch.js", import.meta.url).href
) as typeof import("../src/internal-transition-ordinary-arming-patch.ts");
const { applyInternalOperationOccurrence } = await import(
  new URL("../dist/internal-transition-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-preparation.ts");
const parent: ScopeOccurrenceId = { processInstanceId: "applications", definitionScopeId: "root", activation: 1 };
const body = (activation: number): ScopeOccurrenceId => ({ ...parent, definitionScopeId: "body", activation });
const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement, elementId } as const);
const read = (name: string): VariableMapping => ({ target: name, expression: { kind: Mapping.EnclosingVariable, name } });
const entry = { kind: Op.EnterParallelMultiInstanceScope, id: "enter", origin: origin("Checks"), input: "in",
  childEntry: "check", childScopeId: "body", normalOutput: "out", collectionName: "applications", itemName: "applicant",
  completionBooleanName: null, bodyInputs: [{ target: "status", expression: { kind: Mapping.EnclosingVariable, name: "initial" } }] } as const;
const effect = { kind: Op.AwaitEffect, id: "check", origin: origin("Check"), input: "check", output: "done",
  effect: { elementId: "Check", descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "checkApplication" },
    inputMappings: [read("applicant"), read("status"), read("tenant")], outputMappings: [] }, bpmnErrorRoute: null } as const;
const program = { ...baseProgram, processId: "Applications", definitionScopes: [
  { id: "root", parentScopeId: null, originElementId: "Applications" },
  { id: "body", parentScopeId: "root", originElementId: "Checks" },
], controlPlaces: [{ id: "check", origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Input" } as const }],
  controlPlaceScopes: [{ controlPlaceId: "check", scopeId: "body" }], operations: [entry, effect], operationScopes: [
  { operationId: entry.id, scopeId: "root" }, { operationId: effect.id, scopeId: "body" }] };
function ready(items: readonly string[]): RuntimeState {
  return { ...initialState, control: { kind: ControlStateKind.Running, instanceId: parent.processInstanceId },
    controlTokens: [{ placeId: "in", owner: parent, multiplicity: 1 }], scopeOccurrences: [{ id: parent, parent: null }],
    variables: { ...initialState.variables, process: { bindings: [
      { name: "applicant", value: { kind: Value.String, value: "wrong-process-item" } },
      { name: "applications", value: { kind: Value.StringList, value: items } },
      { name: "initial", value: { kind: Value.Null } },
      { name: "status", value: { kind: Value.String, value: "wrong-process-status" } },
      { name: "tenant", value: { kind: Value.String, value: "acme" } },
    ] } } };
}
function active(items: readonly string[] = ["A", "B"]): RuntimeState {
  const state = enterParallelScope({ ...entry, elementId: entry.origin.elementId }, ready(items), parent);
  assert.ok(state);
  return state;
}
const expected = (item: string) => [
  { name: "applicant", value: { kind: Value.String, value: item } },
  { name: "status", value: { kind: Value.Null } },
  { name: "tenant", value: { kind: Value.String, value: "acme" } },
];

test("parallel Service inputs bind the captured item and local null before Process namesakes", () => {
  const state = active();
  for (const [activation, item] of [[1, "A"], [2, "B"]] as const) {
    const patch = deriveInternalOrdinaryArmingPatch(program, effect, state, body(activation));
    assert.ok(patch && patch.kind === "effect");
    assert.deepEqual(patch.wait.arguments, expected(item));
  }
});

test("a malformed sibling, stale owner or missing controller cannot fall back to Process inputs", () => {
  const state = active();
  const saved = structuredClone(state);
  for (const invalid of [
    { ...state, parallelScopeControllers: [] },
    { ...state, variables: { ...state.variables, scopes: state.variables.scopes.slice(0, 1) } },
    { ...state, scopeOccurrences: state.scopeOccurrences.filter(scope => scope.id.activation !== 2) },
    { ...state, variables: { ...state.variables, scopes: [...state.variables.scopes, state.variables.scopes[0]!] } },
  ]) assert.equal(deriveInternalOrdinaryArmingPatch(program, effect, invalid, body(1)), null);
  assert.equal(deriveInternalOrdinaryArmingPatch(program, effect, state, body(3)), null);
  assert.equal(deriveInternalOrdinaryArmingPatch({ ...program, operations: [...program.operations, entry] }, effect, state, body(1)), null);
  assert.deepEqual(state, saved);
});

test("effect arming revalidates each body, reserves distinct identities and retains input snapshots", () => {
  const before = active();
  const second = applyInternalOperationOccurrence(program, before, { operationId: effect.id, owner: body(2) });
  assert.ok(second);
  const both = applyInternalOperationOccurrence(program, second, { operationId: effect.id, owner: body(1) });
  assert.ok(both);
  assert.deepEqual(both.effectWaits.map(wait => [wait.owner, wait.id.activation, wait.arguments]),
    [[body(2), 1, expected("B")], [body(1), 2, expected("A")]]);
  assert.equal(applyInternalOperationOccurrence(program, both, { operationId: effect.id, owner: body(1) }), null);
  assert.deepEqual(both.variables.process, before.variables.process);
  assert.deepEqual(both.variables.scopes, before.variables.scopes);
  assert.equal(both.variables.activities.length, 2);
  assert.deepEqual(before.effectWaits, []);
});

test("parallel input mapping preserves declaration independence and rejects unavailable or ambiguous reads", () => {
  const state = active();
  const patchFor = (mappings: readonly VariableMapping[], runtime = state) =>
    deriveInternalOrdinaryArmingPatch(program, { ...effect, effect: { ...effect.effect, inputMappings: mappings } }, runtime, body(2));
  const reversed = patchFor([...effect.effect.inputMappings].reverse(), { ...state,
    scopeOccurrences: [...state.scopeOccurrences].reverse(), variables: { ...state.variables,
      scopes: [...state.variables.scopes].reverse() } });
  assert.ok(reversed && reversed.kind === "effect");
  assert.deepEqual(reversed.wait.arguments, expected("B"));
  for (const mappings of [
    [read("absent")], [read("checkApplication")], [read("applications")],
    [read("tenant"), read("tenant")],
    [{ target: "bad", expression: { kind: Mapping.LocalVariable, name: "status" } }],
    [{ target: "new", expression: { kind: Mapping.StringLiteral, value: "value" } }, read("new")],
  ] as const) assert.equal(patchFor(mappings), null);
  const brokenLocals = (bindings: RuntimeState["variables"]["process"]["bindings"]) => ({ ...state,
    variables: { ...state.variables, scopes: state.variables.scopes.map(frame => frame.owner.activation === 2
      ? { ...frame, bindings } : frame) } });
  assert.equal(patchFor([read("status")], brokenLocals([
    { name: "status", value: { kind: Value.Boolean, value: true } },
  ])), null);
  assert.equal(patchFor([read("status")], brokenLocals([
    { name: "status", value: { kind: Value.Null } }, { name: "status", value: { kind: Value.String, value: "duplicate" } },
  ])), null);
});

test("parallel effects cannot inherit a footprint that omits their body and population reads", async () => {
  const { deriveInternalTransitionFootprint } = await import(
    new URL("../dist/internal-transition-footprint.js", import.meta.url).href
  ) as typeof import("../src/internal-transition-footprint.ts");
  const state = applyInternalOperationOccurrence(program, active(), { operationId: effect.id, owner: body(1) });
  assert.ok(state);
  assert.equal(deriveInternalTransitionFootprint(program, state, { operation: effect, owner: body(2) }), null);
});

test("parallel human completion updates only its declared locals and preserves shared writes", async () => {
  const { completeOrdinaryUserTask } = await import(new URL("../dist/semantic-process-user-task-runtime.js", import.meta.url).href
  ) as typeof import("../src/semantic-process-user-task-runtime.ts");
  const task = { kind: Op.AwaitUserTask, id: "review", origin: origin("Review"), input: "check", output: "done",
    task: { elementId: "Review", name: "Review application" } } as const;
  const selected = { ...program, operations: [entry, task], operationScopes: [
    { operationId: entry.id, scopeId: "root" }, { operationId: task.id, scopeId: "body" }] };
  const armed = applyInternalOperationOccurrence(selected, active(), { operationId: task.id, owner: body(2) });
  assert.ok(armed);
  const taskId = armed.userTaskWaits[0]!.id;
  const stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review", taskId, submittedValues: [
    { name: "decision", value: { kind: Value.String, value: "approve" } },
    { name: "status", value: { kind: Value.String, value: "reviewed" } },
  ] } as const;
  const result = completeOrdinaryUserTask(selected, armed, stimulus);
  assert.ok(result);
  assert.deepEqual(result.variables.scopes[0], armed.variables.scopes[0]);
  assert.deepEqual(result.variables.scopes[1]?.bindings, [stimulus.submittedValues[1]]);
  assert.deepEqual(result.variables.process.bindings.find(value => value.name === "decision"), stimulus.submittedValues[0]);
  assert.deepEqual(result.variables.process.bindings.find(value => value.name === "status"),
    armed.variables.process.bindings.find(value => value.name === "status"));
  assert.equal(completeOrdinaryUserTask(selected, { ...armed, parallelScopeControllers: [] }, stimulus), null);
  assert.equal(completeOrdinaryUserTask(selected, { ...armed, userTaskWaits: [...armed.userTaskWaits, ...armed.userTaskWaits] }, stimulus), null);
  assert.equal(completeOrdinaryUserTask(selected, result, stimulus), null);
});

test("parallel Service completion maps its result to the exact body and disposes only its effect frame", async () => {
  const { completeParallelScopeEffect } = await import(new URL("../dist/parallel-scope-data.js", import.meta.url).href
  ) as typeof import("../src/parallel-scope-data.ts");
  const mapped = { ...effect, effect: { ...effect.effect, outputMappings: [
    { target: "status", expression: { kind: Mapping.LocalVariable, name: "result" } },
  ] } } as const;
  const selected = { ...program, operations: [entry, mapped] };
  const one = applyInternalOperationOccurrence(selected, active(), { operationId: effect.id, owner: body(2) });
  assert.ok(one);
  const both = applyInternalOperationOccurrence(selected, one, { operationId: effect.id, owner: body(1) });
  assert.ok(both);
  const result = { kind: EffectExecutionResultKind.Success,
    localPatch: [{ name: "result", value: { kind: Value.String, value: "checked" } }] } as const;
  const wait = both.effectWaits[0]!;
  const after = completeParallelScopeEffect(selected, both, wait.id, result);
  assert.ok(after);
  assert.deepEqual(after.variables.scopes[1]?.bindings, [{ name: "status", value: result.localPatch[0].value }]);
  assert.deepEqual(after.variables.scopes[0], both.variables.scopes[0]);
  assert.deepEqual(after.variables.process, both.variables.process);
  assert.deepEqual(after.effectWaits, [both.effectWaits[1]]);
  assert.equal(after.variables.activities.length, 1);
  assert.deepEqual(after.controlTokens, [{ placeId: "done", owner: body(2), multiplicity: 1 }]);
  assert.equal(completeParallelScopeEffect(selected, after, wait.id, result), null);
  assert.equal(completeParallelScopeEffect(selected, { ...both, parallelScopeControllers: [] }, wait.id, result), null);
  assert.equal(completeParallelScopeEffect(selected, { ...both, effectWaits: [...both.effectWaits, wait] }, wait.id, result), null);
  assert.equal(completeParallelScopeEffect(selected, both, wait.id, { ...result, localPatch: [] }), null);
  assert.equal(completeParallelScopeEffect(selected, both, wait.id,
    { kind: EffectExecutionResultKind.BpmnError, code: "FAIL", message: null, localPatch: [] }), null);
});

test("occurrence scheduling completes every parallel body and emits one parent continuation", async () => {
  const { deriveInternalOccurrenceFrontier } = await import(new URL("../dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../src/internal-transition-preparation.ts");
  const { completeParallelScopeEffect } = await import(new URL("../dist/parallel-scope-data.js", import.meta.url).href
  ) as typeof import("../src/parallel-scope-data.ts");
  const end = { kind: Op.ReachNoneEnd, id: "end", origin: origin("End"), input: "done" } as const;
  const complete = { kind: Op.CompleteParallelMultiInstanceScope, id: "complete", origin: entry.origin,
    entryOperationId: entry.id } as const;
  const selected = { ...program, operations: [entry, effect, end, complete], operationScopes: [
    ...program.operationScopes, { operationId: end.id, scopeId: "body" }, { operationId: complete.id, scopeId: "body" }] };
  for (const count of [0, 1, 2, 16]) for (const reverse of [false, true]) {
    const entered = applyInternalOperationOccurrence(selected, ready(Array.from({ length: count }, () => "same")),
      { operationId: entry.id, owner: parent });
    assert.ok(entered);
    let state = entered;
    const order = Array.from({ length: count }, (_, index) => index + 1);
    if (reverse) order.reverse();
    for (const activation of order) {
      const offers = deriveInternalOccurrenceFrontier(selected, state);
      assert.ok(offers);
      const offer = offers.find(({ candidate }) => candidate.operationId === effect.id && candidate.owner.activation === activation);
      assert.ok(offer);
      state = offer.successor;
    }
    assert.equal(state.effectWaits.length, count);
    for (const activation of order) {
      const wait = state.effectWaits.find(wait => wait.owner.activation === activation)!;
      const finished = completeParallelScopeEffect(selected, state, wait.id,
        { kind: EffectExecutionResultKind.Success, localPatch: [] });
      assert.ok(finished);
      const ended = applyInternalOperationOccurrence(selected, finished, { operationId: end.id, owner: body(activation) });
      assert.ok(ended);
      const retired = applyInternalOperationOccurrence(selected, ended, { operationId: complete.id, owner: body(activation) });
      assert.ok(retired);
      state = retired;
    }
    assert.deepEqual(state.controlTokens, [{ placeId: "out", owner: parent, multiplicity: 1 }]);
    assert.deepEqual(state.parallelScopeControllers, count === 0 ? undefined : []);
    assert.deepEqual(state.variables.scopes, []);
    assert.deepEqual(state.variables.activities, []);
    assert.equal(state.effectWaits.length, 0);
    assert.equal(state.endOccurrences, count);
  }
});

test("a true human condition waits for the whole body, then cancels siblings and fences late results", async () => {
  const { completeOrdinaryUserTask } = await import(new URL("../dist/semantic-process-user-task-runtime.js", import.meta.url).href
  ) as typeof import("../src/semantic-process-user-task-runtime.ts");
  const { completeParallelScopeEffect } = await import(new URL("../dist/parallel-scope-data.js", import.meta.url).href
  ) as typeof import("../src/parallel-scope-data.ts");
  const repeated = { ...entry, completionBooleanName: "approved" };
  const fork = { kind: Op.Duplicate, id: "fork", origin: origin("Fork"), input: "check", outputs: ["human", "service"] } as const;
  const service = { ...effect, input: "service" };
  const task = { kind: Op.AwaitUserTask, id: "review", origin: origin("Review"), input: "human", output: "humanDone",
    task: { elementId: "Review", name: "Review application" } } as const;
  const end = { kind: Op.ReachNoneEnd, id: "end", origin: origin("End"), input: "done" } as const;
  const humanEnd = { ...end, id: "humanEnd", input: "humanDone", origin: origin("HumanEnd") };
  const complete = { kind: Op.CompleteParallelMultiInstanceScope, id: "complete", origin: entry.origin, entryOperationId: entry.id } as const;
  const operations = [repeated, fork, service, task, end, humanEnd, complete];
  const selected = { ...program, operations, operationScopes: operations.map(operation => ({ operationId: operation.id,
    scopeId: operation.id === entry.id ? "root" : "body" })) };
  const initial = ready(["A", "B"]);
  const before = { ...initial, variables: { ...initial.variables, process: { bindings: [
    ...initial.variables.process.bindings.slice(0, 2), { name: "approved", value: { kind: Value.Boolean, value: false } } as const,
    ...initial.variables.process.bindings.slice(2),
  ] } } };
  const step = (state: RuntimeState, operationId: string, owner: ScopeOccurrenceId): RuntimeState => {
    const next = applyInternalOperationOccurrence(selected, state, { operationId, owner });
    assert.ok(next, `${operationId} in ${owner.activation}`);
    return next;
  };
  let state = step(before, entry.id, parent);
  for (const activation of [1, 2]) {
    state = step(state, fork.id, body(activation));
    state = step(state, service.id, body(activation));
    state = step(state, task.id, body(activation));
  }
  const firstTask = state.userTaskWaits[0]!;
  const staleTask = state.userTaskWaits[1]!;
  const firstEffect = state.effectWaits[0]!;
  const staleEffect = state.effectWaits[1]!;
  const approved = completeOrdinaryUserTask(selected, state, { kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "approve", taskId: firstTask.id, submittedValues: [{ name: "approved", value: { kind: Value.Boolean, value: true } }] });
  assert.ok(approved);
  state = step(approved, humanEnd.id, body(1));
  assert.equal(applyInternalOperationOccurrence(selected, state, { operationId: complete.id, owner: body(1) }), null);
  const success = { kind: EffectExecutionResultKind.Success, localPatch: [] } as const;
  const finished = completeParallelScopeEffect(selected, state, firstEffect.id, success);
  assert.ok(finished);
  state = step(step(finished, end.id, body(1)), complete.id, body(1));
  assert.deepEqual(state.controlTokens, [{ placeId: "out", owner: parent, multiplicity: 1 }]);
  assert.deepEqual([state.effectWaits, state.userTaskWaits, state.variables.scopes, state.variables.activities], [[], [], [], []]);
  assert.deepEqual(state.variables.process.bindings.find(binding => binding.name === "approved")?.value,
    { kind: Value.Boolean, value: true });
  assert.equal(completeParallelScopeEffect(selected, state, staleEffect.id, success), null);
  assert.equal(completeOrdinaryUserTask(selected, state, { kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "late", taskId: staleTask.id, submittedValues: [] }), null);
  assert.equal(applyInternalOperationOccurrence(selected, state, { operationId: complete.id, owner: body(2) }), null);
});

test("the runtime frontier carries both exact bodies and bypasses the operation-only callback", async () => {
  const { deriveInternalExecutionFrontier } = await import(new URL("../dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../src/internal-transition-preparation.ts");
  const selected = { ...program, identity: { ...program.identity, semanticProfile: "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" } };
  const frontier = deriveInternalExecutionFrontier(selected, active(), () => {
    assert.fail("parallel discovery must not invoke the operation-only callback");
  });
  assert.equal(frontier.preparationFailed, false);
  assert.deepEqual(frontier.offers.map(offer => offer.alternative), [1, 2].map(activation => ({
    kind: "operationOccurrence", operationId: effect.id, owner: body(activation),
  })));
  assert.deepEqual(frontier.offers.map(offer => offer.step.owner), [body(1), body(2)]);
  assert.ok(frontier.offers.every(offer => offer.preparation === null));
});

test("private closure executes an exact singleton and rolls back a frontier without complete preparations", async () => {
  const { deriveInternalExecutionFrontier } = await import(new URL("../dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../src/internal-choice-schedule.ts");
  const selected = { ...program, identity: { ...program.identity, semanticProfile: "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" } };
  const run = (before: RuntimeState) => evaluateScheduledClosure(selected, before,
    { outcome: CommandOutcome.Committed, state: before }, [], 2,
    state => {
      const { occurrenceBatch: _missingCertificate, ...frontier } =
        deriveInternalExecutionFrontier(selected, state, () => assert.fail("legacy dispatch"));
      return frontier;
    });
  const singleton = run(active(["A"]));
  assert.equal(singleton.result.outcome, CommandOutcome.Committed);
  assert.equal(singleton.result.state.effectWaits.length, 1);
  assert.deepEqual(singleton.selectedInternalSteps.map(step => step.owner), [body(1)]);
  const before = active();
  const concurrent = run(before);
  assert.equal(concurrent.result.outcome, CommandOutcome.RolledBack);
  assert.equal(concurrent.result.ambiguousInternalChoice, true);
  assert.deepEqual(concurrent.result.state, before);
  assert.deepEqual(concurrent.selectedInternalSteps, []);
});

for (const count of [2, 16]) test(`parallel closure reserves the complete ${count}-body same-definition cohort`, async () => {
  const { deriveInternalExecutionFrontier } = await import(new URL("../dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../src/internal-choice-schedule.ts");
  const selected = { ...program, identity: { ...program.identity, semanticProfile: "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" } };
  const before = active(Array.from({ length: count }, () => "same"));
  const run = (state: RuntimeState, limit: number) => evaluateScheduledClosure(selected, state,
    { outcome: CommandOutcome.Committed, state }, [], limit,
    current => deriveInternalExecutionFrontier(selected, current, () => assert.fail("legacy dispatch")));
  const result = run(before, count);
  assert.equal(result.result.outcome, CommandOutcome.Committed, `${count}-body cohort`);
  assert.deepEqual(result.selectedInternalBatches.map(batch => batch.length), [count]);
  assert.deepEqual(result.result.state.effectWaits.map(wait => [wait.owner, wait.id.activation, wait.arguments]),
    Array.from({ length: count }, (_, index) => [body(index + 1), index + 1, expected("same")]));
  assert.equal(result.result.state.controlTokens.length, 0);
  assert.deepEqual(run({ ...before, scopeOccurrences: [...before.scopeOccurrences].reverse(),
    variables: { ...before.variables, scopes: [...before.variables.scopes].reverse() } }, count)
    .result.state.effectWaits, result.result.state.effectWaits);
  const exhausted = run(before, count - 1);
  assert.equal(exhausted.result.outcome, CommandOutcome.RolledBack);
  assert.equal(exhausted.result.internalStepBoundExceeded, true);
  assert.deepEqual(exhausted.result.state, before);
  assert.deepEqual(exhausted.selectedInternalSteps, []);
});

const { prepareInternalOccurrenceBatch, applyInternalOccurrenceBatch } = await import(
  new URL("../dist/internal-occurrence-batch.js", import.meta.url).href
) as typeof import("../src/internal-occurrence-batch.ts");

const reservationProgram = { ...program, identity: { ...program.identity,
  semanticProfile: "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" } };

test("a token-enabled wait that cannot arm makes closure refuse rather than appear stable", async (t) => {
  const { deriveInternalExecutionFrontier } = await import(new URL("../dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../src/internal-choice-schedule.ts");
  const before = active();
  const missingInput = { ...before, variables: { ...before.variables,
    process: { ...before.variables.process, bindings: before.variables.process.bindings.filter(binding => binding.name !== "tenant") } } };
  for (const [name, state] of [
    ["exhausted issuance counter", { ...before, effectActivations: [{ elementId: effect.effect.elementId, count: Number.MAX_SAFE_INTEGER }] }],
    ["missing input", missingInput],
  ] as const) await t.test(name, () => {
    const closed = evaluateScheduledClosure(reservationProgram, state,
      { outcome: CommandOutcome.Committed, state }, [], 2,
      current => deriveInternalExecutionFrontier(reservationProgram, current, () => assert.fail("legacy dispatch")));
    assert.equal(closed.result.outcome, CommandOutcome.RolledBack);
    assert.deepEqual(closed.result.state, state);
    assert.deepEqual(closed.selectedInternalSteps, []);
  });
  const certificate = prepareInternalOccurrenceBatch(reservationProgram, before);
  assert.ok(certificate);
  const armed = applyInternalOccurrenceBatch(reservationProgram, before, certificate)!.at(-1)!.successor;
  const waiting = { ...armed, effectActivations: [{ elementId: effect.effect.elementId, count: Number.MAX_SAFE_INTEGER }] };
  const settled = evaluateScheduledClosure(reservationProgram, waiting,
    { outcome: CommandOutcome.Committed, state: waiting }, [], 2,
    current => deriveInternalExecutionFrontier(reservationProgram, current, () => assert.fail("legacy dispatch")));
  assert.equal(settled.result.outcome, CommandOutcome.Committed);
  assert.deepEqual(settled.result.state, waiting);
});

test("reservation certificates freeze slots, snapshots and per-step publications without mutating the predecessor", () => {
  const before = active();
  const saved = structuredClone(before);
  const certificate = prepareInternalOccurrenceBatch(reservationProgram, before);
  assert.ok(certificate);
  const secondPatch = certificate.members[1]!.patch;
  assert.ok(secondPatch.kind === "effect");
  assert.ok(Object.isFrozen(secondPatch.wait));
  assert.deepEqual(certificate.members.map(member => [member.base, member.slot]), [[0, 1], [0, 2]]);
  const steps = applyInternalOccurrenceBatch(reservationProgram, before, certificate);
  assert.ok(steps);
  assert.deepEqual(steps.map(step => [step.operation.id, step.owner, step.successor.effectWaits.length]),
    [[effect.id, body(1), 1], [effect.id, body(2), 2]]);
  assert.deepEqual(certificate.members.map(member => member.publicationTemplate.lifecycle.started[0]!.anchor),
    steps.map(step => ({ kind: "wait", id: step.successor.effectWaits.at(-1)!.id })));
  assert.deepEqual(before, saved);
  const prefixed = { ...before, effectActivations: [{ elementId: "Check", count: 8 }] };
  const reserved = prepareInternalOccurrenceBatch(reservationProgram, prefixed);
  assert.ok(reserved);
  assert.deepEqual(reserved.members.map(member => member.slot), [9, 10]);
  assert.equal(applyInternalOccurrenceBatch(reservationProgram, prefixed, reserved)?.at(-1)?.successor.effectActivations[0]?.count, 10);
});

test("full-prefix application refuses altered Program, predecessor, candidates, bases, slots and the final patch atomically", () => {
  const before = active();
  const saved = structuredClone(before);
  const certificate = prepareInternalOccurrenceBatch(reservationProgram, before);
  assert.ok(certificate);
  const first = certificate.members[0]!;
  const last = certificate.members[1]!;
  const lastPatch = last.patch;
  assert.ok(lastPatch.kind === "effect");
  for (const invalid of [
    { ...certificate, programBinding: "stale" }, { ...certificate, predecessorBinding: "stale" },
    { ...certificate, members: [first] }, { ...certificate, members: [first, first] },
    { ...certificate, members: [last, first] },
    { ...certificate, members: [first, { ...last, base: 1 }] },
    { ...certificate, members: [first, { ...last, slot: 3 }] },
    { ...certificate, members: [first, { ...last, alternative: { ...last.alternative, owner: body(3) } }] },
    { ...certificate, members: [first, { ...last, patch: { ...last.patch, input: "missing" } }] },
    { ...certificate, members: [first, { ...last, patch: { ...lastPatch, wait: { ...lastPatch.wait,
      id: { ...lastPatch.wait.id, activation: 1 } } } }] },
    { ...certificate, members: [first, { ...last, publicationTemplate: first.publicationTemplate }] },
  ]) assert.equal(applyInternalOccurrenceBatch(reservationProgram, before, invalid), null);
  assert.equal(applyInternalOccurrenceBatch({ ...reservationProgram, processId: "other" }, before, certificate), null);
  assert.equal(applyInternalOccurrenceBatch({ ...reservationProgram, operations: [entry, { ...effect, output: "other" }] }, before, certificate), null);
  const changed = [
    { ...before, controlTokens: before.controlTokens.slice(0, 1) },
    { ...before, effectActivations: [{ elementId: "Check", count: 1 }] },
    { ...before, variables: { ...before.variables, scopes: before.variables.scopes.map(frame => frame.owner.activation === 2
      ? { ...frame, bindings: [{ name: "status", value: { kind: Value.String, value: "changed" } as const }] } : frame) } },
    { ...before, scopeOccurrences: before.scopeOccurrences.map(scope => scope.id.activation === 2 ? { ...scope, parent: body(1) } : scope) },
    { ...before, parallelScopeControllers: [] },
    { ...before, activityOccurrences: [...before.activityOccurrences, ...before.activityOccurrences] },
  ];
  for (const stale of changed) assert.equal(applyInternalOccurrenceBatch(reservationProgram, stale, certificate), null);
  assert.deepEqual(before, saved);
});

test("reservation refuses malformed counters, duplicate buckets, existing anchors and late public identity collision", () => {
  const before = active();
  const one = applyInternalOperationOccurrence(reservationProgram, before, { operationId: effect.id, owner: body(1) });
  assert.ok(one);
  const wait = one.effectWaits[0]!;
  for (const effectActivations of [
    [{ elementId: "Check", count: -1 }], [{ elementId: "Check", count: 0.5 }],
    [{ elementId: "Check", count: Number.MAX_SAFE_INTEGER }],
    [{ elementId: "Check", count: Number.MAX_SAFE_INTEGER - 1 }],
    [{ elementId: "Check", count: 0 }, { elementId: "Check", count: 0 }],
  ]) assert.equal(prepareInternalOccurrenceBatch(reservationProgram, { ...before, effectActivations }), null);
  for (const invalid of [
    { ...before, controlTokens: [...before.controlTokens, before.controlTokens[0]!] },
    { ...before, effectWaits: [wait] },
    { ...before, effectWaits: [{ ...wait, id: { ...wait.id, activation: 2 } }] },
    { ...before, effectWaits: [wait, wait] },
    { ...before, variables: { ...before.variables, activities: one.variables.activities } },
    { ...before, variables: { ...before.variables, activities: [one.variables.activities[0]!, one.variables.activities[0]!] } },
    { ...before, variables: { ...before.variables, scopes: before.variables.scopes.slice(0, 1) } },
  ]) assert.equal(prepareInternalOccurrenceBatch(reservationProgram, invalid), null);
  for (const invalid of [
    { ...reservationProgram, operations: [...reservationProgram.operations, effect] },
    { ...reservationProgram, operations: [...reservationProgram.operations, { ...effect, id: "alias" }], operationScopes: [...reservationProgram.operationScopes,
      { operationId: "alias", scopeId: "body" }] },
    { ...reservationProgram, controlPlaces: [] }, { ...reservationProgram, controlPlaceScopes: [] },
    { ...reservationProgram, definitionScopes: reservationProgram.definitionScopes.slice(1) },
  ]) assert.equal(prepareInternalOccurrenceBatch(invalid, before), null);
});

test("human cohorts validate the whole sibling population and mixed arming keeps counter domains separate", () => {
  const task = { kind: Op.AwaitUserTask, id: "review", origin: origin("Review"), input: "check", output: "done",
    task: { elementId: "Review", name: "Review application" } } as const;
  const selected = { ...reservationProgram, operations: [entry, task], operationScopes: [reservationProgram.operationScopes[0]!,
    { operationId: task.id, scopeId: "body" }] };
  const before = active();
  const certificate = prepareInternalOccurrenceBatch(selected, before);
  assert.ok(certificate);
  assert.deepEqual(applyInternalOccurrenceBatch(selected, before, certificate)?.at(-1)?.successor.userTaskWaits
    .map(wait => [wait.owner, wait.id.activation]), [[body(1), 1], [body(2), 2]]);
  assert.equal(prepareInternalOccurrenceBatch(selected, { ...before, variables: { ...before.variables,
    scopes: before.variables.scopes.slice(0, 1) } }), null);
  const mixed: SemanticProcessProgram = { ...reservationProgram, operations: [entry, effect, { ...task, input: "human" }], operationScopes: [
    ...reservationProgram.operationScopes, { operationId: task.id, scopeId: "body" }],
    controlPlaces: [...reservationProgram.controlPlaces, { ...reservationProgram.controlPlaces[0]!, id: "human",
      origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "HumanInput" } }],
    controlPlaceScopes: [...reservationProgram.controlPlaceScopes, { controlPlaceId: "human", scopeId: "body" }] };
  const mixedState = { ...before, controlTokens: [before.controlTokens[0]!, { placeId: "human", owner: body(2), multiplicity: 1 }] };
  const reserved = prepareInternalOccurrenceBatch(mixed, mixedState);
  assert.ok(reserved);
  assert.deepEqual(reserved.members.map(member => member.slot), [1, 1]);
  assert.equal(applyInternalOccurrenceBatch(mixed, mixedState, reserved)?.length, 2);
  const ending = { kind: Op.ReachNoneEnd, id: "end", origin: origin("End"), input: "human" } as const;
  const withEnd = prepareInternalOccurrenceBatch({ ...mixed, operations: [entry, effect, ending], operationScopes: [
    ...reservationProgram.operationScopes, { operationId: ending.id, scopeId: "body" }] }, mixedState);
  assert.ok(withEnd);
  assert.deepEqual(withEnd.members.map(member => member.slot), [1, null]);
});

test("the scheduler discards every retained step when a cohort or its complete candidate frontier is forged", async () => {
  const { deriveInternalExecutionFrontier } = await import(new URL("../dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../src/internal-choice-schedule.ts");
  const selected = { ...reservationProgram, identity: { ...reservationProgram.identity, semanticProfile: "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" } };
  const before = active();
  const frontier = deriveInternalExecutionFrontier(selected, before, () => assert.fail("legacy dispatch"));
  const certificate = frontier.occurrenceBatch;
  assert.ok(certificate);
  const last = certificate.members[1]!;
  for (const forged of [
    { ...frontier, offers: frontier.offers.slice(1) },
    { ...frontier, offers: [frontier.offers[0]!, frontier.offers[0]!] },
    { ...frontier, occurrenceBatch: { ...certificate, members: [certificate.members[0]!,
      { ...last, patch: { ...last.patch, input: "missing-last-input" } }] } },
  ]) {
    const result = evaluateScheduledClosure(selected, before, { outcome: CommandOutcome.Committed, state: before }, [], 2, () => forged);
    assert.equal(result.result.outcome, CommandOutcome.RolledBack);
    assert.deepEqual(result.result.state, before);
    assert.deepEqual([result.selectedInternalSteps, result.selectedInternalBatches], [[], []]);
  }
  const collision = { ...before, variables: { ...before.variables, activities: [{
    owner: { kind: LocalDataOwnerKind.EffectOccurrence as const, id: { processInstanceId: parent.processInstanceId, elementId: "Check", activation: 1 } },
    bindings: [],
  }] } };
  const invalid = deriveInternalExecutionFrontier(selected, collision, () => assert.fail("legacy dispatch"));
  assert.equal(invalid.preparationFailed, true);
  assert.deepEqual(invalid.offers, []);
});

for (const kind of ["human", "effect"] as const) test(`reservation rejects ${kind} origin-to-wait identity mismatch`, () => {
  const operation = kind === "effect" ? { ...effect, origin: origin("WrongOrigin") } : {
    kind: Op.AwaitUserTask, id: "review", origin: origin("WrongOrigin"), input: "check", output: "done",
    task: { elementId: "Review", name: "Review application" },
  } as const;
  const selected = { ...reservationProgram, operations: [entry, operation], operationScopes: [
    reservationProgram.operationScopes[0]!, { operationId: operation.id, scopeId: "body" }] };
  assert.equal(prepareInternalOccurrenceBatch(selected, active()) === null, true);
});

test("reservation helper refuses every profile outside its private checkpoint", () => {
  const before = active();
  assert.ok(prepareInternalOccurrenceBatch(reservationProgram, before));
  for (const semanticProfile of [baseProgram.identity.semanticProfile, "unknown-profile"])
    assert.equal(prepareInternalOccurrenceBatch({ ...reservationProgram,
      identity: { ...reservationProgram.identity, semanticProfile } }, before) === null, true);
});

test("reservation refuses unsafe or negative publication time", () => {
  const before = active();
  for (const logicalTimeMs of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(prepareInternalOccurrenceBatch(reservationProgram, { ...before, logicalTimeMs }) === null, true);
  assert.ok(prepareInternalOccurrenceBatch(reservationProgram, { ...before, logicalTimeMs: Number.MAX_SAFE_INTEGER }));
});

function tokenControlProgram(operations: readonly SemanticOperation[], places: readonly string[]): SemanticProcessProgram {
  return { ...reservationProgram, operations: [entry, ...operations],
    operationScopes: [{ operationId: entry.id, scopeId: "root" }, ...operations.map(operation => ({ operationId: operation.id, scopeId: "body" }))],
    controlPlaces: places.map(id => ({ id, origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: `Flow_${id}` } })),
    controlPlaceScopes: places.map(controlPlaceId => ({ controlPlaceId, scopeId: "body" })) };
}
const reservedFork = { kind: Op.Duplicate, id: "fork", origin: origin("Fork"), input: "check", outputs: ["left", "right"] } as const;
const reservedJoin = { kind: Op.Synchronize, id: "join", origin: origin("Join"), inputs: ["left", "right"], output: "finished" } as const;
const reservedEnd = { kind: Op.ReachNoneEnd, id: "end", origin: origin("End"), input: "finished" } as const;

for (const count of [2, 16]) test(`reserved controls close ${count} forks, joins and Ends with exact fuel`, async () => {
  const { deriveInternalExecutionFrontier } = await import(new URL("../dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../src/internal-choice-schedule.ts");
  const selected = tokenControlProgram([reservedFork, reservedJoin, reservedEnd], ["check", "left", "right", "finished"]);
  const before = active(Array.from({ length: count }, () => "same"));
  const run = (definition: SemanticProcessProgram, state: RuntimeState, fuel: number) => evaluateScheduledClosure(definition, state,
    { outcome: CommandOutcome.Committed, state }, [], fuel,
    current => deriveInternalExecutionFrontier(definition, current, () => assert.fail("legacy dispatch")));
  const closed = run(selected, before, count * 3);
  assert.equal(closed.result.outcome, CommandOutcome.Committed);
  assert.deepEqual(closed.selectedInternalBatches.map(batch => batch.length), [count, count, count]);
  assert.equal(closed.result.state.endOccurrences, count);
  assert.deepEqual(closed.result.state.controlTokens, []);
  assert.deepEqual(closed.result.state.variables, before.variables);
  const reversed = run({ ...selected, operations: [...selected.operations].reverse() }, { ...before,
    controlTokens: [...before.controlTokens].reverse(), scopeOccurrences: [...before.scopeOccurrences].reverse() }, count * 3);
  assert.deepEqual(reversed.selectedInternalSteps.map(step => [step.operation.id, step.owner]),
    closed.selectedInternalSteps.map(step => [step.operation.id, step.owner]));
  assert.deepEqual(reversed.result.state.controlTokens, closed.result.state.controlTokens);
  const first = prepareInternalOccurrenceBatch(selected, before);
  assert.ok(first);
  const reversedCertificate = prepareInternalOccurrenceBatch({ ...selected, operations: [...selected.operations].reverse() },
    { ...before, controlTokens: [...before.controlTokens].reverse(), scopeOccurrences: [...before.scopeOccurrences].reverse() });
  assert.ok(reversedCertificate);
  assert.deepEqual(reversedCertificate.members, first.members);
  assert.equal(reversed.result.state.endOccurrences, closed.result.state.endOccurrences);
  assert.ok(first.members.every(member => member.base === null && member.slot === null &&
    member.patch.kind === "tokenControl" && member.publicationTemplate.lifecycle.started[0]!.anchor.kind === "transitionTemplate" &&
    member.publicationTemplate.lifecycle.ended[0]!.terminal === "completed"));
  const exhausted = run(selected, before, count * 3 - 1);
  assert.equal(exhausted.result.outcome, CommandOutcome.RolledBack);
  assert.equal(exhausted.result.internalStepBoundExceeded, true);
  assert.deepEqual(exhausted.result.state, before);
  assert.deepEqual([exhausted.selectedInternalSteps, exhausted.selectedInternalBatches, exhausted.selectedInternalPreparations], [[], [], []]);
});

test("mixed wait/control reservations preserve slots and refuse every cross-member token dependency", () => {
  const fork = { ...reservedFork, input: "forkIn" };
  const selected = tokenControlProgram([effect, fork], ["check", "forkIn", "left", "right"]);
  const before = { ...active(), controlTokens: [{ placeId: "check", owner: body(1), multiplicity: 1 },
    { placeId: "forkIn", owner: body(1), multiplicity: 1 }] };
  const certificate = prepareInternalOccurrenceBatch(selected, before);
  assert.ok(certificate);
  assert.deepEqual(certificate.members.map(member => member.slot), [1, null]);
  const applied = applyInternalOccurrenceBatch(selected, before, certificate);
  assert.ok(applied);
  assert.equal(applied.at(-1)!.successor.effectWaits.length, 1);
  assert.deepEqual(applied.at(-1)!.successor.controlTokens.map(token => token.placeId), ["left", "right"]);
  for (const conflicted of [{ ...fork, input: "check" }, { ...fork, outputs: ["check"] }])
    assert.equal(prepareInternalOccurrenceBatch(tokenControlProgram([effect, conflicted], ["check", "forkIn", "left", "right"]), before), null);
  const second = { ...fork, id: "fork2", origin: origin("Fork2"), input: "otherIn" };
  const bothReady = { ...before, controlTokens: [...before.controlTokens, { placeId: "otherIn", owner: body(1), multiplicity: 1 }] };
  assert.equal(prepareInternalOccurrenceBatch(tokenControlProgram([fork, second], ["check", "forkIn", "otherIn", "left", "right"]), bothReady), null);
  const complete = { kind: Op.CompleteParallelMultiInstanceScope, id: "complete", origin: entry.origin, entryOperationId: entry.id } as const;
  const retirement = tokenControlProgram([effect, complete], ["check"]);
  const oneReady = { ...active(), controlTokens: [active().controlTokens[0]!] };
  assert.equal(prepareInternalOccurrenceBatch(retirement, oneReady), null);
});

test("control reservations validate provenance, output arithmetic and collective End headroom before any prefix", () => {
  const selected = tokenControlProgram([reservedFork], ["check", "left", "right"]);
  const before = active();
  const saturated = { ...before, controlTokens: [...before.controlTokens,
    { placeId: "left", owner: body(2), multiplicity: Number.MAX_SAFE_INTEGER }] };
  assert.equal(prepareInternalOccurrenceBatch(selected, saturated), null);
  const exact = { ...before, controlTokens: [...before.controlTokens,
    { placeId: "left", owner: body(2), multiplicity: Number.MAX_SAFE_INTEGER - 1 }] };
  const fitting = prepareInternalOccurrenceBatch(selected, exact);
  assert.ok(fitting);
  assert.equal(applyInternalOccurrenceBatch(selected, exact, fitting)?.at(-1)!.successor.controlTokens
    .find(token => token.placeId === "left" && token.owner.activation === 2)?.multiplicity, Number.MAX_SAFE_INTEGER);
  assert.equal(prepareInternalOccurrenceBatch({ ...selected, controlPlaceScopes: [] }, before), null);
  assert.equal(prepareInternalOccurrenceBatch({ ...selected, controlPlaces: selected.controlPlaces.map(place =>
    ({ ...place, origin: { ...place.origin, elementId: "Alias" } })) }, before), null);
  const ends = tokenControlProgram([{ ...reservedEnd, input: "check" }], ["check"]);
  for (const endOccurrences of [-1, 0.5, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER])
    assert.equal(prepareInternalOccurrenceBatch(ends, { ...before, endOccurrences }), null);
  const exactEnds = { ...before, endOccurrences: Number.MAX_SAFE_INTEGER - 2 };
  const preparedEnds = prepareInternalOccurrenceBatch(ends, exactEnds);
  assert.ok(preparedEnds);
  assert.equal(applyInternalOccurrenceBatch(ends, exactEnds, preparedEnds)?.at(-1)!.successor.endOccurrences, Number.MAX_SAFE_INTEGER);
});

test("control certificate forgery at the final member returns no partial successor", () => {
  const selected = tokenControlProgram([reservedFork], ["check", "left", "right"]);
  const before = active();
  const saved = structuredClone(before);
  const certificate = prepareInternalOccurrenceBatch(selected, before);
  assert.ok(certificate);
  const last = certificate.members[1]!;
  assert.ok(last.patch.kind === "tokenControl");
  for (const invalid of [
    { ...certificate, members: [certificate.members[0]!, { ...last, slot: 1 }] },
    { ...certificate, members: [certificate.members[0]!, { ...last, patch: { ...last.patch, produced: ["missing"] } }] },
    { ...certificate, members: [certificate.members[0]!, { ...last, patch: { ...last.patch, consumed: ["missing"] } }] },
    { ...certificate, members: [certificate.members[0]!, { ...last, patch: { ...last.patch, endIncrement: 1 as const } }] },
  ]) assert.equal(applyInternalOccurrenceBatch(selected, before, invalid), null);
  assert.deepEqual(before, saved);
});

for (const [label, outputs] of [["empty outputs", []], ["duplicate outputs", ["left", "left"]]] as const)
  test(`control reservations refuse Duplicate with ${label}`, () => {
    const selected = tokenControlProgram([{ ...reservedFork, outputs }], ["check", "left", "right"]);
    assert.equal(prepareInternalOccurrenceBatch(selected, active()), null);
  });
