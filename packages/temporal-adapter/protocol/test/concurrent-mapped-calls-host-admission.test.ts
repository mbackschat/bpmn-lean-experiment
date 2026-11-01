/**
 * Hosting preflight of the concurrent mapped Calls proposal: with both expert calls of the retained supplier onboarding
 * live, Continue-As-New restores the committed state with both called-root frames, refuses a frame without its called
 * root, a called root without its frame and a frame owned by the caller, and called-task detail shows each expert only
 * its own frame (CMCALL-IN-01, CVM-OBSERVE-01).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, SemanticProfileId, StimulusKind, VariableValueKind, applyStimulus, deriveCalledProcessInstanceId,
  initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";

import { projectUserTaskDetail, requireBpmnWorkflowContinuationStateV1 } from "../dist/index.js";

const instanceId = "Supplier_1";
const financial = deriveCalledProcessInstanceId(instanceId, "FinancialExpertOpinion", 1);
const compliance = deriveCalledProcessInstanceId(instanceId, "ComplianceExpertOpinion", 1);
const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;

async function supplierProgram(): Promise<SemanticProcessProgram> {
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("../../../../scenarios/concurrent-mapped-calls/supplier-onboarding.bpmn", import.meta.url)),
    sourceId: "supplier-onboarding-host", expectedSha256: undefined, sourceOverlay: null,
    semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion, limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled));
  return compiled.semanticProcess;
}

/** Both expert tasks open: the financial review prepares first, so its expert's task takes activation 1. */
function bothExpertsOpen(program: SemanticProcessProgram): RuntimeState {
  const stimuli: Stimulus[] = [
    { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId,
      initialVariables: [{ name: "supplierName", value: text("Acme") }] },
    ...["PrepareFinancialFile", "PrepareComplianceFile"].map((elementId): Stimulus => ({
      kind: StimulusKind.CompleteUserTaskInstance, commandId: elementId,
      taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [] })),
  ];
  return stimuli.reduce((state, stimulus) => {
    const result = applyStimulus(program, state, stimulus);
    assert.equal(result.outcome, CommandOutcome.Committed, stimulus.commandId);
    return result.state;
  }, initialState);
}

const withScopes = (state: RuntimeState, scopes: RuntimeState["variables"]["scopes"]): RuntimeState =>
  ({ ...state, variables: { ...state.variables, scopes } });

test("Continue-As-New restores both live called-root frames", async () => {
  const program = await supplierProgram();
  const state = bothExpertsOpen(program);
  assert.equal(state.variables.scopes.filter(({ owner }) => owner.processInstanceId !== instanceId).length, 2);
  assert.equal(requireBpmnWorkflowContinuationStateV1(state, program, instanceId), state);
});

test("Continue-As-New refuses a frame without its called root, a called root without its frame and a caller-owned frame",
  async () => {
    const program = await supplierProgram();
    const state = bothExpertsOpen(program);
    const complianceFrame = state.variables.scopes.find(({ owner }) => owner.processInstanceId === compliance)!;
    const others = state.variables.scopes.filter((frame) => frame !== complianceFrame);
    const mutations: Record<string, RuntimeState> = {
      "a frame without its called root": withScopes(state, [...others,
        { ...complianceFrame, owner: { ...complianceFrame.owner, processInstanceId: `${compliance}-gone` } }]
        .toSorted((left, right) => JSON.stringify(left.owner) < JSON.stringify(right.owner) ? -1 : 1)),
      "a called root without its frame": withScopes(state, others),
      "a frame owned by the caller's root": withScopes(state, [...state.variables.scopes,
        { owner: state.scopeOccurrences.find(({ parent }) => parent === null)!.id, bindings: [] }]),
    };
    for (const [label, mutated] of Object.entries(mutations)) {
      // The ownership rules refuse each, not the shape check that precedes them.
      assert.throws(() => requireBpmnWorkflowContinuationStateV1(mutated, program, instanceId),
        { name: "TypeError", message: "RuntimeState is not one representable committed state" }, label);
    }
  });

test("called-task detail shows each expert only its own called-root frame", async () => {
  const program = await supplierProgram();
  const state = bothExpertsOpen(program);
  const inputVariableNames = ["dossier", "screeningFile", "supplierName"];
  const detail = (processInstanceId: string, activation: number) => projectUserTaskDetail(state,
    { taskId: { processInstanceId, elementId: "GiveExpertOpinion", activation }, inputVariableNames })?.inputVariables;
  assert.deepEqual(detail(financial, 1), [{ name: "dossier", value: text("Acme") }]);
  assert.deepEqual(detail(compliance, 2), [{ name: "screeningFile", value: text("sanctions screening") }]);
});
