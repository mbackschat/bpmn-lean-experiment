/**
 * Locks the registered portable-handoff schedules against the amendment's decisive witnesses without Lean or Temporal:
 * the 12-node order through both tasks, a revision with ordered unequal items and a negative Decimal, and a present
 * Null control, each answer-free in its retained form.
 *
 * Expected values are rebuilt here from the capsule's definition of the order, never read from a produced trace, and
 * every named seeded mutation must move a compared observation.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, SemanticProfileId, StimulusKind, VariableValueKind, runScenario,
  supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { BusinessValue, ScenarioResult, VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionFailureCode, BpmnProcessAdmissionResultKind } from "@bpmn-lean/temporal-testkit";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import type { MutableScenarioResult } from "./pipeline-types.ts";
import { portableHandoffPipelineCases } from "./portable-handoff-pipeline-cases.ts";
import { domainCases } from "./scenario-value-domain-cases.ts";

const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
const integer = (value: number): BusinessValue => ({ kind: VariableValueKind.Integer, value });
const nothing: BusinessValue = { kind: VariableValueKind.Null };
const decimal = (coefficient: string, scale: number): BusinessValue => ({ kind: VariableValueKind.Decimal, coefficient, scale });
const list = (...value: BusinessValue[]): BusinessValue => ({ kind: VariableValueKind.List, value });
const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });
const line = (quantity: number, sku: string) => map(["quantity", integer(quantity)], ["sku", text(sku)]);
const address = map(["city", text("Berlin")], ["line2", nothing]);
const order = map(["address", address], ["items", list(line(1, "A"), line(1, "A"))], ["total", decimal("12345", 2)]);
const revision = map(["address", address], ["items", list(line(2, "B"), line(1, "A"))], ["total", decimal("-125", 2)]);
const receipt = map(["archivedItems", integer(2)], ["status", text("archived")]);
const bind = (name: string, value: BusinessValue): VariableBinding => ({ name, value });

/** Per scenario: what Review submitted, what Archive submitted. */
const journeys = new Map<string, readonly [BusinessValue, BusinessValue]>([
  ["portable-handoff-order-nested", [order, order]],
  ["portable-handoff-order-revised", [revision, receipt]],
  ["portable-handoff-order-null", [nothing, map()]],
]);

test("registers exactly the three decisive schedules over one retained model", async () => {
  assert.deepEqual(portableHandoffPipelineCases.map(({ id }) => id), [...journeys.keys()]);
  const bytes = await readFile(new URL("../../../scenarios/portable-business-values-handoff/order-handoff.bpmn", import.meta.url));
  for (const context of await loadAndCompileCases(portableHandoffPipelineCases)) {
    assert.equal(context.scenario.bpmn.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(context.scenario.profile, SemanticProfileId.PortableBusinessValuesHandoff);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
  }
});

test("the order reaches each wait whole and every Process value survives to completion", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(portableHandoffPipelineCases)) {
    const reviewed = journeys.get(scenario.id)!;
    const result = runScenario(scenario, program);
    const states = result.trace.filter((observation) => observation.kind === CanonicalObservationKind.State);
    const firstWait = states.find((state) => state.openUserTasks[0]?.id.elementId === "ReviewOrder");
    const secondWait = states.find((state) => state.openUserTasks[0]?.id.elementId === "ArchiveOrder");
    assert.deepEqual(firstWait?.openUserTasks[0]?.inputs, [bind("ReviewOrder_in", order)], scenario.id);
    assert.deepEqual(firstWait?.variables, [bind("receivedOrder", order)], scenario.id);
    assert.deepEqual(secondWait?.openUserTasks[0]?.inputs, [bind("ArchiveOrder_in", reviewed[0])], scenario.id);
    assert.deepEqual(secondWait?.variables, [bind("receivedOrder", order), bind("reviewedOrder", reviewed[0])], scenario.id);
    const final = states.at(-1);
    assert.equal(final?.status, ProcessStatus.Completed, scenario.id);
    assert.deepEqual(final?.variables, [bind("archivedOrder", reviewed[1]), bind("receivedOrder", order), bind("reviewedOrder", reviewed[0])], scenario.id);
    assert.deepEqual(final?.openUserTasks, [], "the retired local is not published");
    for (const observation of result.trace) {
      if (observation.kind === CanonicalObservationKind.Command && observation.commandId.startsWith("refuse-")) {
        assert.equal(observation.outcome, CommandOutcome.Rejected, `${scenario.id} ${observation.commandId}`);
      }
    }
  }
});

