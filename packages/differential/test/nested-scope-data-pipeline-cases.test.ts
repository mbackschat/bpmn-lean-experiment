/**
 * Locks the registered purchase-order, expense-claim and bulk-quote schedules against the nested embedded scope data
 * capsule's decisive witnesses without Lean or Temporal: frames shadow the Process on read (NSD-INIT-01, NSD-READ-01),
 * writes and outputs land at the nearest declaring owner (NSD-WRITE-01, NSD-OUTPUT-01), retired locals leave no trace
 * (NSD-RETIRE-01), a refused completion leaves the predecessor state (NSD-TASK-01, NSD-REFUSE-01) and structured values
 * keep their shape through three frames (NSD-VALUE-01).
 *
 * Expected values are rebuilt here from the capsule's definition of each journey, never read from a produced trace,
 * and every named seeded mutation must move a compared observation. The retired-frame witness (NSD-RETIRE-01) has no
 * public observation of an orphan, so the Lean disposal law and the core state-validity check own it.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CanonicalObservationKind, CommandOutcome, ProcessStatus, ScenarioOutcomeKind, ScenarioStepKind, SemanticProfileId, StimulusKind,
  VariableValueKind, advanceScenario, canonicalNamedValueArrayUtf8ByteLength, initialState, runScenario,
  supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { BusinessValue, CanonicalObservation, Scenario, VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionResultKind } from "@bpmn-lean/temporal-testkit";
import { nestedScopeDataPipelineCases } from "./nested-scope-data-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import { domainCases } from "./scenario-value-domain-cases.ts";

const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
const nothing: BusinessValue = { kind: VariableValueKind.Null };
const integer = (value: number): BusinessValue => ({ kind: VariableValueKind.Integer, value });
const decimal = (coefficient: string, scale: number): BusinessValue => ({ kind: VariableValueKind.Decimal, coefficient, scale });
const list = (...value: BusinessValue[]): BusinessValue => ({ kind: VariableValueKind.List, value });
const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });
/** Bindings in the canonical name order that every observation uses. */
const bindings = (entries: Record<string, BusinessValue>): VariableBinding[] =>
  Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, value]) => ({ name, value }));

const item = (sku: string) => map(["quantity", integer(2)], ["sku", text(sku)]);
/** Two equal line items, a nested address with a present null and a negative scale-two total. */
const order = map(["address", map(["line1", text("Dock 7")], ["line2", nothing])],
  ["items", list(item("A-1"), item("A-1"))], ["total", decimal("-123455", 2)]);
const emptyOrder = map(["items", list()], ["memo", map()], ["total", decimal("0", 0)]);
const quote = map(["lines", list(map(["qty", integer(10)], ["sku", text("B-7")]), map(["qty", integer(10)], ["sku", text("B-7")]))],
  ["valid", map(["until", nothing])]);
const claim = map(["amount", decimal("4255", 2)], ["memo", text("taxi")]);

const approvedStart = { initialStatus: nothing, note: text("n0"), order, requestedLimit: text("5000"), riskClass: text("low"), status: text("open") };
const nullRiskStart = { initialStatus: text("intake"), note: text("n1"), order: emptyOrder, requestedLimit: nothing, riskClass: nothing, status: text("open") };

const models = new Map([
  ["nested-scope-data-order-approved", "purchase-order"], ["nested-scope-data-order-null-risk", "purchase-order"],
  ["nested-scope-data-claim-limits", "expense-claim"], ["nested-scope-data-quote-signed", "bulk-quote"],
]);

type Journey = Readonly<{ at: ReadonlyMap<number, Readonly<{ effect?: readonly [string, Record<string, BusinessValue>]; task?: string;
  variables: Record<string, BusinessValue> }>>; completedAt: number; final: Record<string, BusinessValue> }>;

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

