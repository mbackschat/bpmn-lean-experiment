/**
 * DTB-ADMIT-01, DTB-COMMUTE-01 and DTB-PROFILE-01 through the exact-bytes source path. The oracle is the data-declaring
 * terminal branches proposal's witness account: the expense claim compiles at both levels within the closure limit, its
 * journey commits every command without an ambiguous internal choice while *Review claim*'s `verdict` stays in its own
 * frame, and the pass-vertex-free minimal pair is refused under the embedded completion identity only by the cut.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ControlStateKind, SemanticProfileId, StimulusKind, applyStimulus, initialState,
  isWellFormedRuntimeState, nestedScopeControlCheckedAnalysis, nestedScopeControlProgramAnalysis,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { CheckedProcess, RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const scenarios = new URL("../../../scenarios/", import.meta.url);
const activity = "urn:bpmn-lean:effect-protocol:activity-v1";

function overlay(semanticProfile: string, delegate: string) {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id: "model-handlers", semanticProfile,
    effectBindings: [{ source: { implementation: activity, delegateExpression: `\${${delegate}}` },
      descriptor: { protocol: activity, operation: delegate } }], inertAttributes: [] }));
  return { id: "model-handlers", sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(xml: string, semanticProfile: string, delegate: string) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "model", expectedSha256: undefined,
    semanticProfile, sourceOverlay: overlay(semanticProfile, delegate), limits: semanticProcessTestLimits });
}

const controlGraph = (graph: CheckedProcess) => ({ ...graph, flows: graph.sequenceFlows });

/** Compiles under the nested scope-data profile and returns both analyses' bursts. */
async function admitted(xml: string, delegate: string, label: string) {
  const result = await compile(xml, SemanticProfileId.NestedEmbeddedScopeData, delegate);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  return { result, checked: nestedScopeControlCheckedAnalysis(controlGraph(result.checkedProcess)),
    program: nestedScopeControlProgramAnalysis(result.semanticProcess) };
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

test("DTB-ADMIT-01 admits the expense claim at both levels at the closure limit", async () => {
  const xml = await readFile(new URL("data-declaring-terminal-branches/expense-claim.bpmn", scenarios), "utf8");
  const { result, checked, program } = await admitted(xml, "checkClaimPolicy", "expense claim");
  assert.equal(checked, 8, "checked burst");
  assert.equal(program, 8, "Program burst");
  assert.ok((result.semanticProcess.scopeLocalData ?? []).length > 0, "the model declares scope-local data");
});

test("DTB-COMMUTE-01 commits the expense claim journey without an ambiguous internal choice", async () => {
  const bpmn = new URL("data-declaring-terminal-branches/expense-claim.bpmn", scenarios);
  const { result } = await admitted(await readFile(bpmn, "utf8"), "checkClaimPolicy", "expense claim");
  const program: SemanticProcessProgram = result.semanticProcess;
  const scenario = JSON.parse(await readFile(new URL("data-declaring-terminal-branches/expense-claim.scenario.json",
    scenarios), "utf8")) as { stimuli: Stimulus[] };
  let state: RuntimeState = initialState;
  for (const stimulus of scenario.stimuli) {
    const applied = applyStimulus(program, state, stimulus);
    assert.equal(applied.outcome, CommandOutcome.Committed, stimulus.commandId);
    assert.equal(applied.ambiguousInternalChoice, false, stimulus.commandId);
    assert.equal(isWellFormedRuntimeState(program, "ExpenseClaim_1", applied.state), true, stimulus.commandId);
    state = applied.state;
    if (stimulus.kind === StimulusKind.CompleteEffect) {
      // The policy closure entered *Review claim* beside both wait-free Ends: `verdict` lives only in its frame.
      const frames = state.variables.scopes.filter(({ owner }) => owner.definitionScopeId === "scope:ReviewClaim");
      assert.deepEqual(frames.map(({ bindings }) => bindings.map(({ name }) => name)), [["verdict"]]);
      assert.equal(state.variables.process.bindings.some(({ name }) => name === "verdict"), false);
    }
  }
  assert.equal(state.control.kind, ControlStateKind.Completed);
});

test("DTB-PROFILE-01 refuses the pass-vertex-free minimal pair under the embedded completion identity only by the cut", async () => {
  const move = await readFile(new URL("terminal-forks/office-move.bpmn", scenarios), "utf8");
  const declaring = replaceOnce(move, '<subProcess id="ClearOldOffice" name="Clear old office">',
    '<subProcess id="ClearOldOffice" name="Clear old office">\n      <extensionElements><camunda:inputOutput>' +
    '<camunda:inputParameter name="keysReturned">no</camunda:inputParameter></camunda:inputOutput></extensionElements>');
  const keys = replaceOnce(declaring, '<manualTask id="ReturnKeys" name="Return keys" />',
    '<userTask id="ReturnKeys" name="Return keys" />');
  // The twin keeps every branch waiting; the pair differs from it only in the parking branch, now a direct End.
  const twin = replaceOnce(keys, '<task id="CancelParkingPermit" name="Cancel parking permit" />',
    '<userTask id="CancelParkingPermit" name="Cancel parking permit" />');
  const pair = replaceOnce(replaceOnce(keys, '<task id="CancelParkingPermit" name="Cancel parking permit" />', ""),
    '<sequenceFlow id="Flow_ToParking" sourceRef="SplitClearing" targetRef="CancelParkingPermit" />' +
    '\n      <sequenceFlow id="Flow_ParkingDone" sourceRef="CancelParkingPermit" targetRef="ParkingCancelled" />',
    '<sequenceFlow id="Flow_ToParking" sourceRef="SplitClearing" targetRef="ParkingCancelled" />');
  const embedded = SemanticProfileId.EmbeddedSubProcessCompletion;
  assert.equal((await compile(twin, embedded, "bookMovers")).status, BpmnCompilationStatus.Accepted, "embedded twin");
  assert.equal((await compile(pair, embedded, "bookMovers")).status, BpmnCompilationStatus.Rejected, "embedded pair");
  const nested = await admitted(pair, "bookMovers", "nested pair");
  assert.notEqual(nested.checked, null, "nested checked");
  assert.notEqual(nested.program, null, "nested Program");
  const identity = { semanticProfile: embedded, sourceOverlay: nested.result.semanticProcess.identity.sourceOverlay };
  const graph = { ...nested.result.checkedProcess, identity: { ...nested.result.checkedProcess.identity, ...identity } };
  const program = { ...nested.result.semanticProcess, identity: { ...nested.result.semanticProcess.identity, ...identity } };
  assert.equal(nestedScopeControlCheckedAnalysis(controlGraph(graph)), null, "embedded checked");
  assert.equal(nestedScopeControlProgramAnalysis(program), null, "embedded Program");
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId: "Move_1", initialVariables: [] } as const;
  assert.equal(supportsSemanticProcessExecution(start, program), false, "embedded profile admission");
});
