import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import {
  ComparisonKind,
  DifferentialTarget,
  compareTargetResults,
} from "@bpmn-lean/differential";

import {
  activityBoundaryMessagePipelineCases,
} from "./activity-boundary-message-pipeline-cases.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import {
  loadAndCompileCases,
  runCoreTargets,
  runLeanTargets,
} from "./semantic-differential-targets.ts";

test("runs both Activity boundary Message winners and preserves stale refusals", async () => {
  const contexts = await loadAndCompileCases(
    activityBoundaryMessagePipelineCases,
  );
  const results = runCoreTargets(contexts).results;

  assert.equal(contexts.length, 2);
  for (const context of contexts) {
    const result = results.get(context.scenario.id);
    assert.ok(result !== undefined);
    const winnerState = result.trace[4];
    const staleCommand = result.trace[5];
    const stableState = result.trace[6];
    const finalState = result.trace[8];
    assert.equal(winnerState?.kind, CanonicalObservationKind.State);
    assert.deepEqual(staleCommand, {
      kind: CanonicalObservationKind.Command,
      commandId: context.scenario.stimuli[2]?.commandId,
      outcome: CommandOutcome.Rejected,
    });
    assert.deepEqual(stableState, winnerState);
    assert.equal(finalState?.kind, CanonicalObservationKind.State);
    if (finalState?.kind === CanonicalObservationKind.State) {
      assert.equal(finalState.status, ProcessStatus.Completed);
    }

    const mutated = mutableClone(result);
    context.pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults(
      { target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }],
    );
    assert.equal(comparison.kind, ComparisonKind.Disagreement);
    if (comparison.kind === ComparisonKind.Disagreement) {
      assert.deepEqual(
        comparison.disagreement,
        context.pipelineCase.expectedInjectedDisagreement,
      );
    }
  }
});

test("compares both Activity boundary Message schedules between Lean and the core", async () => {
  const contexts = await loadAndCompileCases(
    activityBoundaryMessagePipelineCases,
  );
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "bpmn-activity-boundary-message-lean-core-"),
  );
  try {
    const [lean, core] = await Promise.all([
      runLeanTargets(
        contexts,
        path.join(temporaryDirectory, "definitions.jsonl"),
      ),
      Promise.resolve(runCoreTargets(contexts)),
    ]);
    for (const { scenario } of contexts) {
      const leanResult = lean.results.get(scenario.id);
      const coreResult = core.results.get(scenario.id);
      assert.ok(leanResult !== undefined);
      assert.ok(coreResult !== undefined);
      const comparison = compareTargetResults(
        { target: DifferentialTarget.Lean, result: leanResult },
        [{ target: DifferentialTarget.SemanticCore, result: coreResult }],
      );
      assert.equal(
        comparison.kind,
        ComparisonKind.Agreement,
        JSON.stringify(comparison),
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
