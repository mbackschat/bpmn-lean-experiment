/**
 * Locks the registered order fulfilment and loan assessment schedules against the concurrent structured scope data
 * specification's separating witnesses without Lean or Temporal: the open work after every command, the Process variables
 * each branch output and return publishes (CSSD-VALUE-01, CSSD-REUSE-01), the open effect snapshot a sibling write
 * leaves unchanged (CSSD-SNAPSHOT-01), the refused root-List patch (CSSD-REFUSE-01), and every named seeded mutation,
 * each of which must move exactly the observation it names.
 *
 * Expected values are written here from the proposal's separating-witness table, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  VariableValueKind, concurrentStructuredScopeDataProgram, runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { BusinessValue, CanonicalObservation, VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { concurrentStructuredScopeDataPipelineCases } from "./concurrent-structured-scope-data-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "concurrent-structured-scope-data-";
const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
const nothing: BusinessValue = { kind: VariableValueKind.Null };
const decimal = (coefficient: string, scale: number): BusinessValue => ({ kind: VariableValueKind.Decimal, coefficient, scale });
const list = (...value: BusinessValue[]): BusinessValue => ({ kind: VariableValueKind.List, value });
const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });
const bind = (name: string, value: BusinessValue): VariableBinding => ({ name, value });

const lineItem = map(["quantity", text("2")], ["sku", text("A-17")]);
const order = bind("order", map(["discount", decimal("-125", 2)], ["lines", list(lineItem, lineItem)],
  ["shipTo", map(["city", text("Leeds")], ["unit", nothing])]));
const parcel = map(["weight", decimal("1525", 3)]);
const packed = map(["parcels", list(parcel, parcel)]);
const quote = map(["carrier", text("north")], ["price", decimal("1249", 2)]);
const collateral = list(map(["kind", text("flat")]), map(["kind", text("flat")]));
const applicant = map(["employer", nothing], ["name", text("Ada")]);
const application = map(["amount", decimal("2500075", 2)], ["applicant", applicant], ["collateral", collateral]);
const surveyed = map(["amount", decimal("2500075", 2)], ["applicant", applicant], ["collateral", collateral], ["survey", text("done")]);
const opinion = (verdict: string) => map(["conditions", list(text("insured"), text("insured"))], ["notes", nothing], ["verdict", text(verdict)]);
const fulfilled = [bind("carrierQuote", quote), bind("finalInstructions", map(["handling", text("fragile")])), order, bind("shippedParcels", packed),
  bind("shippingLabel", quote)];
const assessed = [bind("application", application), bind("credit", opinion("good")), bind("creditFile", application),
  bind("valuation", opinion("sound")), bind("valuationFile", surveyed)];

type Step = Readonly<{ open: readonly string[]; variables: readonly VariableBinding[]; rejected?: true }>;

const bothBranchesOpen: Step = { open: ["PickItems#1", "ReviewRoute#1"], variables: [order] };
/** After *Rate shipment*, the order's tail: *Notify customer*, *Confirm fulfilment*, *Close order*, completion. */
const orderTail: readonly Step[] = [
  { open: ["NotifyCustomer#1"], variables: [bind("carrierQuote", quote), order] },
  { open: ["ConfirmFulfilment#1"], variables: [bind("carrierQuote", quote), order] },
  { open: ["CloseOrder#1"], variables: fulfilled },
  { open: [], variables: fulfilled },
];
const expertsOpen: readonly Step[] = [
  { open: ["PrepareCreditFile#1", "PrepareValuation#1"], variables: [bind("application", application)] },
  { open: ["GiveOpinion#1", "PrepareCreditFile#1"], variables: [bind("application", application)] },
  { open: ["GiveOpinion#1", "GiveOpinion#2"], variables: [bind("application", application)] },
];
const loanTail: readonly Step[] = [{ open: ["DecideLoan#1"], variables: assessed }, { open: [], variables: assessed }];

