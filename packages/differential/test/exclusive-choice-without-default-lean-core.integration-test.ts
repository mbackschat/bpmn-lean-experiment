/**
 * XND-ROLLBACK-01 on Lean: Lean and the semantic core agree that the catering expense's Start rolls back and leaves no
 * state, and that the cash payout's review completion rolls back and republishes the state before it. No hosted run
 * can observe the Start, because the client refuses it before any Workflow exists (XND-HOST-01), so this agreement
 * stands where a pipeline case would; the client's refusal has its own test.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CanonicalObservationKind, CommandOutcome, ScenarioOutcomeKind } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { exclusiveChoiceWithoutDefaultLeanCoreCases } from "./exclusive-choice-without-default-pipeline-cases.ts";
import { loadAndCompileCases, runCoreTargets, runLeanTargets } from "./semantic-differential-targets.ts";

test("Lean and the semantic core agree on a Start and a completion that match no route", async () => {
  const contexts = await loadAndCompileCases(exclusiveChoiceWithoutDefaultLeanCoreCases);
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-defaultless-choice-lean-core-"));
  try {
    const lean = await runLeanTargets(contexts, path.join(directory, "definitions.jsonl"));
    const core = runCoreTargets(contexts);
    for (const { scenario } of contexts) {
      const leanResult = lean.results.get(scenario.id);
      const coreResult = core.results.get(scenario.id);
      assert.ok(leanResult !== undefined && coreResult !== undefined, scenario.id);
      assert.deepEqual(coreResult.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.RolledBack });
      assert.deepEqual(coreResult.trace.map(({ kind }) => kind), scenario.stimuli.length === 1
        ? [CanonicalObservationKind.Deployment, CanonicalObservationKind.Command]
        : [CanonicalObservationKind.Deployment, CanonicalObservationKind.Command, CanonicalObservationKind.State,
          CanonicalObservationKind.Command, CanonicalObservationKind.State]);
      assert.equal(compareTargetResults({ target: DifferentialTarget.Lean, result: leanResult },
        [{ target: DifferentialTarget.SemanticCore, result: coreResult }]).kind, ComparisonKind.Agreement, scenario.id);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
