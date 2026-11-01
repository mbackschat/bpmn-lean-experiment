/**
 * The core journeys of the concurrent mapped Calls proposal over its retained models (CMCALL-IN-01, CMCALL-OWN-01,
 * CMCALL-OUT-01, CMCALL-TASK-01, CMCALL-ISOLATE-01, CMCALL-PREPARE-01, CMCALL-REFUSE-01). Frames are runtime-only, so this
 * test reads committed state directly; every expected value is read off the proposal's separating-witness table.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, StimulusKind, VariableValueKind, applyInternalOperationStep, applyStimulus,
  deriveCalledProcessInstanceId, initialState, isWellFormedRuntimeState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";
import { admittedInternalPrefix } from "../../semantic-core/test/internal-operation-prefix-fixture.ts";
const { PreparedInternalTransitionFamily, applyPreparedInternalTransition, deriveInternalTransitionPreparation,
  preparedInternalTransitionsAreIndependent } = await import(
  new URL("../../semantic-core/dist/internal-transition-batch.js", import.meta.url).href) as
  typeof import("../../semantic-core/src/internal-transition-batch.ts");

const semanticProfile = "cibseven-2.2.0-embedded-subprocess-completion-draft";
const directory = new URL("../../../scenarios/concurrent-mapped-calls/", import.meta.url);

async function program(name: string): Promise<SemanticProcessProgram> {
  const result = await compileBpmnToSemanticProcess({
    bytes: new Uint8Array(await readFile(new URL(`${name}.bpmn`, directory))), sourceId: name,
    expectedSha256: undefined, semanticProfile, sourceOverlay: null, limits: semanticProcessTestLimits,
  });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;
const nullValue = { kind: VariableValueKind.Null } as const;
const bind = (name: string, value: VariableBinding["value"]): VariableBinding => ({ name, value });
const instanceId = "Instance_1";

function commit(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.equal(result.ambiguousInternalChoice, false, JSON.stringify(stimulus));
  assert.equal(isWellFormedRuntimeState(program, instanceId, result.state), true, JSON.stringify(stimulus));
  return result.state;
}

function rejected(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus, label: string): void {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Rejected, label);
  assert.deepEqual(result.state, state, label);
}

const start = (processId: string, initialVariables: readonly VariableBinding[]): Stimulus =>
  ({ kind: StimulusKind.StartProcess, commandId: "start", processId, instanceId, initialVariables });
const complete = (processInstanceId: string, elementId: string, activation: number,
  submittedValues: readonly VariableBinding[] = []): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${processInstanceId}-${elementId}-${activation}`,
  taskId: { processInstanceId, elementId, activation }, submittedValues,
});
const frameOf = (state: RuntimeState, processInstanceId: string, definitionScopeId: string) =>
  state.variables.scopes.find(({ owner }) =>
    owner.processInstanceId === processInstanceId && owner.definitionScopeId === definitionScopeId)?.bindings;

const financial = deriveCalledProcessInstanceId(instanceId, "FinancialExpertOpinion", 1);
const compliance = deriveCalledProcessInstanceId(instanceId, "ComplianceExpertOpinion", 1);
const expert = "scope:Process_ExpertOpinion";

/** Starts supplier onboarding and invokes the financial expert first, so its task takes activation 1. */
function bothExpertsOpen(supplier: SemanticProcessProgram): RuntimeState {
  let state = commit(supplier, initialState, start("Process_SupplierOnboarding", [bind("supplierName", text("Acme"))]));
  state = commit(supplier, state, complete(instanceId, "PrepareFinancialFile", 1));
  state = commit(supplier, state, complete(instanceId, "PrepareComplianceFile", 1));
  // CMCALL-IN-01: each frame holds exactly its own Call's input target, read from its own review's `file`.
  assert.deepEqual(frameOf(state, financial, expert), [bind("dossier", text("Acme"))]);
  assert.deepEqual(frameOf(state, compliance, expert), [bind("screeningFile", text("sanctions screening"))]);
  return state;
}

for (const complianceFirst of [true, false]) {
  test(`CMCALL-OWN-01 and CMCALL-OUT-01: each expert's answer lands in its own review, ${
    complianceFirst ? "compliance" : "financial"} expert first`, async () => {
    const supplier = await program("supplier-onboarding");
    let state = bothExpertsOpen(supplier);
    const answers = [
      complete(compliance, "GiveExpertOpinion", 2, [bind("finding", text("clear"))]),
      complete(financial, "GiveExpertOpinion", 1, [bind("opinion", text("solvent"))]),
    ];
    for (const answer of complianceFirst ? answers : answers.reverse()) state = commit(supplier, state, answer);
    assert.equal(state.calledProcessOccurrences.length, 0);
    assert.equal(state.variables.scopes.length, 0);
    assert.deepEqual(state.variables.process.bindings, [
      bind("complianceVerdict", text("clear")), bind("financialVerdict", text("solvent")), bind("supplierName", text("Acme")),
    ]);
    state = commit(supplier, state, complete(instanceId, "ApproveSupplier", 1));
    assert.equal(state.control.kind, "completed");
  });
}