test("public admission accepts each Start and refuses a malformed or foreign-profile Program", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(portableHandoffPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: BpmnProcessAdmissionResultKind.Admitted });
    for (const malformed of [{ ...program, operations: [] }, { ...program, controlPlaces: [] },
      { ...program, identity: { ...program.identity, semanticProfile: SemanticProfileId.StructuredProcessComposition } }]) {
      const refusal = assessBpmnProcessAdmission(start, malformed);
      assert.equal(refusal.kind, BpmnProcessAdmissionResultKind.Rejected);
      if (refusal.kind !== BpmnProcessAdmissionResultKind.Rejected) assert.fail("Invalid handoff admitted");
      assert.equal(refusal.failure.code, BpmnProcessAdmissionFailureCode.SemanticProcessUnsupported);
    }
  }
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(portableHandoffPipelineCases)) {
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

/** Each named mutation class from the amendment, applied to the real trace of the schedule that exposes it. */
type Mutator = (result: MutableScenarioResult) => void;

function waitTask(result: MutableScenarioResult, elementId: string) {
  for (const observation of result.trace) {
    if (observation.kind === CanonicalObservationKind.State && observation.openUserTasks[0]?.id.elementId === elementId) {
      return { observation, task: observation.openUserTasks[0] };
    }
  }
  throw new Error(`no ${elementId} wait`);
}

function reviewedOrder(result: MutableScenarioResult, elementId: string) {
  const { task } = waitTask(result, elementId);
  const value = task.inputs?.[0]?.value;
  if (value?.kind !== VariableValueKind.Map) throw new Error("expected a Map input");
  return value;
}

const mutators: ReadonlyArray<readonly [string, string, Mutator]> = [
  ["deduplicate equal items", "portable-handoff-order-nested", (result) => {
    const items = reviewedOrder(result, "ArchiveOrder").value[1]?.value;
    if (items?.kind !== VariableValueKind.List) throw new Error("expected items");
    items.value.splice(1, 1);
  }],
  ["sort ordered unequal items", "portable-handoff-order-revised", (result) => {
    const items = reviewedOrder(result, "ArchiveOrder").value[1]?.value;
    if (items?.kind !== VariableValueKind.List) throw new Error("expected items");
    items.value.reverse();
  }],
  ["round the signed coefficient", "portable-handoff-order-revised", (result) => {
    const total = reviewedOrder(result, "ArchiveOrder").value[2]?.value;
    if (total?.kind !== VariableValueKind.Decimal) throw new Error("expected total");
    total.coefficient = "-13";
    total.scale = 1;
  }],
  ["drop the sign of the amount", "portable-handoff-order-revised", (result) => {
    const total = reviewedOrder(result, "ArchiveOrder").value[2]?.value;
    if (total?.kind !== VariableValueKind.Decimal) throw new Error("expected total");
    total.coefficient = total.coefficient.replace("-", "");
  }],
  ["flatten the nested address Map", "portable-handoff-order-nested", (result) => {
    const order = reviewedOrder(result, "ArchiveOrder");
    order.value.splice(0, 1, ...(order.value[0]?.value.kind === VariableValueKind.Map ? order.value[0].value.value : []));
  }],
  ["replace a present Null by a missing field", "portable-handoff-order-nested", (result) => {
    const inner = reviewedOrder(result, "ArchiveOrder").value[0]?.value;
    if (inner?.kind !== VariableValueKind.Map) throw new Error("expected address");
    inner.value.splice(1, 1);
  }],
  ["leak the retired local into Process data", "portable-handoff-order-nested", (result) => {
    const { observation, task } = waitTask(result, "ArchiveOrder");
    observation.variables = [...observation.variables, ...(task.inputs ?? [])];
  }],
  ["publish an empty Map as Null", "portable-handoff-order-null", (result) => {
    const final = result.trace.at(-1);
    if (final?.kind !== CanonicalObservationKind.State) throw new Error("expected final state");
    final.variables = final.variables.map((entry) => entry.name === "archivedOrder" ? { ...entry, value: nothing } : entry);
  }],
];

test("every named mutation class is observed on the schedule that exposes it", async () => {
  const contexts = new Map((await loadAndCompileCases(portableHandoffPipelineCases)).map((context) => [context.scenario.id, context]));
  for (const [label, scenarioId, mutate] of mutators) {
    const context = contexts.get(scenarioId)!;
    const result: ScenarioResult = runScenario(context.scenario, context.semanticProcess);
    const mutated = mutableClone(result);
    mutate(mutated);
    const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
    assert.equal(comparison.kind, ComparisonKind.Disagreement, label);
  }
});

test("the cross-target value matrix expects the handoff's SingletonBusinessItem domain from the retained schedules", async () => {
  const cases = (await domainCases()).filter(({ context }) => context.scenario.profile === SemanticProfileId.PortableBusinessValuesHandoff);
  assert.ok(cases.length > 20, "the handoff must contribute its own matrix cases");
  for (const input of cases) {
    assert.equal(supportsSemanticProcessScenario(input.scenario, input.context.semanticProcess), input.supported, input.scenario.id);
  }
  const supportedByLabel = new Map(cases.map(({ scenario, supported }) => [scenario.id.replace(/^portable-handoff-order-nested-/u, ""), supported]));
  for (const [label, supported] of [["start-list", false], ["start-stringList", false], ["start-map", true], ["start-decimal", true],
    ["start-string-exact-bound", true], ["start-string-over-bound", false], ["human-string-over-bound", false],
    ["invalid-start-data-missing", false], ["invalid-start-data-extra", false]] as const) {
    assert.equal(supportedByLabel.get(label), supported, label);
  }
});
