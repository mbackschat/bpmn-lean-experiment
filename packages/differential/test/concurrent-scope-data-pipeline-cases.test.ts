/**
 * Locks the registered claim damage assessment and facility inspection schedules against the concurrent scope data
 * capsule's separating witnesses without Lean or Temporal: the open User Tasks and effects after every command, the
 * effect arguments each occurrence reads through its own chain (CSD-CHAIN-01, CSD-ISOLATE-01, NSD-READ-01,
 * CSD-INIT-01), the Process variables each completion writes (CSD-RETIRE-01, NSD-WRITE-01), and a seeded mutation per
 * schedule that must move exactly the observation it names.
 *
 * Expected values are written here from the capsule's separating-witness table, never read from a produced trace.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  VariableValueKind, runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, assessTemporalHostCapability, BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-testkit";
import { concurrentScopeDataPipelineCases } from "./concurrent-scope-data-pipeline-cases.ts";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "concurrent-scope-data-";
const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;
const nullValue = { kind: VariableValueKind.Null } as const;
const bind = (name: string, value: VariableBinding["value"]): VariableBinding => ({ name, value });

type Journey = Readonly<{
  /** The open `Element#activation` names after each command; the last set is empty. */
  open: ReadonlyArray<readonly string[]>;
  /** Open effect arguments by `Element#activation` after the command at that position. */
  effects: ReadonlyMap<number, ReadonlyArray<readonly [string, readonly VariableBinding[]]>>;
  final: readonly VariableBinding[];
}>;

// Both Price damage occurrences read their own frame: the first keeps "pending", the second its "4200" patch, and each
// frame's present null shadows the Process adjuster "desk".
const armed = new Map([[4, [
  ["FetchRates#1", [bind("adjuster", nullValue), bind("estimate", text("pending"))]],
  ["FetchRates#2", [bind("adjuster", nullValue), bind("estimate", text("4200"))]],
] as const]]);
const claimOpen = (later: number) => [
  ["InspectProperty#1", "InspectVehicle#1"],
  ["AssessDamage#1", "InspectProperty#1"],
  // The second inspection enters a second Price damage occurrence beside the first.
  ["AssessDamage#1", "AssessDamage#2"],
  ["AssessDamage#2", "FetchRates#1"],
  ["FetchRates#1", "FetchRates#2"],
  [`FetchRates#${later}`],
  ["ReviewClaim#1"],
  [],
];
const claimFinal = (lastEstimate: string) =>
  [bind("adjuster", text("desk")), bind("lastEstimate", text(lastEstimate)), bind("noAdjuster", nullValue)];

const journeys = new Map<string, Journey>([
  // The later completer's output wins by explicit command order.
  ["claim-fetch-one-first", { open: claimOpen(2), effects: armed, final: claimFinal("4200") }],
  ["claim-fetch-two-first", { open: claimOpen(1), effects: armed, final: claimFinal("pending") }],
  ["facility-inspection", {
    open: [["RecordElectricalFindings#1", "RecordFireSafetyFindings#1"], ["RecordFireSafetyFindings#1"], ["Summarize#1"], []],
    // Fire safety's result initialized from the outer "none", not from its sibling's literal, and its Record findings
    // wrote only the shared findings, so the last-written findings and the initial result reach Summarize.
    effects: new Map([[2, [["Summarize#1", [bind("electricalResult", text("electrical-pass")),
      bind("findings", text("extinguishers-due")), bind("fireResult", text("none"))]]]]]),
    final: [bind("electricalResult", text("electrical-pass")), bind("fireResult", text("none"))],
  }],
]);

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

test("registers exactly the three schedules over the two retained models, standards-only and host-admitted", async () => {
  assert.deepEqual(concurrentScopeDataPipelineCases.map(({ id }) => id), [...journeys.keys()].map((name) => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(concurrentScopeDataPipelineCases)) {
    assert.equal(context.scenario.profile, SemanticProfileId.EmbeddedSubProcessCompletion);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
    assert.deepEqual(assessTemporalHostCapability(context.semanticProcess), { kind: TemporalHostCapabilityResultKind.Admitted });
    const start = context.scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, context.semanticProcess), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open work, the per-occurrence effect arguments and the Process variables the capsule derives",
  async () => {
    for (const { scenario, semanticProcess: program } of await loadAndCompileCases(concurrentScopeDataPipelineCases)) {
      const journey = journeys.get(scenario.id.slice(prefix.length))!;
      const result = runScenario(scenario, program);
      assert.deepEqual(result.outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Committed }, scenario.id);
      assert.equal(result.trace.length, 1 + 2 * journey.open.length, `${scenario.id} ends at the completed state`);
      journey.open.forEach((names, position) => {
        const index = 2 + 2 * position;
        const state = stateAt(result.trace, index);
        assert.deepEqual(openWork(state), names, `${scenario.id} trace[${index}]`);
        assert.equal(state.status, position === journey.open.length - 1 ? ProcessStatus.Completed : ProcessStatus.Running,
          `${scenario.id} trace[${index}]`);
        const command = result.trace[index - 1];
        assert.ok(command?.kind === CanonicalObservationKind.Command && command.outcome === CommandOutcome.Committed,
          `${scenario.id} trace[${index - 1}] must be a committed command`);
        const effects = journey.effects.get(position);
        if (effects !== undefined) {
          assert.deepEqual(state.openEffects.map(({ id, arguments: values }) => [`${id.elementId}#${id.activation}`, values]),
            effects, `${scenario.id} trace[${index}] effect arguments`);
        }
      });
      assert.deepEqual(stateAt(result.trace, result.trace.length - 1).variables, journey.final, scenario.id);
    }
  });

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(concurrentScopeDataPipelineCases)) {
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