/** Per scenario: the open wait and Process variables at each state index, and the completed state. */
const journeys = new Map<string, Journey>([
  ["nested-scope-data-order-approved", {
    at: new Map([
      // NSD-INIT-01 and NSD-READ-01: limit is the Process requestedLimit, never credit review's sibling literal "0";
      // reviewer and status are order approval's null over the Process "open".
      [2, { effect: ["KS", { limit: text("5000"), reviewer: nothing, risk: text("low"), status: nothing }], variables: approvedStart }],
      [4, { task: "CU", variables: approvedStart }],
      // NSD-WRITE-01: the review wrote status into order approval's frame; the credit output wrote the Process limit.
      [8, { effect: ["OS", { limit: text("7500"), order }], variables: { ...approvedStart, limit: text("7500") } }],
      // NSD-OUTPUT-01: finalStatus publishes order approval's status, decision is order approval's untouched initial
      // value, and the retired frame's note "draft" never reaches the Process "n0" that the publish step reads.
      [10, { effect: ["R", { approvedOrder: order, finalDecision: text("pending"), note: text("n0"), status: text("open") }],
        variables: published() }],
    ]),
    completedAt: 12, final: published(),
  }],
  ["nested-scope-data-order-null-risk", {
    at: new Map([
      [2, { effect: ["KS", { limit: nothing, reviewer: text("intake"), risk: nothing, status: text("intake") }], variables: nullRiskStart }],
      [4, { task: "CU", variables: nullRiskStart }],
      // A present null limit shadows nothing and is still a written Process binding after credit review retires.
      [6, { effect: ["OS", { limit: nothing, order: emptyOrder }], variables: { ...nullRiskStart, limit: nothing } }],
      // The compliance check wrote nothing and the review submitted nothing, so order approval still holds the
      // status that the compliance scope output into it, and the Process status stays "open".
      [8, { effect: ["R", { approvedOrder: emptyOrder, finalDecision: text("pending"), note: text("n1"), status: text("open") }],
        variables: nullRiskPublished() }],
    ]),
    completedAt: 10, final: nullRiskPublished(),
  }],
  ["nested-scope-data-claim-limits", {
    at: new Map([
      [2, { task: "ReviewClaim", variables: { claim } }],
      // The refused over-allowance patch left the same wait and the same Start claim.
      [4, { task: "ReviewClaim", variables: { claim } }],
    ]),
    completedAt: 8, final: {},
  }],
  ["nested-scope-data-quote-signed", {
    at: new Map([
      [2, { task: "SignQuote", variables: { quote } }],
      // Quote preparation outputs its own prepared copy, not the signed copy of the innermost frame.
      [4, { effect: ["ArchiveQuote", { finalQuote: quote }], variables: { finalQuote: quote, quote } }],
    ]),
    completedAt: 6, final: { finalQuote: quote, quote },
  }],
]);

function published(): Record<string, BusinessValue> {
  return { ...approvedStart, approvedOrder: order, finalDecision: text("pending"), finalStatus: text("approved"), limit: text("7500") };
}

function nullRiskPublished(): Record<string, BusinessValue> {
  return { ...nullRiskStart, approvedOrder: emptyOrder, finalDecision: text("pending"), finalStatus: text("pending-check"), limit: nothing };
}

test("registers exactly the four decisive schedules over three retained models", async () => {
  assert.deepEqual(nestedScopeDataPipelineCases.map(({ id }) => id), [...models.keys()]);
  for (const context of await loadAndCompileCases(nestedScopeDataPipelineCases)) {
    const bytes = await readFile(new URL(`../../../${context.pipelineCase.bpmnRelativePath}`, import.meta.url));
    assert.equal(context.scenario.bpmn.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.ok(context.pipelineCase.bpmnRelativePath.endsWith(`/${models.get(context.scenario.id)}.bpmn`), context.scenario.id);
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
  }
});

test("each journey exposes the open waits and Process values the capsule derives, through up to three frames", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(nestedScopeDataPipelineCases)) {
    const journey = journeys.get(scenario.id)!;
    const result = runScenario(scenario, program);
    for (const [index, expected] of journey.at) {
      const state = stateAt(result.trace, index);
      assert.equal(state.status, ProcessStatus.Running, `${scenario.id} trace[${index}]`);
      if (expected.effect !== undefined) {
        const [elementId, args] = expected.effect;
        assert.equal(state.openEffects.length, 1, `${scenario.id} trace[${index}] opens one effect`);
        assert.equal(state.openEffects[0]?.id.elementId, elementId, `${scenario.id} trace[${index}]`);
        assert.deepEqual(state.openEffects[0]?.arguments, bindings(args), `${scenario.id} trace[${index}] arguments`);
      } else {
        assert.deepEqual(state.openEffects, [], `${scenario.id} trace[${index}]`);
        assert.deepEqual(state.openUserTasks.map(({ id }) => id.elementId), [expected.task], `${scenario.id} trace[${index}]`);
      }
      assert.deepEqual(state.variables, bindings(expected.variables), `${scenario.id} trace[${index}] variables`);
    }
    const final = stateAt(result.trace, journey.completedAt);
    assert.equal(final.status, ProcessStatus.Completed, scenario.id);
    assert.deepEqual(final.openEffects, [], scenario.id);
    assert.deepEqual(final.openUserTasks, [], scenario.id);
    if (scenario.id !== "nested-scope-data-claim-limits") assert.deepEqual(final.variables, bindings(journey.final), scenario.id);
    assert.equal(result.trace.length, journey.completedAt + 1, `${scenario.id} ends at the completed state`);
  }
});

