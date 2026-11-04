/**
 * Locks the registered Inclusive region schedules against the Inclusive regions proposal's separating witnesses without
 * Lean or Temporal: the open work and Process variables after every command, host admission, and every named seeded
 * mutation, each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's witness-model account, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  VariableValueKind, runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { inclusiveGatewayRegionsPipelineCases } from "./inclusive-gateway-regions-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "inclusive-gateway-regions-";
const text = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });

/** One step per stimulus: the open work and the Process variables after it. */
type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[] }>;

/** The account journey: the assessment's output mappings return its three ratings to the Process scope. */
function account(application: string, channel: string, residency: string, riskRating: string,
  afterAssessment: readonly (readonly string[])[], identityChecked: number | null): readonly Step[] {
  const assessed = [text("application", application), text("channel", channel), text("residency", residency),
    text("riskRating", riskRating)];
  const checked = [assessed[0]!, assessed[1]!, text("identityCheck", "passed"), assessed[2]!, assessed[3]!];
  return [
    { open: ["AssessApplicantTask#1"], variables: [assessed[0]!] },
    ...afterAssessment.map((open, position) => ({
      open,
      variables: identityChecked !== null && position >= identityChecked ? checked : assessed,
    })),
  ];
}

/** The booking journey: the quote's output mapping adds `quote` beside the request's three variables. */
function booking(event: string, extras: string, afterQuote: readonly (readonly string[])[]): readonly Step[] {
  const requested = [text("catering", extras), text("event", event), text("technology", extras)];
  const quoted = [requested[0]!, requested[1]!, text("quote", "Q-42"), requested[2]!];
  return [{ open: ["QuoteEvent#1"], variables: requested }, ...afterQuote.map(open => ({ open, variables: quoted }))];
}

const allChecks = ["CollectTaxResidencyForm#1", "VerifyIdentityDocument#1", "VerifySourceOfFunds#1"];
const allExtras = ["BookTechnician#1", "BookVenue#1", "ConfirmAttendeeList#1", "OrderCatering#1", "RentProjector#1"];

const journeys = new Map<string, readonly Step[]>([
  // IGR-SELECT-01: every true condition is taken and the default is not; IGR-JOIN-01: the join waits for all three.
  ["account-all-checks-funds-last", account("ACC-1", "online", "foreign", "high", [allChecks,
    ["CollectTaxResidencyForm#1", "VerifySourceOfFunds#1"], ["VerifySourceOfFunds#1"], ["OpenAccount#1"], []], 1)],
  ["account-all-checks-identity-last", account("ACC-2", "online", "foreign", "high", [allChecks,
    ["CollectTaxResidencyForm#1", "VerifyIdentityDocument#1"], ["VerifyIdentityDocument#1"], ["OpenAccount#1"], []], 3)],
  // IGR-JOIN-01: the join waits for the one selected input only.
  ["account-residency-only", account("ACC-3", "branch", "foreign", "low",
    [["CollectTaxResidencyForm#1"], ["OpenAccount#1"], []], null)],
  // IGR-SELECT-01: no condition holds, so the default alone is taken.
  ["account-standard-only", account("ACC-4", "branch", "domestic", "low",
    [["StandardVerification#1"], ["OpenAccount#1"], []], null)],
  ["account-risk-and-online", account("ACC-5", "online", "domestic", "high",
    [["VerifyIdentityDocument#1", "VerifySourceOfFunds#1"], ["VerifySourceOfFunds#1"], ["OpenAccount#1"], []], 1)],
  // IGR-ADMIT-01's composition: the Inclusive region inside a Parallel branch, with a nested Parallel fork in one of its
  // branches.
  ["booking-extras-venue-first", booking("Summer party", "yes", [allExtras,
    ["BookTechnician#1", "ConfirmAttendeeList#1", "OrderCatering#1", "RentProjector#1"],
    ["BookTechnician#1", "ConfirmAttendeeList#1", "RentProjector#1"], ["BookTechnician#1", "ConfirmAttendeeList#1"],
    ["ConfirmAttendeeList#1"], ["SendConfirmation#1"], []])],
  ["booking-extras-venue-last", booking("Board dinner", "yes", [allExtras,
    ["BookTechnician#1", "BookVenue#1", "ConfirmAttendeeList#1", "RentProjector#1"],
    ["BookTechnician#1", "BookVenue#1", "ConfirmAttendeeList#1"], ["BookVenue#1", "ConfirmAttendeeList#1"],
    ["BookVenue#1"], ["SendConfirmation#1"], []])],
  // CIB-INT-0005: the unconditioned flow is always taken, so the attendee list runs although no extra is ordered.
  ["booking-no-extras", booking("Team offsite", "no", [["BookVenue#1", "ConfirmAttendeeList#1"], ["BookVenue#1"],
    ["SendConfirmation#1"], []])],
]);

test("registers exactly the eight Inclusive region schedules, standards-only and host-admitted", async () => {
  assert.deepEqual(inclusiveGatewayRegionsPipelineCases.map(({ id }) => id), [...journeys.keys()].map(name => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(inclusiveGatewayRegionsPipelineCases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(inclusiveGatewayRegionsPipelineCases)) {
    const steps = journeys.get(scenario.id.slice(prefix.length))!;
    const result = runScenario(scenario, program);
    assert.deepEqual(result.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Committed }, scenario.id);
    assert.equal(result.trace.length, 1 + 2 * steps.length, `${scenario.id} ends at the completed state`);
    steps.forEach((step, position) => {
      const index = 2 + 2 * position;
      const label = `${scenario.id} trace[${index}]`;
      const command = result.trace[index - 1];
      assert.ok(command?.kind === CanonicalObservationKind.Command, `${label} follows a command`);
      assert.equal(command.outcome, CommandOutcome.Committed, label);
      const state = result.trace[index];
      assert.ok(state?.kind === CanonicalObservationKind.State, `${label} must be a state`);
      assert.deepEqual(openWork(state), step.open, label);
      assert.deepEqual(state.variables, step.variables, label);
      assert.equal(state.status, position === steps.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running, label);
    });
  }
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(inclusiveGatewayRegionsPipelineCases)) {
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
