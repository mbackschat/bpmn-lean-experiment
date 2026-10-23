/**
 * Locks the registered supplier onboarding schedules against the repeated, nested and concurrent Calls proposal's
 * separating witnesses without Lean or Temporal: the open User Tasks, named by element, activation and owning instance,
 * and Process status after every command (CALLN-INVOKE-01, CALLN-RETURN-01, CALLN-NEST-01, CALLN-IDENTITY-01), refused
 * completions that leave the committed state unchanged (CALLN-REFUSE-01), and a seeded mutation per schedule that must move
 * exactly the observation it names.
 *
 * Expected open sets are written here from the proposal's account of each journey, never read from a produced trace.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, SemanticProfileId, StimulusKind,
  deriveCalledProcessInstanceId, runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionResultKind } from "@bpmn-lean/temporal-testkit";
import { repeatedNestedConcurrentCallsPipelineCases } from "./repeated-nested-concurrent-calls-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const prefix = "repeated-nested-calls-";
const model = "supplier-onboarding";

const supplier = "Instance_1";
const tax = deriveCalledProcessInstanceId(supplier, "CallActivity_TaxApproval", 1);
const bank = deriveCalledProcessInstanceId(supplier, "CallActivity_BankApproval", 1);
const risk = deriveCalledProcessInstanceId(supplier, "CallActivity_ReviewRisk", 1);
const compliance = deriveCalledProcessInstanceId(risk, "CallActivity_CheckCompliance", 1);
const final = deriveCalledProcessInstanceId(supplier, "CallActivity_FinalApproval", 1);
const ownerLabels = new Map([[supplier, "supplier"], [tax, "tax"], [bank, "bank"], [risk, "risk"], [compliance, "compliance"],
  [final, "final"]]);

type Journey = Readonly<{
  /** The open `Element#activation@owner` names at trace index 2 + 2 * i, which follows the i-th command; the last set is empty. */
  open: ReadonlyArray<readonly string[]>;
  /** Zero-based positions among the commands, Start included, that the Process rejects. */
  rejected: ReadonlyArray<number>;
}>;

const journeys = new Map<string, Journey>([
  ["natural-order", {
    open: [
      ["RegisterSupplier#1@supplier"],
      ["CollectBankDetails#1@supplier", "CollectTaxDocuments#1@supplier"],
      ["CollectBankDetails#1@supplier", "PrepareApproval#1@tax"],
      // Each Four-eyes approval is its own instance: tax was invoked first, so its Prepare approval is activation 1.
      ["PrepareApproval#1@tax", "PrepareApproval#2@bank"],
      ["Approve#1@tax", "PrepareApproval#2@bank"],
      ["PrepareApproval#2@bank"],
      ["Approve#2@bank"],
      ["AssessRisk#1@risk"],
      // The risk review holds no task of its own while its nested compliance Call is live.
      ["ScreenSanctions#1@compliance"],
      ["PrepareApproval#3@final"],
      ["Approve#3@final"],
      [],
    ],
    rejected: [],
  }],
  ["reverse-order-stale-and-cross-addressed", {
    open: [
      ["RegisterSupplier#1@supplier"],
      ["CollectBankDetails#1@supplier", "CollectTaxDocuments#1@supplier"],
      ["CollectBankDetails#1@supplier", "PrepareApproval#1@tax"],
      ["PrepareApproval#1@tax", "PrepareApproval#2@bank"],
      ["Approve#1@bank", "PrepareApproval#1@tax"],
      // The live Approve activation 1 belongs to the bank instance, so addressing it with the tax instance's or the
      // caller's identity is refused, although its element and activation match.
      ["Approve#1@bank", "PrepareApproval#1@tax"],
      ["Approve#1@bank", "PrepareApproval#1@tax"],
      // The bank instance has returned into its own branch; the tax instance is untouched and the join waits.
      ["PrepareApproval#1@tax"],
      ["Approve#2@tax"],
      ["AssessRisk#1@risk"],
      // The tax instance has returned, so its Approve activation 2 is stale and refused with Assess risk still open.
      ["AssessRisk#1@risk"],
      ["ScreenSanctions#1@compliance"],
      ["PrepareApproval#3@final"],
      ["Approve#3@final"],
      [],
    ],
    rejected: [5, 6, 10],
  }],
]);

const openNames = (state: { openUserTasks: ReadonlyArray<{ id: { processInstanceId: string; elementId: string; activation: number } }> }) =>
  state.openUserTasks.map(({ id }) =>
    `${id.elementId.slice("UserTask_".length)}#${id.activation}@${ownerLabels.get(id.processInstanceId) ?? id.processInstanceId}`).toSorted();

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

test("registers exactly the two schedules over the one retained model, standards-only", async () => {
  assert.deepEqual(repeatedNestedConcurrentCallsPipelineCases.map(({ id }) => id), [...journeys.keys()].map((name) => `${prefix}${name}`));
  for (const context of await loadAndCompileCases(repeatedNestedConcurrentCallsPipelineCases)) {
    const bytes = await readFile(new URL(`../../../${context.pipelineCase.bpmnRelativePath}`, import.meta.url));
    assert.equal(context.scenario.bpmn.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.ok(context.pipelineCase.bpmnRelativePath.endsWith(`/${model}.bpmn`), context.scenario.id);
    assert.equal(context.scenario.profile, SemanticProfileId.EmbeddedSubProcessCompletion);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
  }
});

test("public admission accepts each Start", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(repeatedNestedConcurrentCallsPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open User Tasks and Process status the proposal derives after every command", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(repeatedNestedConcurrentCallsPipelineCases)) {
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
  const contexts = await loadAndCompileCases(repeatedNestedConcurrentCallsPipelineCases);
  const refusals = contexts.flatMap(({ scenario, semanticProcess: program }) =>
    (journeys.get(scenario.id.slice(prefix.length))?.rejected ?? []).map((position) => ({ scenario, program, index: 1 + 2 * position })));
  assert.equal(refusals.length, 3, "the reverse-order schedule refuses two cross-addressed and one stale completion");
  for (const { scenario, program, index } of refusals) {
    const trace = runScenario(scenario, program).trace;
    assert.deepEqual(stateAt(trace, index + 1), stateAt(trace, index - 1), `${scenario.id} trace[${index}] must not move any observation`);
  }
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(repeatedNestedConcurrentCallsPipelineCases)) {
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
