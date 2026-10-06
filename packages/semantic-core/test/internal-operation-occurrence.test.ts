import { program as baseProgram } from "./embedded-subprocess-fixture.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState, ControlStateKind, SemanticOperationKind, SemanticOriginKind } from "@bpmn-lean/semantic-core";
import type { ScopeOccurrenceId } from "@bpmn-lean/semantic-core";
const { internalOperationOccurrences, resolveInternalOperationOccurrence } = await import(
  new URL("../dist/internal-transition-alternative.js", import.meta.url).href,
) as typeof import("../src/internal-transition-alternative.ts");
const first: ScopeOccurrenceId = { processInstanceId: "batch", definitionScopeId: "body", activation: 1 };
const second = { ...first, activation: 2 };
const operation = { kind: SemanticOperationKind.ReachNoneEnd, id: "end", input: "in",
  origin: { kind: SemanticOriginKind.BpmnElement, elementId: "End" } } as const;
const program = { ...baseProgram, operations: [operation], operationScopes: [{ operationId: operation.id, scopeId: "body" }] };
const state = { ...initialState, scopeOccurrences: [first, second].map(id => ({ id, parent: null })) };
const candidate = (owner: ScopeOccurrenceId) => ({ operationId: operation.id, owner });

test("discovery retains the same operation in every exact occurrence independently of storage order", () => {
  assert.deepEqual(internalOperationOccurrences(program, state, operation.id), [candidate(first), candidate(second)]);
  assert.deepEqual(internalOperationOccurrences(program,
    { ...state, scopeOccurrences: [...state.scopeOccurrences].reverse() }, operation.id), [candidate(first), candidate(second)]);
});

test("revalidation never substitutes a surviving sibling for a removed or changed occurrence", () => {
  assert.deepEqual(resolveInternalOperationOccurrence(program, state, candidate(first)), operation);
  for (const changed of [
    { ...state, scopeOccurrences: state.scopeOccurrences.slice(1) },
    { ...state, scopeOccurrences: [{ id: { ...first, activation: 3 }, parent: null }, state.scopeOccurrences[1]!] },
  ]) {
    assert.equal(resolveInternalOperationOccurrence(program, changed, candidate(first)), null);
    assert.deepEqual(resolveInternalOperationOccurrence(program, changed, candidate(second)), operation);
  }
  for (const owner of [{ ...first, processInstanceId: "other" }, { ...first, definitionScopeId: "other" }])
    assert.equal(resolveInternalOperationOccurrence(program, state, candidate(owner)), null);
});

test("ambiguous declarations and duplicate occurrence identities fail closed rather than collapse", () => {
  for (const invalid of [
    { ...program, operations: [operation, operation] },
    { ...program, operationScopes: [...program.operationScopes, ...program.operationScopes] },
    { ...program, operationScopes: [] },
  ]) {
    assert.equal(internalOperationOccurrences(invalid, state, operation.id), null);
    assert.equal(resolveInternalOperationOccurrence(invalid, state, candidate(first)), null);
  }
  assert.equal(internalOperationOccurrences(program,
    { ...state, scopeOccurrences: [...state.scopeOccurrences, state.scopeOccurrences[0]!] }, operation.id), null);
  assert.equal(internalOperationOccurrences(program, state, "missing"), null);
  assert.deepEqual(internalOperationOccurrences(program, { ...state, scopeOccurrences: [] }, operation.id), []);
});

const { applyInternalOperationOccurrence, deriveInternalOccurrenceFrontier } = await import(
  new URL("../dist/internal-transition-preparation.js", import.meta.url).href,
) as typeof import("../src/internal-transition-preparation.ts");
const running = { ...state, control: { kind: ControlStateKind.Running, instanceId: first.processInstanceId },
  controlTokens: [first, second].map(owner => ({ placeId: "in", owner, multiplicity: 1 })) } as const;