test("a refused completion leaves the predecessor state unchanged", async () => {
  const contexts = await loadAndCompileCases(nestedScopeDataPipelineCases);
  const refusals = [["nested-scope-data-order-approved", "refuse-undeclared-name", 5], ["nested-scope-data-claim-limits", "refuse-over-allowance", 3]] as const;
  for (const [id, commandId, index] of refusals) {
    const { scenario, semanticProcess: program } = contexts.find(({ scenario: { id: candidate } }) => candidate === id)!;
    const trace = runScenario(scenario, program).trace;
    const command = trace[index];
    assert.ok(command?.kind === CanonicalObservationKind.Command && command.commandId === commandId, `${id} ${commandId}`);
    assert.equal(command.outcome, CommandOutcome.Rejected, commandId);
    assert.deepEqual(stateAt(trace, index + 1), stateAt(trace, index - 1), `${commandId} must not move any observation`);
  }
});

test("the claim patches sit exactly at and one byte over the patch allowance and the accepted one reaches the output", async () => {
  const { scenario, semanticProcess: program } = (await loadAndCompileCases(nestedScopeDataPipelineCases))
    .find(({ scenario: { id } }) => id === "nested-scope-data-claim-limits")!;
  const patches = scenario.stimuli.flatMap((stimulus) => stimulus.kind === StimulusKind.CompleteUserTaskInstance
    ? [stimulus.submittedValues.map(({ name, value }) => {
      assert.notEqual(value.kind, VariableValueKind.StringList, "a portable patch carries no legacy String list");
      return { name, value: value as BusinessValue };
    })] : []);
  assert.deepEqual(patches.map((patch) => canonicalNamedValueArrayUtf8ByteLength(patch)), [16_385, 16_384]);
  const accepted = patches[1]![0]!;
  assert.equal(accepted.name, "claim");
  const trace = runScenario(scenario, program).trace;
  const record = stateAt(trace, 6).openEffects[0];
  assert.deepEqual(record?.arguments, bindings({ claim: accepted.value, ticket: text("T-1") }));
  assert.deepEqual(stateAt(trace, 8).variables, bindings({ claim, recordRef: text("R-1"), reviewedClaim: accepted.value }));
});

