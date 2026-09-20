import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, applyInternalOperationStep, applyStimulusWithTrace,
  CommandOutcome, compareCanonicalStrings, initialState, isWellFormedSemanticProcessProgram,
  runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { RequiredProgramShape } from "../src/semantic-program-profile-shape.ts";
import type { SemanticGraphPolicy } from "../src/semantic-process-graph-policy.ts";
import { program as baseProgram, startStimulus } from "./embedded-subprocess-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

const { SemanticProfileId } = await import(
  new URL("../dist/semantic-profile-catalog.js", import.meta.url).href
) as typeof import("../src/semantic-profile-catalog.ts");
const { requiredProgramShape } = await import(
  new URL("../dist/semantic-program-profile-shape.js", import.meta.url).href
) as typeof import("../src/semantic-program-profile-shape.ts");
const { semanticGraphPolicyForProfile, SemanticGraphPolicyKind } = await import(
  new URL("../dist/semantic-process-graph-policy.js", import.meta.url).href
) as typeof import("../src/semantic-process-graph-policy.ts");
const { admitProcessStart } = await import(
  new URL("../dist/semantic-process-triggered-start.js", import.meta.url).href
) as typeof import("../src/semantic-process-triggered-start.ts");
const { prepareInternalTransitionBatch, deriveInternalTransitionPreparation, applyPreparedInternalTransition } = await import(
  new URL("../dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../src/internal-transition-batch.ts");
const { deriveInternalRegionalPreparation, applyPreparedInternalRegionalTransition } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { internalTransitionStateFootprintsAreIndependent } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint.ts");

/** E1 checks admission premises only; graph/closure semantics still need their own argument. */
function retainsRegionalExclusionPremises(shape: RequiredProgramShape | undefined,
  policy: SemanticGraphPolicy | undefined): boolean {
  if (shape === undefined || policy === undefined) return false;
  const count = (kind: Kind) => shape.operationKinds.filter((candidate) => candidate === kind).length;
  if (shape.definitionScopeCount === 1) {
    return count(Kind.CompleteScope) === 1 && [Kind.ReturnProcess, Kind.EnterScope,
      Kind.EnterBoundedScope, Kind.InvokeProcess, Kind.ThrowError, Kind.TerminateScope]
      .every((kind) => count(kind) === 0);
  }
  if (shape.definitionScopeCount !== 2 || policy.kind !== SemanticGraphPolicyKind.Acyclic ||
    count(Kind.Initiate) !== 1) return false;
  const remainingKindsAre = (kinds: readonly Kind[]) => shape.operationKinds.every((kind) =>
    kind === Kind.Initiate || kind === Kind.AwaitUserTask || kind === Kind.ReachNoneEnd || kinds.includes(kind));
  if (count(Kind.InvokeProcess) === 1) {
    return count(Kind.ReturnProcess) === 1 && count(Kind.CompleteScope) === 1 &&
      remainingKindsAre([Kind.InvokeProcess, Kind.ReturnProcess, Kind.CompleteScope]);
  }
  if (count(Kind.CompleteScope) !== 2) return false;
  if (count(Kind.EnterBoundedScope) === 1) {
    return remainingKindsAre([Kind.EnterBoundedScope, Kind.CompleteScope]);
  }
  return count(Kind.EnterScope) === 1 && count(Kind.Duplicate) === 1 &&
    count(Kind.ThrowError) + count(Kind.TerminateScope) <= 1 &&
    count(Kind.ReachNoneEnd) + count(Kind.TerminateScope) === 3 &&
    remainingKindsAre([Kind.EnterScope, Kind.Duplicate, Kind.CompleteScope, Kind.ThrowError, Kind.TerminateScope]);
}

test("every registered profile retains the structural premises of the regional exclusion investigation", () => {
  for (const profile of Object.values(SemanticProfileId)) {
    assert.equal(retainsRegionalExclusionPremises(requiredProgramShape(profile),
      semanticGraphPolicyForProfile(profile)), true, profile);
  }
});

test("an extra fork and end invalidate the premises even under the same registered profile identifier", () => {
  const shape = requiredProgramShape(SemanticProfileId.TerminateEnd)!;
  const policy = semanticGraphPolicyForProfile(SemanticProfileId.TerminateEnd);
  assert.equal(retainsRegionalExclusionPremises({ ...shape, operationKinds: [...shape.operationKinds,
    Kind.Duplicate, Kind.ReachNoneEnd] }, policy), false);
  assert.equal(retainsRegionalExclusionPremises({ ...shape, definitionScopeCount: 3 }, policy), false);
  assert.equal(retainsRegionalExclusionPremises(shape, semanticGraphPolicyForProfile(SemanticProfileId.UserTaskCycle)), false);
  assert.equal(retainsRegionalExclusionPremises(undefined, policy), false);
});

function broadenedTerminateProgram(): SemanticProcessProgram {
  const [root, child] = baseProgram.definitionScopes;
  const place = (name: string) => `place:${name}`;
  const operations: SemanticOperation[] = [
    { ...operationBase("Start"), kind: Kind.Initiate, output: place("Start") },
    { ...operationBase("Fork0"), kind: Kind.Duplicate, input: place("Start"),
      outputs: [place("Fork1"), place("Scope")] },
    { ...operationBase("Fork1"), kind: Kind.Duplicate, input: place("Fork1"),
      outputs: [place("TaskA"), place("TaskB")] },
    { ...operationBase(child.originElementId), kind: Kind.EnterScope, input: place("Scope"),
      childEntry: place("Terminate"), childScopeId: child.id },
    { ...operationBase("Terminate"), kind: Kind.TerminateScope, input: place("Terminate"), scopeId: child.id },
    { ...operationBase("CompleteChild"), origin: operationBase(child.originElementId).origin,
      kind: Kind.CompleteScope, scopeId: child.id, parentOutput: place("TaskC") },
    { ...operationBase("CompleteRoot"), origin: operationBase(root.originElementId).origin,
      kind: Kind.CompleteScope, scopeId: root.id, parentOutput: null },
    ...["A", "B", "C"].flatMap((suffix): SemanticOperation[] => [
      { ...operationBase(`Task${suffix}`), kind: Kind.AwaitUserTask,
        input: place(`Task${suffix}`), output: place(`End${suffix}`),
        task: { elementId: `Task${suffix}`, name: `Task ${suffix}` } },
      { ...operationBase(`End${suffix}`), kind: Kind.ReachNoneEnd, input: place(`End${suffix}`) },
    ]),
  ];
  operations.sort((a, b) => compareCanonicalStrings(a.id, b.id));
  const controlPlaces = ["Start", "Fork1", "Scope", "Terminate", "TaskA", "TaskB", "TaskC", "EndA", "EndB", "EndC"]
    .map(controlPlace).sort((a, b) => compareCanonicalStrings(a.id, b.id));
  return { ...baseProgram, identity: { ...baseProgram.identity, semanticProfile: SemanticProfileId.TerminateEnd },
    operations, controlPlaces,
    operationScopes: operations.map((operation) => ({ operationId: operation.id,
      scopeId: operation.kind === Kind.TerminateScope || operation.id === "operation:CompleteChild" ? child.id : root.id })),
    controlPlaceScopes: controlPlaces.map(({ id }) => ({ controlPlaceId: id,
      scopeId: id === place("Terminate") ? child.id : root.id })),
  };
}

test("broadening the admitted fork multiset exposes an independent regional frontier without delaying an earlier operation", () => {
  const program = broadenedTerminateProgram();
  const start = startStimulus();
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(supportsSemanticProcessExecution(start, program), false,
    "the registered profile rejects this broader graph before production execution");
  assert.deepEqual(program.operations.map(({ kind }) => kind).sort(compareCanonicalStrings),
    [...requiredProgramShape(SemanticProfileId.TerminateEnd)!.operationKinds,
      Kind.Duplicate, Kind.ReachNoneEnd].sort(compareCanonicalStrings));
  assert.equal(retainsRegionalExclusionPremises({ definitionScopeCount: program.definitionScopes.length,
    operationKinds: program.operations.map(({ kind }) => kind) },
  semanticGraphPolicyForProfile(program.identity.semanticProfile)), false);
  // Private start deliberately bypasses execution admission; this is a reopen witness, not a public model.
  const admitted = admitProcessStart(program, initialState, start);
  assert.ok(admitted !== null);
  let state = admitted;
  const enabled = (current: RuntimeState) => program.operations.flatMap((operation) => {
    const step = applyInternalOperationStep(program, operation, current);
    return step === null ? [] : [step];
  });
  for (const expected of [["operation:Start"], ["operation:Fork0"],
    ["operation:Fork1", "operation:SubProcess_Work"]]) {
    assert.deepEqual(runtimeStateDefects(program, start.instanceId, state), []);
    const frontier = enabled(state);
    assert.deepEqual(frontier.map(({ operation }) => operation.id), expected);
    if (frontier.length === 1) state = frontier[0]!.successor;
    else {
      const prepared = prepareInternalTransitionBatch(program, state, frontier);
      assert.ok(prepared !== null);
      for (const member of prepared) {
        const next = applyPreparedInternalTransition(program, state, member);
        assert.ok(next !== null);
        state = next;
      }
    }
  }
  assert.deepEqual(runtimeStateDefects(program, start.instanceId, state), []);
  const frontier = enabled(state);
  assert.deepEqual(frontier.map(({ operation }) => operation.id),
    ["operation:TaskA", "operation:TaskB", "operation:Terminate"]);
  const terminate = frontier.find(({ operation }) => operation.kind === Kind.TerminateScope)!;
  const terminationOperation = terminate.operation;
  assert.ok(terminationOperation.kind === Kind.TerminateScope);
  const regional = deriveInternalRegionalPreparation(program, state, terminationOperation);
  assert.ok(regional !== null);
  const ordinary = frontier.filter((member) => member !== terminate).map((member) => {
    const prepared = deriveInternalTransitionPreparation(program, state, member);
    assert.ok(prepared !== null);
    assert.equal(internalTransitionStateFootprintsAreIndependent(regional.footprint, prepared.footprint), true);
    return prepared;
  });
  assert.equal(internalTransitionStateFootprintsAreIndependent(ordinary[0]!.footprint, ordinary[1]!.footprint), true);
  assert.equal(prepareInternalTransitionBatch(program, state, frontier), null);
  const [first, second] = ordinary;
  assert.ok(first !== undefined && second !== undefined);
  let final: RuntimeState | undefined;
  for (const selected of [[regional, first, second], [regional, second, first],
    [first, regional, second], [first, second, regional],
    [second, regional, first], [second, first, regional]]) {
    let current = state;
    for (const member of selected) {
      if ("selection" in member) {
        assert.deepEqual(deriveInternalRegionalPreparation(program, current, terminationOperation), regional);
        const next = applyPreparedInternalRegionalTransition(program, current, member);
        assert.ok(next !== null);
        current = next;
      } else {
        assert.deepEqual(deriveInternalTransitionPreparation(program, current, member), member);
        const next = applyPreparedInternalTransition(program, current, member);
        assert.ok(next !== null);
        current = next;
      }
      assert.deepEqual(runtimeStateDefects(program, start.instanceId, current), []);
    }
    if (final === undefined) final = current;
    else assert.deepEqual(current, final);
  }
  const result = applyStimulusWithTrace(program, initialState, start);
  assert.equal(result.result.outcome, CommandOutcome.RolledBack);
  assert.equal(result.result.ambiguousInternalChoice, true);
  assert.deepEqual(result.result.state, initialState);
  assert.deepEqual(result.committedTransitions, []);
  assert.deepEqual(result.flowNodeOccurrenceLifecycles, []);
});