/** One step per stimulus; a refused step repeats its predecessor's observations. */
const journeys = new Map<string, readonly Step[]>([
  ["order-review-first", [
    bothBranchesOpen, { ...bothBranchesOpen, rejected: true },
    // The arming snapshot keeps `instructions = "standard"` while *Rate shipment* arms with the written values.
    { open: ["PickItems#1", "RateShipment#1"], variables: [order] },
    { open: ["RateShipment#1"], variables: [order] },
    ...orderTail,
  ]],
  ["order-pick-first", [
    bothBranchesOpen,
    { open: ["ReviewRoute#1"], variables: [order] },
    { open: ["RateShipment#1"], variables: [order] },
    ...orderTail,
  ]],
  ["loan-valuation-first", [
    ...expertsOpen,
    // *Collateral valuation* publishes its dossier while *Credit check* still waits.
    { open: ["GiveOpinion#2"], variables: [bind("application", application), bind("valuationFile", surveyed)] },
    ...loanTail,
  ]],
  ["loan-credit-first", [
    ...expertsOpen,
    { open: ["GiveOpinion#1"], variables: [bind("application", application), bind("creditFile", application)] },
    ...loanTail,
  ]],
]);

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

test("registers exactly the four schedules over the two retained models, standards-only, concurrent and host-admitted",
  async () => {
    assert.deepEqual(concurrentStructuredScopeDataPipelineCases.map(({ id }) => id),
      [...journeys.keys()].map((name) => `${prefix}${name}`));
    for (const context of await loadAndCompileCases(concurrentStructuredScopeDataPipelineCases)) {
      assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
      assert.equal(context.pipelineCase.cib, null);
      assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
      assert.equal(concurrentStructuredScopeDataProgram(context.semanticProcess), true, context.scenario.id);
      assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
      assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
      const start = context.scenario.stimuli[0];
      assert.ok(start?.kind === StimulusKind.StartProcess);
      assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
    }
  });

test("each journey exposes the open work, the command outcomes and the Process variables the proposal derives", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(concurrentStructuredScopeDataPipelineCases)) {
    const steps = journeys.get(scenario.id.slice(prefix.length))!;
    const result = runScenario(scenario, program);
    assert.deepEqual(result.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Committed }, scenario.id);
    assert.equal(result.trace.length, 1 + 2 * steps.length, `${scenario.id} ends at the completed state`);
    steps.forEach((step, position) => {
      const index = 2 + 2 * position;
      const label = `${scenario.id} trace[${index}]`;
      const command = result.trace[index - 1];
      assert.ok(command?.kind === CanonicalObservationKind.Command, `${label} follows a command`);
      assert.equal(command.outcome, step.rejected ? CommandOutcome.Rejected : CommandOutcome.Committed, label);
      const state = stateAt(result.trace, index);
      if (step.rejected) assert.deepEqual(state, stateAt(result.trace, index - 2), `${label} a refusal moves nothing`);
      assert.deepEqual(openWork(state), step.open, label);
      assert.deepEqual(state.variables, step.variables, label);
      assert.equal(state.status, position === steps.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running, label);
    });
  }
});

test("the open Pick items snapshot keeps the arming values while Rate shipment arms with Review route's writes", async () => {
  const [context] = await loadAndCompileCases(concurrentStructuredScopeDataPipelineCases.filter(({ id }) =>
    id === `${prefix}order-review-first`));
  const state = stateAt(runScenario(context!.scenario, context!.semanticProcess).trace, 6);
  const rerouted = map(["discount", decimal("-125", 2)], ["lines", list(lineItem, lineItem)],
    ["shipTo", map(["city", text("York")], ["unit", nothing])]);
  assert.deepEqual(state.openEffects.map(({ arguments: values }) => values), [
    [bind("instructions", text("standard")), { name: "items", value: order.value }],
    [bind("instructions", map(["handling", text("fragile")])), bind("shipment", rerouted)],
  ]);
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(concurrentStructuredScopeDataPipelineCases)) {
    const result = runScenario(scenario, program);
    const mutated = mutableClone(result);
    pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults({ target: DifferentialTarget.KernelTs, result },
      [{ target: DifferentialTarget.KernelTs, result: mutated }]);
    assert.equal(comparison.kind, ComparisonKind.Disagreement, scenario.id);
    if (comparison.kind !== ComparisonKind.Disagreement) assert.fail("Seeded mutation escaped comparison");
    assert.deepEqual(comparison.disagreement, pipelineCase.expectedInjectedDisagreement, scenario.id);
    assert.throws(() => pipelineCase.injectMutation(mutated), /calibration requires/u, scenario.id);
  }
});