test("public admission accepts each Start", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(nestedScopeDataPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("reversing the declaration order of a Sub-Process's inputs compiles to the identical Program", async () => {
  const bytes = (await readFile(new URL("../../../scenarios/nested-embedded-scope-data/purchase-order.bpmn", import.meta.url), "utf8"));
  const overlay = await readFile(new URL("../../../scenarios/nested-embedded-scope-data/purchase-order-overlay.json", import.meta.url));
  const lines = bytes.split("\n");
  const first = lines.findIndex((line) => line.includes('name="decision">credit-pending'));
  assert.ok(first >= 0 && lines[first + 2]?.includes('name="requestedLimit">0'), "the credit review inputs are located by their exact lines");
  const reversed = [...lines.slice(0, first), ...lines.slice(first, first + 3).reverse(), ...lines.slice(first + 3)].join("\n");
  assert.notEqual(reversed, bytes);
  const compile = async (source: string) => {
    const result = await compileBpmnToSemanticProcess({
      bytes: Buffer.from(source), sourceId: "purchase-order", expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
      sourceOverlay: { id: "purchase-order-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
      limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
    });
    assert.equal(result.status, BpmnCompilationStatus.Accepted);
    assert.ok(result.status === BpmnCompilationStatus.Accepted);
    const { identity: _identity, ...program } = result.semanticProcess;
    return program;
  };
  assert.deepEqual(await compile(reversed), await compile(bytes));
});

test("each registered seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(nestedScopeDataPipelineCases)) {
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

test("the cross-target value matrix expects the nested scope-data domain from the retained schedules", async () => {
  const cases = (await domainCases()).filter(({ context }) => context.scenario.profile === SemanticProfileId.NestedEmbeddedScopeData);
  assert.ok(cases.length > 10, "the profile must contribute its own matrix cases");
  for (const input of cases) {
    assert.equal(supportsSemanticProcessScenario(input.scenario as Scenario, input.context.semanticProcess), input.supported, input.scenario.id);
  }
  const supportedByLabel = new Map(cases.map(({ scenario, supported }) => [scenario.id.replace(/^nested-scope-data-order-approved-/u, ""), supported]));
  for (const [label, supported] of [["start-string-exact-bound", true], ["start-string-over-bound", false],
    ["human-string-exact-bound", true], ["human-string-over-bound", false], ["effect-string-exact-bound", true],
    ["effect-string-over-bound", false], ["valid-start-data-present-null", true], ["invalid-start-data-missing-required", false]] as const) {
    assert.equal(supportedByLabel.get(label), supported, label);
  }
});

/**
 * The NSD-TASK-01 refusals the scenario wire contract cannot carry: a repeated name, names out of canonical order
 * and a root String List are rejected by the core with the predecessor state, and a Program outside the profile's
 * admission reaches no frame operation even when its stimulus would otherwise commit.
 */
test("the core rejects repeated, unordered and String List patches and an unadmitted Program", async () => {
  const context = (await loadAndCompileCases(nestedScopeDataPipelineCases))
    .find(({ scenario }) => scenario.id === "nested-scope-data-claim-limits")!;
  const program = context.semanticProcess;
  const start = context.scenario.stimuli[0]!;
  const started = advanceScenario(program, initialState, start);
  assert.ok(started.kind === ScenarioStepKind.Committed);
  const taskId = started.state.userTaskWaits[0]!.id;
  const complete = (submittedValues: VariableBinding[]) => ({
    kind: StimulusKind.CompleteUserTaskInstance, commandId: "refusal", taskId, submittedValues,
  }) as const;
  const accepted = complete([{ name: "ticket", value: text("T-2") }]);
  assert.equal(advanceScenario(program, started.state, accepted).kind, ScenarioStepKind.Committed);
  for (const [label, patch] of [
    ["repeated name", [{ name: "ticket", value: text("a") }, { name: "ticket", value: text("b") }]],
    ["unordered names", [{ name: "ticket", value: text("a") }, { name: "claim", value: text("b") }]],
    ["root String List", [{ name: "ticket", value: { kind: VariableValueKind.StringList, value: ["a"] } }]],
  ] as const) {
    const refused = advanceScenario(program, started.state, complete([...patch] as VariableBinding[]));
    assert.ok(refused.kind === ScenarioStepKind.Terminal, label);
    assert.ok(refused.outcome.kind === ScenarioOutcomeKind.Semantic, label);
    assert.equal(refused.outcome.outcome, CommandOutcome.Rejected, label);
    assert.deepEqual(refused.state, started.state, label);
  }
  // Two records for one scope violate NSD-ADMIT-01; the command gate refuses before any frame write.
  const record = program.scopeLocalData![0]!;
  const unadmitted = { ...program, scopeLocalData: [record, record] };
  assert.notEqual(advanceScenario(unadmitted, started.state, accepted).kind, ScenarioStepKind.Committed);
});
