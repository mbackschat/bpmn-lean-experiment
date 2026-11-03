/**
 * XND-ROLLBACK-01 for a Start: Lean and the semantic core agree that the catering expense's Start rolls back and leaves
 * no state. No hosted run can observe this, because the client refuses the Start before any Workflow exists
 * (XND-HOST-01), so this agreement stands where a pipeline case would; the client's refusal has its own test.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CanonicalObservationKind, CommandOutcome, ScenarioOutcomeKind } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { exclusiveChoiceWithoutDefaultStartCases } from "./exclusive-choice-without-default-pipeline-cases.ts";
import { loadAndCompileCases, runCoreTargets, runLeanTargets } from "./semantic-differential-targets.ts";

test("Lean and the semantic core agree that a Start matching no route rolls back with no state", async () => {
  const contexts = await loadAndCompileCases(exclusiveChoiceWithoutDefaultStartCases);
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-defaultless-choice-lean-core-"));
  try {
    const lean = await runLeanTargets(contexts, path.join(directory, "definitions.jsonl"));
    const core = runCoreTargets(contexts);
    for (const { scenario } of contexts) {
      const leanResult = lean.results.get(scenario.id);
      const coreResult = core.results.get(scenario.id);
      assert.ok(leanResult !== undefined && coreResult !== undefined, scenario.id);
      assert.deepEqual(coreResult.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.RolledBack });
      assert.deepEqual(coreResult.trace.map(({ kind }) => kind),
        [CanonicalObservationKind.Deployment, CanonicalObservationKind.Command]);
      assert.equal(compareTargetResults({ target: DifferentialTarget.Lean, result: leanResult },
        [{ target: DifferentialTarget.SemanticCore, result: coreResult }]).kind, ComparisonKind.Agreement, scenario.id);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
