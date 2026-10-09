import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandOutcome, SemanticOperationKind, SemanticTransitionKind, applyStimulusWithTrace,
  initialState, isWellFormedSemanticProcessProgram, replayCommittedTransitions } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { parallelCommandInputs } from "./parallel-scope-command-fixture.ts";

const { replayInternalTransitionRecord } = await import(new URL("../../semantic-core/dist/semantic-transition-trace.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-transition-trace.ts");
const { parallelScopeProgramStartCapacity } = await import(new URL("../../semantic-core/dist/parallel-scope-program-capacity.js", import.meta.url).href
) as typeof import("../../semantic-core/src/parallel-scope-program-capacity.ts");
const { sameScopeOccurrence } = await import(new URL("../../semantic-core/dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-process-state.ts");

/** PMIS-ENTER-01 retains each issued child's own continuation until external ingress. */
function assertChildBlockers(state: RuntimeState, children: readonly ScopeOccurrenceId[]): void {
  for (const child of children) {
    assert.ok(state.scopeOccurrences.some(scope => sameScopeOccurrence(scope.id, child)), "issued child remains live");
    assert.ok(state.controlTokens.some(token => sameScopeOccurrence(token.owner, child) && token.multiplicity > 0) ||
      [...state.userTaskWaits, ...state.effectWaits].some(wait => sameScopeOccurrence(wait.owner, child)),
    "each issued child retains its own token or Task wait");
  }
}

for (const { count, program: sourceProgram, start } of (await parallelCommandInputs({ bodyShape: "separate-ends" })).filter(input => input.count <= 2)) {
  test(`private parallel initial drain retains ${count} child blockers across a direct Fork-to-End branch`, () => {
    const skipped = sourceProgram.operations.find(operation => operation.origin.elementId === "Branch0");
    const end = sourceProgram.operations.find(operation => operation.origin.elementId === "End0");
    const entry = sourceProgram.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    assert.ok(skipped?.kind === SemanticOperationKind.AwaitUserTask);
    assert.ok(end?.kind === SemanticOperationKind.ReachNoneEnd);
    assert.ok(entry?.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    // This admitted IL perturbation separates a branch ending from whole-child quiescence; it makes no exact-source claim.
    const program: SemanticProcessProgram = { ...sourceProgram,
      operations: sourceProgram.operations.filter(operation => operation.id !== skipped.id)
        .map(operation => operation.id === end.id ? { ...end, input: skipped.input } : operation),
      operationScopes: sourceProgram.operationScopes.filter(binding => binding.operationId !== skipped.id),
      controlPlaces: sourceProgram.controlPlaces.filter(place => place.id !== skipped.output),
      controlPlaceScopes: sourceProgram.controlPlaceScopes.filter(binding => binding.controlPlaceId !== skipped.output),
    };
    assert.ok(isWellFormedSemanticProcessProgram(program));
    assert.ok(parallelScopeProgramStartCapacity(program, start.initialVariables), "perturbation passes actual private admission");
    const traced = applyStimulusWithTrace(program, initialState, start);
    assert.equal(traced.result.outcome, CommandOutcome.Committed);
    assert.equal(traced.result.internalStepBoundExceeded, false);
    assert.deepEqual(replayCommittedTransitions(program, initialState, traced.committedTransitions), traced.result.state);
    let state = initialState, entered = false, endedBranches = 0;
    let children: readonly ScopeOccurrenceId[] = [];
    for (const record of traced.committedTransitions) {
      const next = record.transition.kind === SemanticTransitionKind.ExternalStimulus
        ? replayCommittedTransitions(program, state, [record]) : replayInternalTransitionRecord(program, state, record);
      assert.ok(next, "actual initial command prefix replays");
      state = next;
      if (record.transition.kind === SemanticTransitionKind.InternalOperation) {
        assert.notEqual(record.transition.operationKind, SemanticOperationKind.CompleteParallelMultiInstanceScope);
        if (record.transition.operationId === entry.id) {
          assert.equal(entered, false);
          entered = true;
          children = state.scopeOccurrences.filter(scope => scope.id.definitionScopeId === entry.childScopeId).map(scope => scope.id);
          assert.equal(children.length, count);
        }
        if (record.transition.operationId === end.id) endedBranches++;
      }
      if (entered) assertChildBlockers(state, children);
    }
    assert.equal(entered, true);
    assert.equal(endedBranches, count, "every direct-End branch actually fires during initial drain");
    assert.deepEqual(state, traced.result.state);
    if (count > 0) {
      assert.equal(state.controlTokens.length, 0, "initial drain reaches Task waits");
      const child = children[0]!;
      assert.throws(() => assertChildBlockers({ ...state,
        userTaskWaits: state.userTaskWaits.filter(wait => !sameScopeOccurrence(wait.owner, child)),
        effectWaits: state.effectWaits.filter(wait => !sameScopeOccurrence(wait.owner, child)),
      }, children), /each issued child retains its own/);
    }
  });
}
