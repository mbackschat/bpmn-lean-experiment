/**
 * The core journey of the supplier onboarding model (CALLN-INVOKE-01, CALLN-RETURN-01, CALLN-NEST-01,
 * CALLN-OUTSIDE-01, CALLN-IDENTITY-01, CALLN-REFUSE-01). The oracle is the repeated, nested and concurrent Calls
 * proposal's stable rules; call records are runtime-only, so this test reads committed state directly.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ControlStateKind, SemanticProfileId, StimulusKind, applyStimulus, deriveCalledProcessInstanceId,
  initialState, isWellFormedRuntimeState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { forest, forked, serial } from "./call-forest-fixture.ts";

const directory = new URL("../../../scenarios/repeated-nested-concurrent-calls/", import.meta.url);
const instanceId = "Supplier_1";
const tax = deriveCalledProcessInstanceId(instanceId, "CallActivity_TaxApproval", 1);
const bank = deriveCalledProcessInstanceId(instanceId, "CallActivity_BankApproval", 1);
const risk = deriveCalledProcessInstanceId(instanceId, "CallActivity_ReviewRisk", 1);
const compliance = deriveCalledProcessInstanceId(risk, "CallActivity_CheckCompliance", 1);
const final = deriveCalledProcessInstanceId(instanceId, "CallActivity_FinalApproval", 1);

async function supplierProgram(): Promise<SemanticProcessProgram> {
  return program(new Uint8Array(await readFile(new URL("supplier-onboarding.bpmn", directory))));
}

async function program(bytes: Uint8Array): Promise<SemanticProcessProgram> {
  const result = await compileBpmnToSemanticProcess({
    bytes, sourceId: "supplier-onboarding",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion, sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const start: Stimulus = {
  kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_SupplierOnboarding", instanceId,
  initialVariables: [],
};
const complete = (processInstanceId: string, task: string, activation: number): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${processInstanceId}-${task}-${activation}`,
  taskId: { processInstanceId, elementId: `UserTask_${task}`, activation }, submittedValues: [],
});

function commit(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.equal(isWellFormedRuntimeState(program, instanceId, result.state), true, JSON.stringify(stimulus));
  return result.state;
}

function rejected(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus, label: string): void {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Rejected, label);
  assert.deepEqual(result.state, state, label);
}

/** The open User Tasks as `instance task activation`, sorted. */
const waits = (state: RuntimeState): string[] => state.userTaskWaits
  .map(({ id }) => `${id.processInstanceId} ${id.elementId.replace("UserTask_", "")} ${id.activation}`).sort();
const recordsOf = (state: RuntimeState, processInstanceId: string) => [
  ...state.calledProcessOccurrences.filter(({ calledRoot }) => calledRoot.processInstanceId === processInstanceId),
  ...state.scopeOccurrences.filter(({ id }) => id.processInstanceId === processInstanceId),
  ...state.userTaskWaits.filter(({ id }) => id.processInstanceId === processInstanceId),
  ...state.controlTokens.filter(({ owner }) => owner.processInstanceId === processInstanceId),
];

/** Runs to the state where both approval calls wait at Prepare approval. */
async function bothApprovalsLive(): Promise<readonly [SemanticProcessProgram, RuntimeState]> {
  const program = await supplierProgram();
  let state = commit(program, initialState, start);
  state = commit(program, state, complete(instanceId, "RegisterSupplier", 1));
  state = commit(program, state, complete(instanceId, "CollectTaxDocuments", 1));
  state = commit(program, state, complete(instanceId, "CollectBankDetails", 1));
  return [program, state];
}

test("CALLN-RETURN-01 returns each concurrent approval into its own branch, the later one firing the join", async () => {
  const [program, live] = await bothApprovalsLive();
  // CALLN-IDENTITY-01: two instances of one definition, distinct identities, activations in commit order.
  assert.deepEqual(waits(live), [`${tax} PrepareApproval 1`, `${bank} PrepareApproval 2`].sort());
  let state = commit(program, live, complete(bank, "PrepareApproval", 2));
  const taxBefore = recordsOf(state, tax);
  state = commit(program, state, complete(bank, "Approve", 1));
  // CALLN-OUTSIDE-01: the bank instance's progress and return leave the tax instance exactly as it was.
  assert.deepEqual(recordsOf(state, tax), taxBefore);
  assert.deepEqual(recordsOf(state, bank), []);
  assert.deepEqual(waits(state), [`${tax} PrepareApproval 1`]);
  assert.deepEqual(state.controlTokens.map(({ placeId, owner }) => [placeId, owner.processInstanceId]),
    [["place:Flow_BankApprovalToApprovalJoin", instanceId]]);
  // CALLN-REFUSE-01: a returned instance's task, a cross-addressed and a caller-addressed completion are rejected.
  state = commit(program, state, complete(tax, "PrepareApproval", 1));
  rejected(program, state, complete(bank, "Approve", 1), "returned instance");
  rejected(program, state, complete(tax, "Approve", 1), "bank activation under the tax identity");
  rejected(program, state, complete(instanceId, "Approve", 2), "caller identity");
  state = commit(program, state, complete(tax, "Approve", 2));
  assert.deepEqual(waits(state), [`${risk} AssessRisk 1`]);
  assert.deepEqual(state.calledProcessOccurrences.map(({ id }) => id.elementId), ["CallActivity_ReviewRisk"]);
});

