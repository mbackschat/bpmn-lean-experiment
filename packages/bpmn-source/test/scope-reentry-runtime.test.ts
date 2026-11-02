/**
 * The core journeys of the scope re-entry specification over the retained claim rework model (SRE-FRESH-01, SRE-INIT-01,
 * SRE-RETAIN-01, SRE-STALE-01, SRE-OUTPUT-01). Frame contents are runtime-only, so this test reads committed state
 * directly; every expected value is read off the proposal's witness-model account, not off a run.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, SemanticProfileId, StimulusKind, applyStimulus, initialState,
  isWellFormedRuntimeState,
} from "@bpmn-lean/semantic-core";
import type { BusinessValue, RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { text } from "./effect-data-fixture.ts";
import { inspectDamage, nest } from "./scope-reentry-fixture.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/scope-reentry/", import.meta.url);
const instanceId = "Claim_1";

const source = async (name: string): Promise<string> => readFile(new URL(`${name}.bpmn`, directory), "utf8");

async function program(name: string, xml?: string): Promise<SemanticProcessProgram> {
  const bytes = new TextEncoder().encode(xml ?? await source(name));
  const overlay = new Uint8Array(await readFile(new URL(`${name}-overlay.json`, directory)));
  const result = await compileBpmnToSemanticProcess({
    bytes, sourceId: name, expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: `${name}-handlers`, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: semanticProcessTestLimits,
  });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const bind = (name: string, value: BusinessValue): VariableBinding => ({ name, value });

function commit(claim: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus, id = instanceId): RuntimeState {
  const result = applyStimulus(claim, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.equal(result.ambiguousInternalChoice, false, JSON.stringify(stimulus));
  assert.equal(isWellFormedRuntimeState(claim, id, result.state), true, JSON.stringify(stimulus));
  return result.state;
}

/** A refused command leaves the complete predecessor state, frames and counters included, unchanged. */
function refusedUnchanged(claim: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): void {
  const result = applyStimulus(claim, state, stimulus);
  assert.notEqual(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.deepEqual(result.state, state);
}

const frames = (state: RuntimeState) =>
  state.variables.scopes.filter(({ owner }) => owner.definitionScopeId === "scope:AssessClaim");

const inspect = (activation: number, values: readonly VariableBinding[]): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `inspect-${activation}`,
  taskId: { processInstanceId: instanceId, elementId: "InspectDamage", activation }, submittedValues: values });

const price = (activation: number, quote: string): Stimulus => ({
  kind: StimulusKind.CompleteEffect, commandId: `price-${activation}`,
  effectId: { processInstanceId: instanceId, elementId: "PriceRepair", activation },
  result: { kind: EffectExecutionResultKind.Success, localPatch: [bind("quote", text(quote))] } });

const process = (state: RuntimeState) => state.variables.process.bindings;