test("explicit End dispatch consumes only the selected body and refuses a stale candidate", () => {
  const ended = applyInternalOperationOccurrence(program, running, candidate(first));
  assert.ok(ended);
  assert.deepEqual(ended.controlTokens, [running.controlTokens[1]]);
  assert.equal(ended.endOccurrences, 1);
  assert.equal(applyInternalOperationOccurrence(program, ended, candidate(first)), null);
  assert.equal(applyInternalOperationOccurrence(program, ended, candidate(second))?.endOccurrences, 2);
  assert.deepEqual(running.controlTokens.map(token => token.owner), [first, second]);
});

test("fork and join use exact owned token multiplicity even with the same definition in both bodies", () => {
  const fork = { ...operation, kind: SemanticOperationKind.Duplicate, outputs: ["left", "right"] } as const;
  const forkProgram = { ...program, operations: [fork] };
  const forked = applyInternalOperationOccurrence(forkProgram, running, candidate(second));
  assert.ok(forked);
  assert.deepEqual(forked.controlTokens.filter(token => token.owner.activation === 1), [running.controlTokens[0]]);
  assert.deepEqual(forked.controlTokens.filter(token => token.owner.activation === 2).map(token => token.placeId), ["left", "right"]);
  const join = { kind: SemanticOperationKind.Synchronize, id: operation.id, origin: operation.origin,
    inputs: ["left", "right"], output: "out" } as const;
  const joined = applyInternalOperationOccurrence({ ...program, operations: [join] }, forked, candidate(second));
  assert.ok(joined);
  assert.equal(applyInternalOperationOccurrence({ ...program, operations: [join] }, forked, candidate(first)), null);
  assert.equal(applyInternalOperationOccurrence(forkProgram, { ...running,
    controlTokens: [{ ...running.controlTokens[0]!, multiplicity: 2 }, running.controlTokens[1]!] }, candidate(first)), null);
  assert.equal(applyInternalOperationOccurrence({ ...program, operations: [{ ...join, inputs: ["left", "left"] }] },
    forked, candidate(second)), null);
});

test("the complete control frontier retains both bodies and drops only the consumed candidate", () => {
  const offers = deriveInternalOccurrenceFrontier(program, running);
  assert.ok(offers);
  assert.deepEqual(offers.map(offer => offer.candidate), [candidate(first), candidate(second)]);
  const reversed = deriveInternalOccurrenceFrontier(program, { ...running,
    scopeOccurrences: [...running.scopeOccurrences].reverse(), controlTokens: [...running.controlTokens].reverse() });
  assert.deepEqual(reversed?.map(offer => offer.candidate), offers.map(offer => offer.candidate));
  assert.deepEqual(deriveInternalOccurrenceFrontier(program, offers[0]!.successor)?.map(offer => offer.candidate),
    [candidate(second)]);
});

test("concurrent User Task arming retains exact owners and issues distinct monotonic identities", () => {
  const task = { kind: SemanticOperationKind.AwaitUserTask, id: operation.id, origin: operation.origin,
    input: "in", output: "out", task: { elementId: "Review", name: "Review application" } } as const;
  const tasks = { ...program, operations: [task] };
  const before = { ...running, taskActivations: [{ elementId: "Review", count: 7 }] };
  const offers = deriveInternalOccurrenceFrontier(tasks, before);
  assert.deepEqual(offers?.map(offer => offer.candidate), [candidate(first), candidate(second)]);
  const one = applyInternalOperationOccurrence(tasks, before, candidate(second));
  assert.ok(one);
  assert.deepEqual(one.userTaskWaits.map(wait => [wait.owner, wait.id.activation]), [[second, 8]]);
  assert.equal(applyInternalOperationOccurrence(tasks, one, candidate(second)), null);
  const both = applyInternalOperationOccurrence(tasks, one, candidate(first));
  assert.ok(both);
  assert.deepEqual(both.userTaskWaits.map(wait => [wait.owner, wait.id.activation]), [[second, 8], [first, 9]]);
  assert.deepEqual(both.taskActivations, [{ elementId: "Review", count: 9 }]);
  assert.deepEqual(both.controlTokens, []);
  assert.deepEqual(both.variables, before.variables);
  assert.deepEqual(before.userTaskWaits, []);
});

