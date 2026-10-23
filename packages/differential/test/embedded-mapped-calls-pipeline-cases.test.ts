/**
 * Locks the registered guarantor loan schedules against Stage B of the repeated, nested and concurrent Calls proposal
 * without Lean or Temporal: the Call inside the Guarantor review returns its output into the review's declared frame
 * rather than the Process, which receives it only when the Sub-Process publishes it, and the root-path Call's output stays
 * as written (CALLN-FRAME-01); the repeated call's first task carries activation 2 under its own called identity
 * (CALLN-IDENTITY-01); a stale or cross-addressed completion is refused unchanged (CALLN-REFUSE-01).
 *
 * Expected values are rebuilt here from the proposal's definition of each journey, never read from a produced trace, and
 * every named seeded mutation must move a compared observation. Frame contents are runtime-only, so the input half of
 * CALLN-FRAME-01 rests on the Lean laws and the core journey in the bpmn-source package; the frame-lifetime test reads
 * committed core state directly for the same reason.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ControlStateKind, ProcessStatus, SemanticProfileId, StimulusKind, VariableValueKind,
  applyStimulus, deriveCalledProcessInstanceId, initialState, isWellFormedRuntimeState, runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { BusinessValue, CanonicalObservation, RuntimeState, VariableBinding } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionResultKind } from "@bpmn-lean/temporal-testkit";
import { embeddedMappedCallsMutations, embeddedMappedCallsPipelineCases } from "./embedded-mapped-calls-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { hostInteractionExpectations } from "./pipeline-expectations.ts";
import { mutableClone } from "./pipeline-target-support.ts";

const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
/** Bindings in the canonical name order that every observation uses. */
const bindings = (entries: Record<string, BusinessValue>): VariableBinding[] =>
  Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, value]) => ({ name, value }));

const verifiedStart = { amount: text("25000"), applicant: text("Ada"), guarantor: text("Bob") };
const absentStart = { amount: text("8000"), applicant: text("Grace") };

const instanceIds = {
  "repeated-nested-calls-guarantor-verified": "Loan_guaranteed",
  "repeated-nested-calls-guarantor-absent": "Loan_unvouched",
} as const;

type Host = "caller" | "applicant" | "guarantor";
type Journey = Readonly<{
  at: ReadonlyMap<number, Readonly<{ effect?: Record<string, BusinessValue>; task?: readonly [Host, string, number];
    variables: Record<string, BusinessValue> }>>;
  rejectedAt: readonly number[];
  completedAt: number;
  final: Record<string, BusinessValue>;
}>;

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

/** Per scenario: the open wait and Process variables at each state index, the refused command indices and the end. */
const journeys = new Map<string, Journey>([
  ["repeated-nested-calls-guarantor-verified", {
    at: new Map([
      [2, { effect: { applicant: text("Ada") }, variables: verifiedStart }],
      [4, { task: ["applicant", "CollectDocument", 1], variables: verifiedStart }],
      // The applicant's called task wrote its namesake amount into its called frame, not the Process.
      [6, { task: ["applicant", "RecordVerdict", 1], variables: verifiedStart }],
      // The root-path Call returned into the Process; the Guarantor review's Call opened the repeated first task as
      // activation 2, and the three refusals below leave this very wait.
      [8, { task: ["guarantor", "CollectDocument", 2], variables: { ...verifiedStart, applicantVerdict: text("approved") } }],
      [10, { task: ["guarantor", "CollectDocument", 2], variables: { ...verifiedStart, applicantVerdict: text("approved") } }],
      [12, { task: ["guarantor", "CollectDocument", 2], variables: { ...verifiedStart, applicantVerdict: text("approved") } }],
      [14, { task: ["guarantor", "CollectDocument", 2], variables: { ...verifiedStart, applicantVerdict: text("approved") } }],
      [16, { task: ["guarantor", "RecordVerdict", 2], variables: { ...verifiedStart, applicantVerdict: text("approved") } }],
      // CALLN-FRAME-01: the guarantor verdict landed in the Guarantor review frame, so the Process does not hold it yet.
      [18, { task: ["caller", "ConfirmGuarantor", 1], variables: { ...verifiedStart, applicantVerdict: text("approved") } }],
    ]),
    rejectedAt: [9, 11, 13],
    // The Sub-Process publishes the frame value on completion; the root-path output stays as written.
    completedAt: 20, final: { ...verifiedStart, applicantVerdict: text("approved"), guarantorVerdict: text("rejected") },
  }],
  ["repeated-nested-calls-guarantor-absent", {
    at: new Map([
      [2, { effect: { applicant: text("Grace") }, variables: absentStart }],
      [4, { task: ["applicant", "CollectDocument", 1], variables: absentStart }],
      [6, { task: ["applicant", "RecordVerdict", 1], variables: absentStart }],
      [8, { task: ["guarantor", "CollectDocument", 2], variables: { ...absentStart, applicantVerdict: text("rejected") } }],
      [10, { task: ["guarantor", "RecordVerdict", 2], variables: { ...absentStart, applicantVerdict: text("rejected") } }],
      // The second Call's own mappings send its verdict to the review frame, never to applicantVerdict.
      [12, { task: ["caller", "ConfirmGuarantor", 1], variables: { ...absentStart, applicantVerdict: text("rejected") } }],
    ]),
    rejectedAt: [],
    completedAt: 14, final: { ...absentStart, applicantVerdict: text("rejected"), guarantorVerdict: text("approved") },
  }],
]);

