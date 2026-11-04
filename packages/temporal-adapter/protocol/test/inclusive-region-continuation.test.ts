/**
 * Locks the continuation reader's widening for Inclusive regions (IGR, Temporal preflight of the
 * [Inclusive regions specification](../../../../docs/capsules/INCLUSIVE-GATEWAY-REGIONS-SPEC.md#temporal-hosting-and-refinement-preflight)):
 * a carried selection record of three expected inputs, which the account opening's all-checks journey creates, restores
 * unchanged, while the same record with one input duplicated is malformed. The state is the engine's own stable state
 * after *Assess applicant*, so a refusal can only come from the edited record.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CommandOutcome, SemanticProfileId, StimulusKind, VariableValueKind, applyStimulus, initialState } from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import { requireBpmnWorkflowContinuationStateV1 } from "../dist/index.js";

const instanceId = "AccountOpening_continuation";
const scenarios = new URL("../../../../scenarios/inclusive-gateway-regions/", import.meta.url);
const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;

async function allChecksSelected(): Promise<{ program: SemanticProcessProgram; state: RuntimeState }> {
  const overlay = await readFile(new URL("account-opening-overlay.json", scenarios));
  const compiled = await compileBpmnToSemanticProcess({ bytes: await readFile(new URL("account-opening.bpmn", scenarios)),
    sourceId: "account-opening", expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "account-opening-handlers",
      sha256: "e5207d32461c6821394dc608bd1f70635a737b82bcf340c3babe7d148b081b4e", bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 } });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
  const program = compiled.semanticProcess;
  const started = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_AccountOpening", instanceId, initialVariables: [{ name: "application", value: text("ACC-1") }] });
  assert.equal(started.outcome, CommandOutcome.Committed);
  const assessed = applyStimulus(program, started.state, { kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "assess", taskId: { processInstanceId: instanceId, elementId: "AssessApplicantTask", activation: 1 },
    submittedValues: [{ name: "channel", value: text("online") }, { name: "residency", value: text("foreign") },
      { name: "riskRating", value: text("high") }] });
  assert.equal(assessed.outcome, CommandOutcome.Committed);
  return { program, state: assessed.state };
}

test("a carried selection record of three expected inputs restores unchanged", async () => {
  const { program, state } = await allChecksSelected();
  assert.deepEqual(state.selectedBranchSets.map(({ expectedInputs }) => expectedInputs.length), [3]);
  assert.deepEqual(requireBpmnWorkflowContinuationStateV1(state, program, instanceId), state);
});

test("the same record with one expected input duplicated is malformed", async () => {
  const { program, state } = await allChecksSelected();
  const [record] = state.selectedBranchSets;
  assert.ok(record !== undefined);
  const [first, , third] = record.expectedInputs;
  const duplicated: RuntimeState = { ...state,
    selectedBranchSets: [{ ...record, expectedInputs: [first!, first!, third!] }] };
  assert.throws(() => requireBpmnWorkflowContinuationStateV1(duplicated, program, instanceId),
    /Malformed committed RuntimeState continuation/u);
});
