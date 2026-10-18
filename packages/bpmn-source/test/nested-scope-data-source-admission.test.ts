/**
 * Retained boundary witnesses for the nested embedded scope-data profile (NSD-ADMIT-01), driven through the exact-bytes
 * source path and then the core's checked-graph and Program gates. The oracle is the capsule's "Required, optional and
 * excluded scope" account and the independent Lean admission, which bounds depth and declarations but not the number
 * of definition scopes. Every refusal is paired with a control that differs in exactly one fact, so a gate that
 * refused everything could not pass.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BpmnCompilationStatus, BpmnSourceDiagnosticCode, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind, EffectExecutionResultKind, ObservationRequestKind, ProcessStatus, ScenarioDocumentKind,
  StimulusKind, isWellFormedSemanticProcessProgram, nestedScopeCheckedAnalysis, nestedScopeCheckedShape,
  nestedScopeProgramAnalysis, nestedScopeProgramShape, runScenario, supportsSemanticProcessScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import {
  forkingSubProcess, literalModel, nestedAdmissionRefusal, nestedSubProcesses, outputModel, processOf, request,
  siblingSubProcesses,
} from "./nested-scope-data-source-fixture.ts";

async function compile(xml: string) {
  return compileBpmnToSemanticProcess(request(xml));
}

/** The diagnostic evidence of a refused model, so a test can name which gate refused it. */
async function refusalEvidence(xml: string): Promise<string> {
  const result = await compile(xml);
  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.deepEqual(result.diagnostics.map(({ code }) => code), [BpmnSourceDiagnosticCode.UnsupportedModel]);
  return result.diagnostics[0]!.evidence;
}

async function assertAdmitted(label: string, xml: string): Promise<void> {
  const result = await compile(xml);
  assert.equal(result.status, BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
}

test("NSD-ADMIT-01 admits four sibling Sub-Processes, five definition scopes at depth one, through the source path and both core gates", async () => {
  const result = await compile(siblingSubProcesses(4));
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const { checkedProcess, semanticProcess } = result;
  assert.equal(checkedProcess.definitionScopes.length, 5);
  assert.equal(semanticProcess.definitionScopes.length, 5);
  assert.deepEqual(nestedScopeCheckedAnalysis(checkedProcess), []);
  assert.equal(nestedScopeCheckedShape(checkedProcess.nodes, 5), true);
  assert.deepEqual(nestedScopeProgramAnalysis(semanticProcess), []);
  assert.equal(nestedScopeProgramShape(semanticProcess.operations, 5), true);
  assert.equal(isWellFormedSemanticProcessProgram(semanticProcess), true);
  // The lower bound stays: a Process with no Sub-Process has a single scope and is outside the profile.
  assert.equal(nestedScopeCheckedShape(checkedProcess.nodes, 1), false);
  assert.equal(nestedScopeProgramShape(semanticProcess.operations, 1), false);
});

test("NSD-ADMIT-01 runs the five-scope sibling Process as a supported scenario through every Sub-Process to Completed", async () => {
  const result = await compile(siblingSubProcesses(4));
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const { identity } = result.semanticProcess;
  const instanceId = "siblings";
  const scenario = {
    kind: ScenarioDocumentKind.Scenario, id: "nested-witness-siblings", profile: identity.semanticProfile,
    bpmn: { id: identity.sourceId, relativePath: "nested-witness.bpmn", sha256: identity.sourceSha256, sourceOverlay: identity.sourceOverlay },
    // The profile uses the baseline observation list, which a supported scenario must carry in full and in order.
    observations: [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults, ObservationRequestKind.ProcessStatus,
      ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks, ObservationRequestKind.OpenTimers,
      ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables, ObservationRequestKind.EnabledInteractions,
      ObservationRequestKind.LogicalTime],
    provenance: { normativeRefs: [], cibRevision: "none", cibRefs: [] },
    stimuli: [
      { kind: StimulusKind.StartProcess, commandId: "start", processId: "P", instanceId, initialVariables: [] },
      ...[1, 2, 3, 4].map(index => ({
        kind: StimulusKind.CompleteEffect, commandId: `complete-${index}`,
        effectId: { processInstanceId: instanceId, elementId: `S${index}t`, activation: 1 },
        result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
      }) as const),
    ],
  } as const satisfies Scenario;
  assert.equal(supportsSemanticProcessScenario(scenario, result.semanticProcess), true);
  const last = runScenario(scenario, result.semanticProcess).trace.at(-1);
  assert.ok(last?.kind === CanonicalObservationKind.State);
  assert.equal(last.status, ProcessStatus.Completed);
});

test("NSD-ADMIT-01 refuses a Parallel fork inside an embedded scope while the serial body of the same Sub-Process is admitted", async () => {
  await assertAdmitted("serial body", literalModel("x"));
  assert.equal(await refusalEvidence(processOf([forkingSubProcess("S1")])), "The flow element is outside the nested scope-data contract.");
});

test("NSD-ADMIT-01 admits a Sub-Process three levels below the root and refuses the fourth level at checked-graph admission", async () => {
  await assertAdmitted("depth 1", nestedSubProcesses(1));
  await assertAdmitted("depth 3", nestedSubProcesses(3));
  // The source reader reads one level past the limit, so this refusal is the core analysis's depth bound, not the reader's.
  assert.equal(await refusalEvidence(nestedSubProcesses(4)), nestedAdmissionRefusal);
});

test("NSD-ADMIT-01 admits a scope output naming its own declared local and refuses one naming a parent-scope variable", async () => {
  await assertAdmitted("own local", outputModel("${a}"));
  assert.equal(await refusalEvidence(outputModel("${parentName}")), nestedAdmissionRefusal);
});

test("NSD-ADMIT-01 admits a local literal of exactly 1024 UTF-8 bytes and refuses 1025, counting bytes rather than characters", async () => {
  await assertAdmitted("1024 bytes", literalModel("x".repeat(1024)));
  assert.equal(await refusalEvidence(literalModel("x".repeat(1025))), nestedAdmissionRefusal);
  // Two bytes per character: 512 characters fill the limit and 513 characters are over it although fewer than 1024.
  await assertAdmitted("512 two-byte characters", literalModel("é".repeat(512)));
  assert.equal(await refusalEvidence(literalModel("é".repeat(513))), nestedAdmissionRefusal);
});