function hostInstance(instanceId: string, host: Host): string {
  switch (host) {
    case "caller": return instanceId;
    case "applicant": return deriveCalledProcessInstanceId(instanceId, "VerifyApplicant", 1);
    case "guarantor": return deriveCalledProcessInstanceId(instanceId, "VerifyGuarantor", 1);
  }
}

test("registers exactly the two schedules over the one retained guarantor loan", async () => {
  assert.deepEqual(embeddedMappedCallsPipelineCases.map(({ id }) => id), [...journeys.keys()]);
  for (const context of await loadAndCompileCases(embeddedMappedCallsPipelineCases)) {
    const bytes = await readFile(new URL(`../../../${context.pipelineCase.bpmnRelativePath}`, import.meta.url));
    assert.equal(context.scenario.bpmn.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.ok(context.pipelineCase.bpmnRelativePath.endsWith("/guarantor-loan.bpmn"), context.scenario.id);
    const overlay = await readFile(new URL(`../../../${context.pipelineCase.sourceOverlayRelativePath}`, import.meta.url));
    assert.equal(context.scenario.bpmn.sourceOverlay?.sha256, createHash("sha256").update(overlay).digest("hex"));
    assert.equal(context.scenario.id, context.pipelineCase.id);
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
  }
});

test("public admission accepts each Start", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(embeddedMappedCallsPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each journey exposes the open waits and Process values the proposal derives across both Calls", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(embeddedMappedCallsPipelineCases)) {
    const journey = journeys.get(scenario.id)!;
    const instanceId = instanceIds[scenario.id as keyof typeof instanceIds];
    const result = runScenario(scenario, program);
    for (const [index, expected] of journey.at) {
      const state = stateAt(result.trace, index);
      const label = `${scenario.id} trace[${index}]`;
      assert.equal(state.status, ProcessStatus.Running, label);
      assert.equal(state.instanceId, instanceId, label);
      if (expected.effect !== undefined) {
        assert.equal(state.openEffects.length, 1, `${label} opens one effect`);
        assert.deepEqual(state.openEffects[0]?.id, { processInstanceId: instanceId, elementId: "RegisterApplication", activation: 1 }, label);
        assert.deepEqual(state.openEffects[0]?.arguments, bindings(expected.effect), `${label} arguments`);
        assert.deepEqual(state.openUserTasks, [], label);
      } else {
        const [host, elementId, activation] = expected.task!;
        assert.deepEqual(state.openEffects, [], label);
        assert.deepEqual(state.openUserTasks.map(({ id }) => id),
          [{ processInstanceId: hostInstance(instanceId, host), elementId, activation }], label);
      }
      assert.deepEqual(state.openTimers, [], label);
      assert.deepEqual(state.openMessageSubscriptions, [], label);
      assert.deepEqual(state.openIncidents, [], label);
      assert.deepEqual(state.variables, bindings(expected.variables), `${label} variables`);
    }
    const final = stateAt(result.trace, journey.completedAt);
    assert.equal(final.status, ProcessStatus.Completed, scenario.id);
    assert.deepEqual(final.openEffects, [], scenario.id);
    assert.deepEqual(final.openUserTasks, [], scenario.id);
    assert.deepEqual(final.variables, bindings(journey.final), scenario.id);
    assert.equal(result.trace.length, journey.completedAt + 1, `${scenario.id} ends at the completed state`);
  }
});

