/**
 * Locks the registered default-less Choice schedules against the proposal's separating witnesses without Lean or
 * Temporal: the open work after every committed command, where each journey ends and with which outcome, the host's
 * admission of each Start, and every seeded mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's witness account and its CIB probe, never read from a produced
 * trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionFailureCode, BpmnProcessAdmissionResultKind } from "@bpmn-lean/temporal-testkit";
import { exclusiveChoiceWithoutDefaultPipelineCases, exclusiveChoiceWithoutDefaultStartCases } from
  "./exclusive-choice-without-default-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "exclusive-choice-without-default-";
const cases = [...exclusiveChoiceWithoutDefaultPipelineCases, ...exclusiveChoiceWithoutDefaultStartCases];

/** The open work after each committed command, and the outcome of the command that ends the journey. */
const journeys = new Map<string, Readonly<{ committed: readonly (readonly string[])[]; final: CommandOutcome }>>([
  // XND-ROUTE-01: urgent is declared first, so it wins over the also-true travel route; bank then arms the payment.
  ["urgent-travel", { committed: [["ReviewUrgently#1"], ["ReimburseClaimant#1"], []], final: CommandOutcome.Committed }],
  // XND-ROLLBACK-01: no route holds for catering, so the Start itself rolls back.
  ["catering", { committed: [], final: CommandOutcome.RolledBack }],
  // XND-ROLLBACK-01: no route holds for a medium ticket, so the triage's completion rolls back.
  ["medium-triage", { committed: [["TriageTicket#1"]], final: CommandOutcome.RolledBack }],
]);

test("registers the two hosted schedules and the core-only Start, standards-only, with the host admission each needs", async () => {
  assert.deepEqual(cases.map(({ id }) => id), ["urgent-travel", "medium-triage", "catering"].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(cases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    const admission = assessBpmnProcessAdmission(start, context.semanticProcess);
    assert.equal(admission.kind === BpmnProcessAdmissionResultKind.Rejected ? admission.failure.code : admission.kind,
      context.scenario.id.endsWith("catering") ? BpmnProcessAdmissionFailureCode.StartRolledBack
        : BpmnProcessAdmissionResultKind.Admitted, context.scenario.id);
  }
});

test("each journey opens the work the proposal derives and ends with the outcome it names", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(cases)) {
    const journey = journeys.get(scenario.id.slice(prefix.length))!;
    const result = runScenario(scenario, program);
    assert.deepEqual(result.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: journey.final }, scenario.id);
    journey.committed.forEach((open, position) => {
      const index = 2 + 2 * position;
      const label = `${scenario.id} trace[${String(index)}]`;
      const command = result.trace[index - 1];
      assert.ok(command?.kind === CanonicalObservationKind.Command && command.outcome === CommandOutcome.Committed, label);
      const state = result.trace[index];
      assert.ok(state?.kind === CanonicalObservationKind.State, label);
      assert.deepEqual(openWork(state), open, label);
      assert.equal(state.status, open.length === 0 ? ProcessStatus.Completed : ProcessStatus.Running, label);
    });
    const ended = 1 + 2 * journey.committed.length;
    if (journey.final === CommandOutcome.Committed) {
      assert.equal(result.trace.length, ended, scenario.id);
      continue;
    }
    const command = result.trace[ended];
    assert.ok(command?.kind === CanonicalObservationKind.Command && command.outcome === CommandOutcome.RolledBack, scenario.id);
    // XND-ROLLBACK-01: a rolled-back Start leaves no state; a rolled-back completion republishes the state before it.
    assert.deepEqual(result.trace.slice(ended + 1), journey.committed.length === 0 ? [] : [result.trace[ended - 1]], scenario.id);
  }
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(cases)) {
    const result = runScenario(scenario, program);
    const mutated = mutableClone(result);
    pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
    assert.ok(comparison.kind === ComparisonKind.Disagreement, scenario.id);
    assert.deepEqual(comparison.disagreement, pipelineCase.expectedInjectedDisagreement, scenario.id);
    assert.throws(() => pipelineCase.injectMutation(mutated), /calibration requires/u, scenario.id);
  }
});