test("a rework iteration re-enters Assess claim with a fresh occurrence, fresh locals and retained Process data", async () => {
  const claim = await program("claim-rework");
  let state = commit(claim, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_ClaimRework", instanceId, initialVariables: [bind("claimSummary", text("hail damage"))] });
  assert.deepEqual(frames(state).map(({ bindings }) => bindings),
    [[bind("decision", text("pending")), bind("notes", text("hail damage"))]]);
  const firstOwner = frames(state)[0]!.owner;

  state = commit(claim, state, inspect(1, [bind("decision", text("rework")), bind("notes", text("photos missing"))]));
  assert.deepEqual(state.effectWaits.map(({ id, arguments: args }) => [id.activation, args]),
    [[1, [bind("damage", text("photos missing"))]]]);
  state = commit(claim, state, price(1, "1200"));

  // SRE-FRESH-01 and SRE-INIT-01: iteration 2 owns a new occurrence whose locals come from its own entry.
  assert.deepEqual(frames(state).map(({ bindings }) => bindings),
    [[bind("decision", text("pending")), bind("notes", text("hail damage"))]]);
  assert.notDeepEqual(frames(state)[0]!.owner, firstOwner);
  assert.deepEqual(state.userTaskWaits.map(({ id }) => [id.elementId, id.activation]), [["InspectDamage", 2]]);
  // SRE-RETAIN-01 and SRE-OUTPUT-01: iteration 1's outputs stay at the Process.
  assert.deepEqual(process(state), [bind("assessment", text("rework")), bind("claimSummary", text("hail damage")),
    bind("repairQuote", text("1200"))]);

  // SRE-STALE-01: iteration 1's task and effect cannot settle iteration 2.
  refusedUnchanged(claim, state, inspect(1, [bind("decision", text("approve"))]));
  state = commit(claim, state, inspect(2, [bind("decision", text("approve"))]));
  assert.deepEqual(state.effectWaits.map(({ id, arguments: args }) => [id.activation, args]),
    [[2, [bind("damage", text("hail damage"))]]]);
  refusedUnchanged(claim, state, price(1, "999"));
  state = commit(claim, state, price(2, "800"));

  assert.deepEqual(frames(state), []);
  assert.deepEqual(state.userTaskWaits.map(({ id }) => [id.elementId, id.activation]), [["ApproveSettlement", 1]]);
  assert.deepEqual(process(state), [bind("assessment", text("approve")), bind("claimSummary", text("hail damage")),
    bind("repairQuote", text("800"))]);
});

test("the admitted burst of eight equals the scheduler's actual closure after a rework", async () => {
  const claim = await program("claim-rework", nest(await source("claim-rework"), inspectDamage, "InspectDamage", 2));
  let state = commit(claim, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_ClaimRework", instanceId, initialVariables: [bind("claimSummary", text("hail damage"))] });
  state = commit(claim, state, inspect(1, [bind("decision", text("rework"))]));
  // Body End and completion, Choice, Merge, three entries and the arming of iteration 2's Inspect damage.
  const result = (limit: number) => applyStimulus(claim, state, price(1, "1200"), limit);
  assert.equal(result(8).outcome, CommandOutcome.Committed);
  assert.equal(result(7).outcome, CommandOutcome.RolledBack);
  assert.equal(result(7).internalStepBoundExceeded, true);
});

test("the admitted burst of eight equals the scheduler's actual closure after a called-side resumption", async () => {
  const contract = await program("contract-revision",
    nest(await source("contract-revision"), '<userTask id="EditDraft" name="Edit draft" />', "EditDraft", 2));
  const id = "Contract_1";
  let state = commit(contract, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_ContractRevision", instanceId: id, initialVariables: [bind("contractText", text("v1"))] }, id);
  state = commit(contract, state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "edit-1",
    taskId: { processInstanceId: id, elementId: "EditDraft", activation: 1 }, submittedValues: [] }, id);
  const review = state.userTaskWaits.find(({ id: task }) => task.elementId === "ReviewClauses")!.id;
  // Called End and return, Choice, Merge, three entries and the arming of iteration 2's Edit draft.
  const result = (limit: number) => applyStimulus(contract, state, { kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "review-1", taskId: review, submittedValues: [bind("verdict", text("revise"))] }, limit);
  assert.equal(result(8).outcome, CommandOutcome.Committed);
  assert.equal(result(7).outcome, CommandOutcome.RolledBack);
  assert.equal(result(7).internalStepBoundExceeded, true);
});

test("a revision re-invokes Legal review with a fresh called instance and refuses the earlier review", async () => {
  const contract = await program("contract-revision");
  const id = "Contract_1";
  const review = (activation: number, verdict: string, calledInstance: string): Stimulus => ({
    kind: StimulusKind.CompleteUserTaskInstance, commandId: `review-${activation}`,
    taskId: { processInstanceId: calledInstance, elementId: "ReviewClauses", activation },
    submittedValues: [bind("verdict", text(verdict))] });
  const edit = (activation: number, draft: string): Stimulus => ({
    kind: StimulusKind.CompleteUserTaskInstance, commandId: `edit-${activation}`,
    taskId: { processInstanceId: id, elementId: "EditDraft", activation }, submittedValues: [bind("draft", text(draft))] });
  const openReview = (state: RuntimeState) => state.userTaskWaits.find(({ id: task }) => task.elementId === "ReviewClauses")!.id;
  let state = commit(contract, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_ContractRevision", instanceId: id, initialVariables: [bind("contractText", text("v1"))] }, id);
  state = commit(contract, state, edit(1, "v2"), id);
  const first = openReview(state);
  const firstFrame = state.variables.scopes.filter(({ owner }) => owner.processInstanceId === first.processInstanceId);
  assert.deepEqual(firstFrame.map(({ bindings }) => bindings), [[bind("text", text("v2"))]]);
  state = commit(contract, state, review(first.activation, "revise", first.processInstanceId), id);
  assert.deepEqual(state.variables.process.bindings, [bind("contractText", text("v2")), bind("legalVerdict", text("revise"))]);
  state = commit(contract, state, edit(2, "v3"), id);
  const second = openReview(state);
  assert.notEqual(second.processInstanceId, first.processInstanceId);
  assert.deepEqual(state.variables.scopes.filter(({ owner }) => owner.processInstanceId === second.processInstanceId)
    .map(({ bindings }) => bindings), [[bind("text", text("v3"))]]);
  assert.deepEqual(state.variables.scopes.filter(({ owner }) => owner.processInstanceId === first.processInstanceId), []);
  refusedUnchanged(contract, state, review(first.activation, "sign", first.processInstanceId));
  state = commit(contract, state, review(second.activation, "sign", second.processInstanceId), id);
  assert.deepEqual(state.userTaskWaits.map(({ id: task }) => task.elementId), ["SignContract"]);
  assert.deepEqual(state.variables.process.bindings, [bind("contractText", text("v3")), bind("legalVerdict", text("sign"))]);
});