// A stimulus-order host queries open User Tasks at the initial wait, before delivering any stimulus; each guarantor
// journey first awaits the registration effect, so that wait holds no User Task.
test("the first-completion wait a stimulus-order host observes is the initial wait", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(embeddedMappedCallsPipelineCases)) {
    const result = runScenario(scenario, program);
    const expected = hostInteractionExpectations(scenario, result, false, pipelineCase.executionSchedule, pipelineCase.expectedWaitTraceLength);
    assert.deepEqual(expected.openUserTasksAtFirstCompletionWait, [], scenario.id);
  }
});

test("a refused completion leaves the predecessor state unchanged", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(embeddedMappedCallsPipelineCases)) {
    const journey = journeys.get(scenario.id)!;
    const trace = runScenario(scenario, program).trace;
    const commands = trace.flatMap((observation, index) =>
      observation.kind === CanonicalObservationKind.Command && observation.outcome === CommandOutcome.Rejected ? [index] : []);
    assert.deepEqual(commands, journey.rejectedAt, scenario.id);
    for (const index of journey.rejectedAt) {
      assert.deepEqual(stateAt(trace, index + 1), stateAt(trace, index - 1), `${scenario.id} trace[${index}] must not move any observation`);
    }
  }
});

test("each named seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  const contexts = await loadAndCompileCases(embeddedMappedCallsPipelineCases);
  assert.deepEqual([...new Set(Object.values(embeddedMappedCallsMutations).map(({ rule }) => rule))].sort(),
    ["CALLN-FRAME-01", "CALLN-REFUSE-01"]);
  for (const [name, mutation] of Object.entries(embeddedMappedCallsMutations)) {
    const { scenario, semanticProcess: program } = contexts.find(({ scenario: { id } }) => id === `repeated-nested-calls-${mutation.scenario}`)!;
    const result = runScenario(scenario, program);
    const mutated = mutableClone(result);
    mutation.inject(mutated);
    const comparison = compareTargetResults({ target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
    assert.equal(comparison.kind, ComparisonKind.Disagreement, name);
    if (comparison.kind !== ComparisonKind.Disagreement) assert.fail("Seeded mutation escaped comparison");
    assert.deepEqual(comparison.disagreement, mutation.expected, name);
    assert.throws(() => mutation.inject(mutated), /calibration requires/u, name);
  }
});

test("each registered case carries exactly one named mutation of its own journey", async () => {
  for (const { pipelineCase, scenario } of await loadAndCompileCases(embeddedMappedCallsPipelineCases)) {
    const carried = Object.values(embeddedMappedCallsMutations).filter(({ scenario: target, inject, expected }) =>
      scenario.id === `repeated-nested-calls-${target}` && inject === pipelineCase.injectMutation &&
      expected === pipelineCase.expectedInjectedDisagreement);
    assert.equal(carried.length, 1, scenario.id);
  }
});

test("every committed state owns each called frame exactly while that call has an open task", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(embeddedMappedCallsPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    const called = [hostInstance(start.instanceId, "applicant"), hostInstance(start.instanceId, "guarantor")];
    let state: RuntimeState = initialState;
    for (const stimulus of scenario.stimuli) {
      state = applyStimulus(program, state, stimulus).state;
      const label = `${scenario.id} ${stimulus.commandId}`;
      assert.ok(isWellFormedRuntimeState(program, start.instanceId, state), `${label} state validity`);
      for (const instance of called) {
        const taskOpen = state.userTaskWaits.some(({ id }) => id.processInstanceId === instance);
        assert.equal(state.variables.scopes.some(({ owner }) => owner.processInstanceId === instance), taskOpen, `${label} ${instance} frame lifetime`);
      }
    }
    assert.equal(state.control.kind, ControlStateKind.Completed, scenario.id);
    assert.deepEqual(state.variables.scopes, [], `${scenario.id} retires every frame with its scope`);
  }
});