const { projectOpenUserTasks, projectOpenTimers } = await import(
  new URL("../dist/scenario.js", import.meta.url).href,
) as typeof import("../src/scenario.ts");
const { createTimerWait } = await import(new URL("../dist/semantic-process-wait-runtime.js", import.meta.url).href,
) as typeof import("../src/semantic-process-wait-runtime.ts");

test("public wait projection orders by public identity regardless of internal scope storage", () => {
  const task = { kind: SemanticOperationKind.AwaitUserTask, id: operation.id, origin: operation.origin,
    input: "in", output: "out", task: { elementId: "Review", name: "Review application" } } as const;
  const tasks = { ...program, operations: [task] };
  const one = applyInternalOperationOccurrence(tasks, running, candidate(second));
  assert.ok(one);
  const both = applyInternalOperationOccurrence(tasks, one, candidate(first));
  assert.ok(both);
  assert.deepEqual(projectOpenUserTasks({ ...both, userTaskWaits: [...both.userTaskWaits].reverse() })
    .map(wait => wait.id.activation), [1, 2]);
  const timer = { kind: SemanticOperationKind.AwaitTimer, id: operation.id, origin: operation.origin,
    input: "in", output: "out", timer: { elementId: "Reminder", durationMs: 1000 } } as const;
  const timerOne = createTimerWait(program, timer, running, second);
  assert.ok(timerOne);
  const timerBoth = createTimerWait(program, timer, timerOne, first);
  assert.ok(timerBoth);
  assert.deepEqual(projectOpenTimers({ ...timerBoth, timerWaits: [...timerBoth.timerWaits].reverse() })
    .map(wait => wait.id.activation), [1, 2]);
});

test("incomplete occurrence dispatch refuses a frontier instead of reporting false stability", () => {
  const unsupported = { id: "merge", kind: SemanticOperationKind.MergeExclusive,
    origin: operation.origin, inputs: ["in"], output: "out" } as const;
  assert.equal(deriveInternalOccurrenceFrontier({ ...program, operations: [unsupported] }, running), null);
  assert.equal(deriveInternalOccurrenceFrontier({ ...program, operations: [operation, unsupported] }, running), null);
});

test("exact occurrence alternatives keep every identity component and preserve established alternative order", async () => {
  const { internalOperationOccurrenceAlternative, internalOperationAlternative, internalMergeInputAlternative,
    compareInternalAlternatives, canonicalUniqueInternalAlternatives } = await import(
      new URL("../dist/internal-transition-alternative.js", import.meta.url).href,
    ) as typeof import("../src/internal-transition-alternative.ts");
  const occurrences = [first, second, { ...first, definitionScopeId: "other" }, { ...first, processInstanceId: "other" }]
    .map(owner => internalOperationOccurrenceAlternative(operation.id, owner));
  const ordinary = internalOperationAlternative(operation.id);
  const merge = internalMergeInputAlternative(operation.id, first, "in");
  const ordered = [ordinary, merge, ...occurrences];
  assert.deepEqual(canonicalUniqueInternalAlternatives([...ordered].reverse()), ordered);
  for (let left = 0; left < ordered.length; left += 1) for (let right = 0; right < ordered.length; right += 1)
    assert.equal(Math.sign(compareInternalAlternatives(ordered[left]!, ordered[right]!)), Math.sign(left - right));
  assert.equal(canonicalUniqueInternalAlternatives([occurrences[0]!, occurrences[0]!]), null);
  for (const owner of [{ ...first, activation: 0 }, { ...first, activation: Number.MAX_SAFE_INTEGER + 1 },
    { ...first, activation: 1.5 }, { ...first, processInstanceId: "" }, { ...first, definitionScopeId: "" }])
    assert.equal(canonicalUniqueInternalAlternatives([internalOperationOccurrenceAlternative(operation.id, owner)]), null);
  assert.equal(canonicalUniqueInternalAlternatives([internalOperationOccurrenceAlternative("", first)]), null);
  assert.deepEqual(JSON.parse(JSON.stringify(occurrences[0])), {
    kind: "operationOccurrence", operationId: operation.id, owner: first,
  });
});
