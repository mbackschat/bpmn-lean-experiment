/**
 * Locks the registered audit and intake schedules against the concurrent embedded activations capsule's separating
 * witnesses without Lean or Temporal: the open User Tasks, named by element and activation, and Process status after
 * every command (CEA-MERGE-01, CEA-OCCUR-01, CEA-ISOLATE-01, CEA-QUIESCE-01), a stale completion that leaves the
 * committed state unchanged (CEA-REFUSE-01), and a seeded mutation per schedule that must move exactly the observation it
 * names.
 *
 * Expected open sets are written here from the capsule's account of each journey, never read from a produced trace.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionResultKind } from "@bpmn-lean/temporal-testkit";
import { concurrentEmbeddedActivationsPipelineCases } from "./concurrent-embedded-activations-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "concurrent-activations-";

type Journey = Readonly<{
  model: string;
  /** The open `Element#activation` names at trace index 2 + 2 * i, which follows the i-th command; the last set is empty. */
  open: ReadonlyArray<readonly string[]>;
  /** Zero-based positions among the commands, Start included, that the Process rejects. */
  rejected: ReadonlyArray<number>;
}>;

const journeys = new Map<string, Journey>([
  ["audit-interleaved-and-stale", {
    model: "audit-remediation",
    open: [
      ["ReviewControls#1", "ReviewPayments#1"],
      ["FixFinding#1", "ReviewPayments#1"],
      ["FixFinding#1", "FixFinding#2"],
      ["FixFinding#1", "VerifyFix#1"],
      // The second Remediation has completed and reported nothing yet; the first one's Fix finding is untouched.
      ["FixFinding#1", "ReportFinding#1"],
      // Fix finding activation 2 has already completed, so repeating it is refused and leaves this set untouched.
      ["FixFinding#1", "ReportFinding#1"],
      ["FixFinding#1"],
      ["VerifyFix#2"],
      ["ReportFinding#2"],
      ["CloseAudit#1"],
      [],
    ],
    rejected: [5],
  }],
  ["audit-reversed", {
    model: "audit-remediation",
    open: [
      ["ReviewControls#1", "ReviewPayments#1"],
      ["FixFinding#1", "ReviewControls#1"],
      ["FixFinding#1", "FixFinding#2"],
      ["FixFinding#2", "VerifyFix#1"],
      ["VerifyFix#1", "VerifyFix#2"],
      ["ReportFinding#1", "VerifyFix#2"],
      ["ReportFinding#1", "ReportFinding#2"],
      ["ReportFinding#1"],
      ["CloseAudit#1"],
      [],
    ],
    rejected: [],
  }],
  ["intake-reverse-assessments", {
    model: "credit-intake",
    open: [
      ["OpenApplication#1"],
      ["CheckAddress#1", "CheckIdentity#1", "CheckIncome#1"],
      ["CheckAddress#1", "CheckIncome#1", "ScoreApplicant#1"],
      ["CheckIncome#1", "ScoreApplicant#1", "ScoreApplicant#2"],
      ["ScoreApplicant#1", "ScoreApplicant#2", "ScoreApplicant#3"],
      ["ScoreApplicant#1", "ScoreApplicant#2"],
      // Two Assess activations have completed; Intake still owns the first, so Decide is absent.
      ["ScoreApplicant#1"],
      ["Decide#1"],
      [],
    ],
    rejected: [],
  }],
]);

const openNames = (state: { openUserTasks: ReadonlyArray<{ id: { elementId: string; activation: number } }> }) =>
  state.openUserTasks.map(({ id }) => `${id.elementId.slice("UserTask_".length)}#${id.activation}`).toSorted();

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

test("registers exactly the three schedules over the two retained models, standards-only", async () => {
  assert.deepEqual(concurrentEmbeddedActivationsPipelineCases.map(({ id }) => id), [...journeys.keys()].map((name) => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(concurrentEmbeddedActivationsPipelineCases)) {
    const name = context.scenario.id.slice(prefix.length);
    const bytes = await readFile(new URL(`../../../${context.pipelineCase.bpmnRelativePath}`, import.meta.url));
    assert.equal(context.scenario.bpmn.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.ok(context.pipelineCase.bpmnRelativePath.endsWith(`/${journeys.get(name)?.model}.bpmn`), context.scenario.id);
    assert.equal(context.scenario.profile, SemanticProfileId.EmbeddedSubProcessCompletion);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
  }
});

test("public admission accepts each Start", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(concurrentEmbeddedActivationsPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open User Tasks and Process status the capsule derives after every command", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(concurrentEmbeddedActivationsPipelineCases)) {
    const journey = journeys.get(scenario.id.slice(prefix.length))!;
    const result = runScenario(scenario, program);
    assert.deepEqual(result.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Committed }, scenario.id);
    assert.equal(result.trace.length, 1 + 2 * journey.open.length, `${scenario.id} ends at the completed state`);
    journey.open.forEach((names, position) => {
      const index = 2 + 2 * position;
      const state = stateAt(result.trace, index);
      assert.deepEqual(openNames(state), names, `${scenario.id} trace[${index}]`);
      assert.equal(state.status, position === journey.open.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running, `${scenario.id} trace[${index}]`);
      const command = result.trace[index - 1];
      assert.ok(command?.kind === CanonicalObservationKind.Command, `${scenario.id} trace[${index - 1}] must be a command`);
      assert.equal(command.outcome, journey.rejected.includes(position) ? CommandOutcome.Rejected : CommandOutcome.Committed, `${scenario.id} ${command.commandId}`);
    });
  }
});

test("a refused completion leaves the predecessor state unchanged", async () => {
  const contexts = await loadAndCompileCases(concurrentEmbeddedActivationsPipelineCases);
  const refusals = contexts.flatMap(({ scenario, semanticProcess: program }) =>
    (journeys.get(scenario.id.slice(prefix.length))?.rejected ?? []).map((position) => ({ scenario, program, index: 1 + 2 * position })));
  assert.equal(refusals.length, 1, "the interleaved audit schedule refuses one stale completion");
  for (const { scenario, program, index } of refusals) {
    const trace = runScenario(scenario, program).trace;
    assert.deepEqual(stateAt(trace, index + 1), stateAt(trace, index - 1), `${scenario.id} trace[${index}] must not move any observation`);
  }
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(concurrentEmbeddedActivationsPipelineCases)) {
    const result = runScenario(scenario, program);
    const mutated = mutableClone(result);
    pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
    assert.equal(comparison.kind, ComparisonKind.Disagreement, scenario.id);
    if (comparison.kind !== ComparisonKind.Disagreement) assert.fail("Seeded mutation escaped comparison");
    assert.deepEqual(comparison.disagreement, pipelineCase.expectedInjectedDisagreement, scenario.id);
    assert.throws(() => pipelineCase.injectMutation(mutated), /calibration requires/u, scenario.id);
  }
});
