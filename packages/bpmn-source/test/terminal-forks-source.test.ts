/**
 * TFK-ADMIT-01, TFK-PROFILE-01 and DTB-ADMIT-01, which retired TFK-DATA-01, through the exact-bytes source path, each at the checked and Program
 * levels. The oracle is the terminal forks specification's witness account: both retained models compile under the
 * nested scope-data profile, every refused edit differs from an admitted twin in exactly its named fact, and each
 * profile-control pair is refused under the embedded completion identity only by the relaxed rule.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  SemanticOperationKind, SemanticProfileId, StimulusKind, isWellFormedSemanticProcessProgram,
  nestedScopeControlCheckedAnalysis, nestedScopeControlProgramAnalysis, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { CheckedProcess, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const scenarios = new URL("../../../scenarios/terminal-forks/", import.meta.url);
const activity = "urn:bpmn-lean:effect-protocol:activity-v1";
const checkedRefusal = "The checked graph does not satisfy nested scope-data admission.";

function overlay(semanticProfile: string, delegates: readonly string[]) {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id: "model-handlers", semanticProfile,
    effectBindings: delegates.map(delegate => ({ source: { implementation: activity, delegateExpression: `\${${delegate}}` },
      descriptor: { protocol: activity, operation: delegate } })), inertAttributes: [] }));
  return { id: "model-handlers", sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(xml: string, semanticProfile: string, delegates: readonly string[] | null) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "model", expectedSha256: undefined,
    semanticProfile, sourceOverlay: delegates === null ? null : overlay(semanticProfile, delegates),
    limits: semanticProcessTestLimits });
}

const controlGraph = (graph: CheckedProcess) => ({ ...graph, flows: graph.sequenceFlows });

/** Compiles under the nested scope-data profile and requires both analyses to admit independently. */
async function admitted(xml: string, delegates: readonly string[], label: string) {
  const result = await compile(xml, SemanticProfileId.NestedEmbeddedScopeData, delegates);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true, label);
  assert.notEqual(nestedScopeControlCheckedAnalysis(controlGraph(result.checkedProcess)), null, `${label} checked`);
  assert.notEqual(nestedScopeControlProgramAnalysis(result.semanticProcess), null, `${label} Program`);
  return result;
}

