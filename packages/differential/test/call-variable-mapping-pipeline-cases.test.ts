/**
 * Locks the registered loan-application schedules against the Call variable mapping proposal's separating witnesses
 * without Lean or Temporal: inputs are copied by value with an absent source becoming a present null (CVM-IN-01), a called
 * write stays in the called frame (CVM-ISOLATE-01), outputs land at the Process and a never-set source overwrites with a
 * present null (CVM-OUT-01), called patches may not name caller names (CVM-TASK-01), a completion addressed to the caller
 * is refused (CVM-REFUSE-01) and the Start admits Call sources and output targets only (CVM-START-01).
 *
 * Expected values are rebuilt here from the proposal's definition of each journey, never read from a produced trace, and
 * every named seeded mutation must move a compared observation. The retired-frame witness (CVM-RETIRE-01) has no public
 * observation of an orphan, so the Lean disposal law and the core state validity own it; the frame-lifetime test below
 * reads the committed core state directly for the same reason. Frame contents are runtime-only, so the input half of
 * CVM-IN-01 is also owned by the core journey in the bpmn-source package.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CanonicalObservationKind, CommandOutcome, ControlStateKind, ProcessStatus, SemanticProfileId, StimulusKind, VariableValueKind,
  applyStimulus, deriveCalledProcessInstanceId, initialState, isWellFormedRuntimeState, runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { BusinessValue, CanonicalObservation, RuntimeState, Scenario, SemanticProcessProgram, VariableBinding } from "@bpmn-lean/semantic-core";
import { requireBpmnWorkflowContinuationStateV1 } from "@bpmn-lean/temporal-protocol";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionResultKind } from "@bpmn-lean/temporal-testkit";
import { callVariableMappingMutations, callVariableMappingPipelineCases } from "./call-variable-mapping-pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { hostInteractionExpectations } from "./pipeline-expectations.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import { domainCases } from "./scenario-value-domain-cases.ts";

const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
const nothing: BusinessValue = { kind: VariableValueKind.Null };
/** Bindings in the canonical name order that every observation uses. */
const bindings = (entries: Record<string, BusinessValue>): VariableBinding[] =>
  Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, value]) => ({ name, value }));

const approvedStart = { amount: text("25000"), applicant: text("Ada") };
const nullApplicantStart = { amount: text("9000"), applicant: nothing };
const unsetVerdictStart = { amount: text("25000"), decision: text("old") };

const instanceIds = {
  "call-variable-mapping-loan-approved": "Loan_approved",
  "call-variable-mapping-loan-null-applicant": "Loan_null_applicant",
  "call-variable-mapping-loan-unset-verdict": "Loan_unset_verdict",
} as const;

type Host = "caller" | "called";
type Journey = Readonly<{ at: ReadonlyMap<number, Readonly<{ effect?: readonly [string, Record<string, BusinessValue>];
  task?: readonly [Host, string]; variables: Record<string, BusinessValue> }>>; completedAt: number; final: Record<string, BusinessValue> }>;

function stateAt(trace: readonly CanonicalObservation[], index: number) {
  const state = trace[index];
  assert.ok(state?.kind === CanonicalObservationKind.State, `trace[${index}] must be a state`);
  return state;
}

/** Per scenario: the open wait and Process variables at each state index, and the completed state. */
const journeys = new Map<string, Journey>([
  ["call-variable-mapping-loan-approved", {
    at: new Map([
      [2, { effect: ["AcknowledgeApplication", { amount: text("25000") }], variables: approvedStart }],
      // Entering the Call opens the first called task; the three refusals below leave this very wait.
      [4, { task: ["called", "CollectDocument"], variables: approvedStart }],
      [6, { task: ["called", "CollectDocument"], variables: approvedStart }],
      [8, { task: ["called", "CollectDocument"], variables: approvedStart }],
      // CVM-ISOLATE-01: the called task wrote its namesake amount "1" into the called frame, not the Process.
      [10, { task: ["called", "RecordVerdict"], variables: approvedStart }],
      // CVM-OUT-01 and CVM-IN-01: the verdict lands at the Process as decision, the copied customer as echoedCustomer.
      [12, { task: ["caller", "ConfirmDecision"], variables: { ...approvedStart, decision: text("approved"), echoedCustomer: text("Ada") } }],
      [14, { task: ["caller", "ConfirmDecision"], variables: { ...approvedStart, decision: text("approved"), echoedCustomer: text("Ada") } }],
    ]),
    // The reviewer's override is published by the review Sub-Process to the Process decision.
    completedAt: 16, final: { ...approvedStart, decision: text("referred"), echoedCustomer: text("Ada") },
  }],
  ["call-variable-mapping-loan-null-applicant", {
    at: new Map([
      [2, { effect: ["AcknowledgeApplication", { amount: text("9000") }], variables: nullApplicantStart }],
      [4, { task: ["called", "CollectDocument"], variables: nullApplicantStart }],
      [6, { task: ["called", "RecordVerdict"], variables: nullApplicantStart }],
      // CVM-IN-01: the present null applicant was copied as a present null and returned as one.
      [8, { task: ["caller", "ConfirmDecision"], variables: { ...nullApplicantStart, decision: text("approved"), echoedCustomer: nothing } }],
    ]),
    completedAt: 10, final: { ...nullApplicantStart, decision: text("approved"), echoedCustomer: nothing },
  }],
  ["call-variable-mapping-loan-unset-verdict", {
    at: new Map([
      [2, { effect: ["AcknowledgeApplication", { amount: text("25000") }], variables: unsetVerdictStart }],
      [4, { task: ["called", "CollectDocument"], variables: unsetVerdictStart }],
      [6, { task: ["called", "RecordVerdict"], variables: unsetVerdictStart }],
      // CVM-IN-01 and CVM-OUT-01: the absent applicant became a present null and the never-set verdict overwrote "old".
      [8, { task: ["caller", "ConfirmDecision"], variables: { amount: text("25000"), decision: nothing, echoedCustomer: nothing } }],
    ]),
    completedAt: 10, final: { amount: text("25000"), decision: nothing, echoedCustomer: nothing },
  }],
]);