test("CALLN-RETURN-01 in the natural order returns the tax approval first and the bank approval fires the join", async () => {
  const [program, live] = await bothApprovalsLive();
  let state = commit(program, live, complete(tax, "PrepareApproval", 1));
  state = commit(program, state, complete(tax, "Approve", 1));
  assert.deepEqual(waits(state), [`${bank} PrepareApproval 2`]);
  state = commit(program, state, complete(bank, "PrepareApproval", 2));
  state = commit(program, state, complete(bank, "Approve", 2));
  assert.deepEqual(waits(state), [`${risk} AssessRisk 1`]);
});

test("CALLN-NEST-01 keeps the risk review live under its compliance call, then returns inner before outer", async () => {
  const [program, live] = await bothApprovalsLive();
  let state = live;
  for (const stimulus of [complete(tax, "PrepareApproval", 1), complete(tax, "Approve", 1),
    complete(bank, "PrepareApproval", 2), complete(bank, "Approve", 2), complete(risk, "AssessRisk", 1)]) {
    state = commit(program, state, stimulus);
  }
  // CALLN-INVOKE-01: the nested call's caller is the risk review's called root, its identity derived from that instance.
  const nested = state.calledProcessOccurrences.find(({ id }) => id.elementId === "CallActivity_CheckCompliance");
  assert.deepEqual(nested?.caller, { processInstanceId: risk, definitionScopeId: "scope:Process_SupplierRiskReview", activation: 1 });
  assert.equal(nested?.calledRoot.processInstanceId, compliance);
  assert.deepEqual(waits(state), [`${compliance} ScreenSanctions 1`]);
  assert.equal(state.userTaskWaits.some(({ id }) => id.processInstanceId === risk), false);
  assert.equal(state.scopeOccurrences.some(({ id }) => id.processInstanceId === risk), true);
  // Both returns run in one closure, then Final approval invokes the third Four-eyes instance.
  state = commit(program, state, complete(compliance, "ScreenSanctions", 1));
  assert.deepEqual(state.calledProcessOccurrences.map(({ id }) => id.elementId), ["CallActivity_FinalApproval"]);
  assert.deepEqual(waits(state), [`${final} PrepareApproval 3`]);
  state = commit(program, state, complete(final, "PrepareApproval", 3));
  state = commit(program, state, complete(final, "Approve", 3));
  assert.equal(state.control.kind, ControlStateKind.Completed);
  assert.deepEqual(state.calledProcessOccurrences, []);
});

test("CALLN-INVOKE-01 batches two nested invocations from two called roots in the Start closure", async () => {
  const batched = await program(new TextEncoder().encode(forest({
    P0: forked(["P1"], ["P2"]), P1: serial("P3"), P2: serial("P4"), P3: serial("T"), P4: serial("T"),
  })));
  const first = deriveCalledProcessInstanceId(instanceId, "P0_B0V0", 1);
  const second = deriveCalledProcessInstanceId(instanceId, "P0_B1V0", 1);
  const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: "P0", instanceId, initialVariables: [] };
  let state = commit(batched, initialState, start);
  assert.deepEqual(state.calledProcessOccurrences.map(({ caller, calledRoot }) =>
    [caller.processInstanceId, calledRoot.processInstanceId]).sort(), [
    [instanceId, first], [instanceId, second],
    [first, deriveCalledProcessInstanceId(first, "P1_V0", 1)], [second, deriveCalledProcessInstanceId(second, "P2_V0", 1)],
  ].sort());
  for (const wait of [...state.userTaskWaits]) {
    state = commit(batched, state, {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${wait.id.processInstanceId}`, taskId: wait.id,
      submittedValues: [],
    });
  }
  assert.equal(state.control.kind, ControlStateKind.Completed);
});