async function refusedAtCheckedLevel(xml: string, delegates: readonly string[], label: string): Promise<void> {
  const result = await compile(xml, SemanticProfileId.NestedEmbeddedScopeData, delegates);
  assert.equal(result.status, BpmnCompilationStatus.Rejected, label);
  assert.deepEqual(result.diagnostics.map(({ evidence }) => evidence), [checkedRefusal], label);
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

const retained = (model: string): Promise<string> => readFile(new URL(`${model}.bpmn`, scenarios), "utf8");

test("TFK-ADMIT-01 admits the employee offboarding and the office move at both levels", async () => {
  await admitted(await retained("employee-offboarding"), ["lookUpEmployee"], "employee offboarding");
  await admitted(await retained("office-move"), ["bookMovers"], "office move");
});

const declaration = '<subProcess id="ClearOldOffice" name="Clear old office">\n      <extensionElements><camunda:inputOutput>' +
  '<camunda:inputParameter name="keysReturned">no</camunda:inputParameter></camunda:inputOutput></extensionElements>';

/** The office move's wait-free branches replaced by User Tasks, so every branch of its body fork waits. */
const waiting = (xml: string): string => replaceOnce(replaceOnce(xml,
  '<manualTask id="ReturnKeys" name="Return keys" />', '<userTask id="ReturnKeys" name="Return keys" />'),
  '<task id="CancelParkingPermit" name="Cancel parking permit" />',
  '<userTask id="CancelParkingPermit" name="Cancel parking permit" />');

test("DTB-ADMIT-01 admits wait-free branches beside a declaring Sub-Process at each level, as their waiting twin", async () => {
  const move = await retained("office-move");
  const declaring = replaceOnce(move, '<subProcess id="ClearOldOffice" name="Clear old office">', declaration);
  assert.equal(nestedScopeControlProgramAnalysis((await admitted(declaring, ["bookMovers"], "declaring office move"))
    .semanticProcess), 7, "declaring office move burst");
  const twin = await admitted(waiting(declaring), ["bookMovers"], "declaring waiting twin");
  const free = await admitted(move, ["bookMovers"], "data-free office move");
  // Past the source reader: the data-free graph and Program with the twin's declaration grafted on differ from the
  // admitted data-free model only in that declaration, and from the admitted twin only in the wait-free branches.
  const [checkedRecords, programRecords] = [twin.checkedProcess.scopeLocalData, twin.semanticProcess.scopeLocalData];
  assert.ok(checkedRecords !== undefined && checkedRecords.length > 0 && programRecords !== undefined);
  const graph = { ...free.checkedProcess, scopeLocalData: checkedRecords };
  const program = { ...free.semanticProcess, scopeLocalData: programRecords };
  assert.notEqual(nestedScopeControlCheckedAnalysis(controlGraph(graph)), null, "checked");
  assert.notEqual(nestedScopeControlProgramAnalysis(program), null, "Program");
});

/** The offboarding's branch two as a paired block whose second branch is `second`, empty when it is the empty string. */
function pairedBranch(xml: string, second: string): string {
  const flows = second === ""
    ? '<sequenceFlow id="Flow_Empty" sourceRef="InnerSplit" targetRef="InnerJoin" />'
    : '<sequenceFlow id="Flow_ToLog" sourceRef="InnerSplit" targetRef="LogRevocation" />' +
      '<sequenceFlow id="Flow_Logged" sourceRef="LogRevocation" targetRef="InnerJoin" />';
  return replaceOnce(replaceOnce(replaceOnce(xml,
    '<userTask id="RevokeSystemAccess" name="Revoke system access" />',
    '<parallelGateway id="InnerSplit" /><userTask id="RevokeSystemAccess" name="Revoke system access" />' + second +
    '<parallelGateway id="InnerJoin" />'),
    '<sequenceFlow id="Flow_ToAccess" sourceRef="StartOffboarding" targetRef="RevokeSystemAccess" />',
    '<sequenceFlow id="Flow_ToAccess" sourceRef="StartOffboarding" targetRef="InnerSplit" />' +
    '<sequenceFlow id="Flow_ToRevoke" sourceRef="InnerSplit" targetRef="RevokeSystemAccess" />' + flows),
    '<sequenceFlow id="Flow_AccessDone" sourceRef="RevokeSystemAccess" targetRef="AccessRevoked" />',
    '<sequenceFlow id="Flow_Revoked" sourceRef="RevokeSystemAccess" targetRef="InnerJoin" />' +
    '<sequenceFlow id="Flow_AccessDone" sourceRef="InnerJoin" targetRef="AccessRevoked" />');
}

/** The Program without the one-input merge `pass`: its output place is renamed to its input wherever consumed. */
function withoutPass(program: SemanticProcessProgram, pass: string): SemanticProcessProgram {
  const merge = program.operations.find(({ origin }) => origin.elementId === pass);
  assert.ok(merge?.kind === SemanticOperationKind.MergeExclusive && merge.inputs.length === 1);
  const [input] = merge.inputs;
  const rename = (place: string): string => place === merge.output ? input! : place;
  return { ...program,
    operations: program.operations.filter(operation => operation !== merge).map(operation => ({ ...operation,
      ...("input" in operation && typeof operation.input === "string" ? { input: rename(operation.input) } : {}),
      ...("inputs" in operation && Array.isArray(operation.inputs) ? { inputs: operation.inputs.map(rename) } : {}) })),
    operationScopes: program.operationScopes.filter(({ operationId }) => operationId !== merge.id),
    controlPlaces: program.controlPlaces.filter(({ id }) => id !== merge.output) } as SemanticProcessProgram;
}

test("an empty branch to its paired join stays refused at each level while its pass-through twin is admitted", async () => {
  const offboarding = await retained("employee-offboarding");
  await refusedAtCheckedLevel(pairedBranch(offboarding, ""), ["lookUpEmployee"], "empty joined branch");
  const twin = await admitted(pairedBranch(offboarding, '<task id="LogRevocation" name="Log revocation" />'),
    ["lookUpEmployee"], "pass-through twin");
  assert.equal(nestedScopeControlProgramAnalysis(withoutPass(twin.semanticProcess, "LogRevocation")), null, "Program");
});

const start = (processId: string) => ({ kind: StimulusKind.StartProcess, commandId: "start", processId,
  instanceId: "Control_1", initialVariables: [] }) as const;

/** Profile-control graphs: data-free, effect-free, no pass-through Task or None Throw, each holding a Sub-Process. */
const definitions = (process: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Control" targetNamespace="urn:bpmn-lean:control">
  <process id="Process_Control" isExecutable="true">${process}
  </process>
</definitions>
`;
const flow = (id: string, source: string, target: string) =>
  `<sequenceFlow id="${id}" sourceRef="${source}" targetRef="${target}" />`;
// (a) Four None Ends, where the retained exact multiset has three; every branch waits, so only the root End count separates.
const rootTerminalFork = definitions(`
    <startEvent id="Opened" /><parallelGateway id="Split" />
    <subProcess id="Work"><startEvent id="WorkOpened" /><userTask id="Inner" /><endEvent id="WorkClosed" />
      ${flow("Flow_W1", "WorkOpened", "Inner")}${flow("Flow_W2", "Inner", "WorkClosed")}</subProcess>
    <endEvent id="WorkDone" /><userTask id="Left" /><endEvent id="LeftDone" /><userTask id="Right" /><endEvent id="RightDone" />
    ${flow("Flow_1", "Opened", "Split")}${flow("Flow_2", "Split", "Work")}${flow("Flow_3", "Work", "WorkDone")}
    ${flow("Flow_4", "Split", "Left")}${flow("Flow_5", "Left", "LeftDone")}${flow("Flow_6", "Split", "Right")}
    ${flow("Flow_7", "Right", "RightDone")}`);
// (b) Two User Tasks, where the retained multiset has three, and one root End, so only the strict cut separates.
const bodyDirectEnd = definitions(`
    <startEvent id="Opened" /><userTask id="Prepare" />
    <subProcess id="Work"><startEvent id="WorkOpened" /><parallelGateway id="Split" /><userTask id="Inner" />
      <endEvent id="InnerDone" /><endEvent id="Skipped" />
      ${flow("Flow_W1", "WorkOpened", "Split")}${flow("Flow_W2", "Split", "Inner")}${flow("Flow_W3", "Inner", "InnerDone")}
      ${flow("Flow_W4", "Split", "Skipped")}</subProcess>
    <endEvent id="Closed" />
    ${flow("Flow_1", "Opened", "Prepare")}${flow("Flow_2", "Prepare", "Work")}${flow("Flow_3", "Work", "Closed")}`);

test("TFK-PROFILE-01 refuses each control under the embedded completion identity at each level, not under this profile", async () => {
  for (const [label, xml] of [["root terminal fork", rootTerminalFork], ["body direct End", bodyDirectEnd]] as const) {
    assert.equal((await compile(xml, SemanticProfileId.EmbeddedSubProcessCompletion, null)).status,
      BpmnCompilationStatus.Rejected, `${label} embedded source`);
    // The nested twin carries an empty overlay, as CSSD-ADMIT-01 requires; the embedded twin carries none, as an
    // effect-free model of that profile must, so the relaxed rule is each twin's only refusal.
    const nested = await admitted(xml, [], label);
    assert.equal(supportsSemanticProcessExecution(start(nested.semanticProcess.processId), nested.semanticProcess), true, label);
    const embedded = { semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion, sourceOverlay: null };
    const graph = { ...nested.checkedProcess, identity: { ...nested.checkedProcess.identity, ...embedded } };
    const program = { ...nested.semanticProcess, identity: { ...nested.semanticProcess.identity, ...embedded } };
    assert.equal(nestedScopeControlCheckedAnalysis(controlGraph(graph)), null, `${label} checked`);
    assert.equal(nestedScopeControlProgramAnalysis(program), null, `${label} Program`);
    assert.equal(supportsSemanticProcessExecution(start(program.processId), program), false, `${label} profile admission`);
  }
});