const calledOf = (instanceId: string) => deriveCalledProcessInstanceId(instanceId, "VerifyIdentity", 1);

test("registers exactly the three schedules over the one retained loan application", async () => {
  assert.deepEqual(callVariableMappingPipelineCases.map(({ id }) => id), [...journeys.keys()]);
  for (const context of await loadAndCompileCases(callVariableMappingPipelineCases)) {
    const bytes = await readFile(new URL(`../../../${context.pipelineCase.bpmnRelativePath}`, import.meta.url));
    assert.equal(context.scenario.bpmn.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.ok(context.pipelineCase.bpmnRelativePath.endsWith("/loan-application.bpmn"), context.scenario.id);
    const overlay = await readFile(new URL(`../../../${context.pipelineCase.sourceOverlayRelativePath}`, import.meta.url));
    assert.equal(context.scenario.bpmn.sourceOverlay?.sha256, createHash("sha256").update(overlay).digest("hex"));
    assert.equal(context.scenario.id, context.pipelineCase.id);
    assert.equal(context.scenario.profile, SemanticProfileId.NestedEmbeddedScopeData);
    assert.equal(context.pipelineCase.cib, null);
    assert.equal(context.retainedEvidence, null, "standards-only schedules retain no answer");
    assert.equal(supportsSemanticProcessScenario(context.scenario, context.semanticProcess), true, context.scenario.id);
  }
});

test("each journey exposes the open waits and Process values the proposal derives across the Call", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(callVariableMappingPipelineCases)) {
    const journey = journeys.get(scenario.id)!;
    const instanceId = instanceIds[scenario.id as keyof typeof instanceIds];
    const result = runScenario(scenario, program);
    for (const [index, expected] of journey.at) {
      const state = stateAt(result.trace, index);
      const label = `${scenario.id} trace[${index}]`;
      assert.equal(state.status, ProcessStatus.Running, label);
      assert.equal(state.instanceId, instanceId, label);
      if (expected.effect !== undefined) {
        const [elementId, args] = expected.effect;
        assert.equal(state.openEffects.length, 1, `${label} opens one effect`);
        assert.deepEqual(state.openEffects[0]?.id, { processInstanceId: instanceId, elementId, activation: 1 }, label);
        assert.deepEqual(state.openEffects[0]?.arguments, bindings(args), `${label} arguments`);
        assert.deepEqual(state.openUserTasks, [], label);
      } else {
        const [host, elementId] = expected.task!;
        assert.deepEqual(state.openEffects, [], label);
        assert.deepEqual(state.openUserTasks.map(({ id }) => id),
          [{ processInstanceId: host === "caller" ? instanceId : calledOf(instanceId), elementId, activation: 1 }], label);
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

// A stimulus-order host queries open User Tasks at the initial wait, before delivering any stimulus; every loan journey
// first awaits the acknowledgement effect, so that wait holds no User Task even though the core opens one later.
test("the first-completion wait a stimulus-order host observes is the initial wait, not the later state that opens the task", async () => {
  for (const { pipelineCase, scenario, semanticProcess: program } of await loadAndCompileCases(callVariableMappingPipelineCases)) {
    const result = runScenario(scenario, program);
    const expected = hostInteractionExpectations(scenario, result, false, pipelineCase.executionSchedule, pipelineCase.expectedWaitTraceLength);
    assert.deepEqual(expected.openUserTasksAtFirstCompletionWait, stateAt(result.trace, pipelineCase.expectedWaitTraceLength - 1).openUserTasks, scenario.id);
    assert.deepEqual(expected.openUserTasksAtFirstCompletionWait, [], scenario.id);
  }
});

test("a refused completion leaves the predecessor state unchanged", async () => {
  const { scenario, semanticProcess: program } = (await loadAndCompileCases(callVariableMappingPipelineCases))
    .find(({ scenario: { id } }) => id === "call-variable-mapping-loan-approved")!;
  const trace = runScenario(scenario, program).trace;
  // CVM-REFUSE-01 (caller-addressed), CVM-TASK-01 (caller-only name) and the stale called completion after return.
  for (const [commandId, index] of [["refuse-caller-addressed-completion", 5], ["refuse-caller-only-name", 7], ["refuse-stale-record-verdict", 13]] as const) {
    const command = trace[index];
    assert.ok(command?.kind === CanonicalObservationKind.Command && command.commandId === commandId, commandId);
    assert.equal(command.outcome, CommandOutcome.Rejected, commandId);
    assert.deepEqual(stateAt(trace, index + 1), stateAt(trace, index - 1), `${commandId} must not move any observation`);
  }
});

test("public admission accepts each Start", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(callVariableMappingPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    assert.deepEqual(assessBpmnProcessAdmission(start, program), { kind: BpmnProcessAdmissionResultKind.Admitted });
  }
});

test("each named seeded mutation moves exactly the observation it names and fails on a miscalibrated result", async () => {
  const contexts = await loadAndCompileCases(callVariableMappingPipelineCases);
  assert.deepEqual([...new Set(Object.values(callVariableMappingMutations).map(({ rule }) => rule))].sort(),
    ["CVM-IN-01", "CVM-ISOLATE-01", "CVM-OUT-01", "CVM-REFUSE-01", "CVM-TASK-01"]);
  for (const [name, mutation] of Object.entries(callVariableMappingMutations)) {
    const { scenario, semanticProcess: program } = contexts.find(({ scenario: { id } }) => id === `call-variable-mapping-${mutation.scenario}`)!;
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
  for (const { pipelineCase, scenario } of await loadAndCompileCases(callVariableMappingPipelineCases)) {
    const carried = Object.values(callVariableMappingMutations).filter(({ scenario: target, inject, expected }) =>
      scenario.id === `call-variable-mapping-${target}` && inject === pipelineCase.injectMutation &&
      expected === pipelineCase.expectedInjectedDisagreement);
    assert.equal(carried.length, 1, scenario.id);
  }
});

test("the cross-target value matrix expects the loan application Start domain from the retained schedule", async () => {
  const cases = (await domainCases()).filter(({ scenario }) => scenario.id.startsWith("call-variable-mapping-loan-approved-"));
  assert.ok(cases.length >= 6, "the loan application must contribute its own matrix cases");
  for (const input of cases) {
    assert.equal(supportsSemanticProcessScenario(input.scenario as Scenario, input.context.semanticProcess), input.supported, input.scenario.id);
  }
  const supportedByLabel = new Map(cases.map(({ scenario, supported }) => [scenario.id.replace(/^call-variable-mapping-loan-approved-/u, ""), supported]));
  // CVM-START-01: an input source or output target is admitted; a called-only name, an output source and a missing
  // required name are not. CVM-IN-01: an absent or present-null Call source satisfies the Start.
  for (const [label, supported] of [["invalid-start-data-missing-required", false], ["invalid-start-data-called-only-name", false],
    ["invalid-start-data-output-source-name", false], ["valid-start-data-absent-call-source", true],
    ["valid-start-data-present-null-call-source", true], ["valid-start-data-output-target", true]] as const) {
    assert.equal(supportedByLabel.get(label), supported, label);
  }
});

function continues(program: SemanticProcessProgram, instanceId: string, state: RuntimeState): boolean {
  try {
    requireBpmnWorkflowContinuationStateV1(state, program, instanceId);
    return true;
  } catch {
    return false;
  }
}

test("every committed state owns the called frame exactly while a called task is open and survives continuation", async () => {
  for (const { scenario, semanticProcess: program } of await loadAndCompileCases(callVariableMappingPipelineCases)) {
    const start = scenario.stimuli[0];
    assert.ok(start?.kind === StimulusKind.StartProcess);
    const called = calledOf(start.instanceId);
    let state: RuntimeState = initialState;
    let callLive = false;
    for (const stimulus of scenario.stimuli) {
      state = applyStimulus(program, state, stimulus).state;
      const label = `${scenario.id} ${stimulus.commandId}`;
      assert.ok(isWellFormedRuntimeState(program, start.instanceId, state), `${label} state validity`);
      // CVM-RETIRE-01: a called-root frame without a live called task would be an orphan.
      const calledTaskOpen = state.userTaskWaits.some(({ id }) => id.processInstanceId === called);
      assert.equal(state.variables.scopes.some(({ owner }) => owner.processInstanceId === called), calledTaskOpen, `${label} called frame lifetime`);
      callLive ||= calledTaskOpen;
      // Continue-As-New carries only a running instance; the completed final state is outside its contract.
      if (state.control.kind === ControlStateKind.Running) assert.ok(continues(program, start.instanceId, state), `${label} continuation`);
    }
    assert.ok(callLive, `${scenario.id} reaches a state with a live called frame`);
    assert.deepEqual(state.variables.scopes, [], `${scenario.id} retires every frame with its scope (CVM-RETIRE-01)`);
  }
});