test("CMCALL-TASK-01, CMCALL-ISOLATE-01 and CMCALL-REFUSE-01 keep each called instance to its own names", async () => {
  const supplier = await program("supplier-onboarding");
  let state = bothExpertsOpen(supplier);
  rejected(supplier, state, complete(financial, "GiveExpertOpinion", 1, [bind("finding", text("x"))]),
    "the compliance Call's output source on the financial task");
  rejected(supplier, state, complete(compliance, "GiveExpertOpinion", 2, [bind("opinion", text("x"))]),
    "the financial Call's output source on the compliance task");
  rejected(supplier, state, complete(compliance, "GiveExpertOpinion", 1), "the financial task under the compliance identity");
  rejected(supplier, state, complete(instanceId, "GiveExpertOpinion", 1), "a called task under the caller identity");
  rejected(supplier, state, complete(financial, "GiveExpertOpinion", 1, [bind("verdict", text("x"))]),
    "a caller-frame name on a called task");

  // A called patch on one instance leaves the other called frame and review frame unchanged; its return completes the
  // Financial review, so the Process gains exactly that review's published verdict and no called name.
  const before = state;
  state = commit(supplier, state, complete(financial, "GiveExpertOpinion", 1,
    [bind("dossier", text("Acme revised")), bind("opinion", text("solvent"))]));
  assert.deepEqual(frameOf(state, compliance, expert), frameOf(before, compliance, expert));
  assert.deepEqual(frameOf(state, instanceId, "scope:ComplianceReview"), frameOf(before, instanceId, "scope:ComplianceReview"));
  assert.deepEqual(state.variables.process.bindings,
    [bind("financialVerdict", text("solvent")), bind("supplierName", text("Acme"))]);
  rejected(supplier, state, complete(financial, "GiveExpertOpinion", 1, [bind("opinion", text("late"))]),
    "the returned financial instance's task");
});

test("CMCALL-PREPARE-01: travel request's Start commits two mapped invocations and the Booking entry as one batch",
  async () => {
    const travel = await program("travel-request");
    const state = commit(travel, initialState, start("Process_TravelRequest", [bind("approvedBudget", text("1200"))]));
    const budget = deriveCalledProcessInstanceId(instanceId, "BudgetCheck", 1);
    const visa = deriveCalledProcessInstanceId(instanceId, "VisaCheck", 1);
    // CMCALL-START-01: the absent traveller becomes a present null in both called frames.
    assert.deepEqual(frameOf(state, budget, "scope:Process_BudgetCheck"), [bind("traveller", nullValue)]);
    assert.deepEqual(frameOf(state, visa, "scope:Process_VisaCheck"), [bind("traveller", nullValue)]);
    assert.deepEqual(frameOf(state, instanceId, "scope:Booking"), [bind("budget", text("1200"))]);
    assert.deepEqual(state.userTaskWaits.map(({ id }) => [id.processInstanceId, id.elementId]).sort(), [
      [budget, "CheckBudget"], [visa, "CheckVisa"], [instanceId, "BookTravel"],
    ].sort());
  });

test("each prepared mapped invocation equals the evaluator's invocation, and the fork's members are independent",
  async () => {
    const travel = await program("travel-request");
    const operationAt = (elementId: string, kind: string) => travel.operations.find(operation =>
      operation.kind === kind && operation.origin.elementId === elementId)!;
    const members = [operationAt("BudgetCheck", "invokeProcess"), operationAt("VisaCheck", "invokeProcess"),
      operationAt("Booking", "enterScope")];
    const state = admittedInternalPrefix(travel, initialState,
      start("Process_TravelRequest", [bind("approvedBudget", text("1200"))]),
      [operationAt("TravelRequested", "initiate").id, operationAt("PreparationFork", "duplicate").id],
      members.map(({ id }) => id));
    const root = state.scopeOccurrences.find(({ parent }) => parent === null)!.id;
    const prepared = members.map(operation => deriveInternalTransitionPreparation(travel, state, { operation, owner: root }));
    for (const [index, member] of prepared.entries()) {
      assert.ok(member !== null);
      assert.equal(member.family, index < 2 ? PreparedInternalTransitionFamily.MappedInvocation
        : PreparedInternalTransitionFamily.DeclaredScopeEntry);
      assert.deepEqual(applyPreparedInternalTransition(travel, state, member),
        applyInternalOperationStep(travel, members[index]!, state)?.successor);
    }
    for (const [left, right] of [[0, 1], [0, 2], [1, 2]] as const) {
      assert.equal(preparedInternalTransitionsAreIndependent(prepared[left]!, prepared[right]!), true, `${left}/${right}`);
    }
  });
