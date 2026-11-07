/**
 * SCPH-ADMIT-01, SCPH-ONE-01, SCPH-SINGLE-01 and SCPH-PROFILE-01 over the retained employee onboarding model through the
 * exact-bytes source path, at the checked and Program levels. The oracle is the approved proposal's "Separating
 * witnesses": the root Start lowers to a `process` host, *Issue equipment* to a `subProcess` host over its body Start's
 * flows and its completion to an exit over its own, both levels route the model to the concurrent account, and each
 * refused edit differs from an admitted control in its one named fact.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CheckedNodeKind, ScopeWorkKind, SemanticOperationKind, SemanticProfileId, StimulusKind, applyStimulus,
  concurrentStructuredScopeDataProgram, initialState,
  isWellFormedSemanticProcessProgram, scopeReentryProgram, structuredScopeDataCheckedAnalysis,
  structuredScopeDataCheckedStartNames, structuredScopeDataProgramAnalysis, structuredScopeDataProgramStartNames,
} from "@bpmn-lean/semantic-core";
import type { CheckedProcess, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/scope-host-split/", import.meta.url);
const model = "employee-onboarding";

const source = async (): Promise<string> => readFile(new URL(`${model}.bpmn`, directory), "utf8");

/** The model's overlay, its profile relabelled to `semanticProfile` so another profile's refusal is its own gate. */
async function overlay(semanticProfile: string) {
  const retained = JSON.parse(await readFile(new URL(`${model}-overlay.json`, directory), "utf8"));
  const bytes = new TextEncoder().encode(JSON.stringify({ ...retained, semanticProfile }));
  return { id: `${model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(xml: string, semanticProfile: string = SemanticProfileId.NestedEmbeddedScopeData) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile, sourceOverlay: await overlay(semanticProfile), limits: semanticProcessTestLimits });
}

async function admitted(xml: string, label: string) {
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true, label);
  // Each level admits the model independently, so a widening at one level only cannot pass.
  assert.notEqual(structuredScopeDataProgramAnalysis(result.semanticProcess), null, `${label}: Program analysis`);
  assert.notEqual(structuredScopeDataCheckedAnalysis(result.checkedProcess), null, `${label}: checked analysis`);
  assert.deepEqual(structuredScopeDataProgramStartNames(result.semanticProcess),
    structuredScopeDataCheckedStartNames(result.checkedProcess), label);
  return result.semanticProcess;
}

async function refused(xml: string, label: string, semanticProfile?: string): Promise<void> {
  assert.equal((await compile(xml, semanticProfile)).status, BpmnCompilationStatus.Rejected, label);
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

/** The one operation of `kind` that `elementId` lowers to; a Sub-Process lowers to its entry and its completion. */
function only(program: SemanticProcessProgram, elementId: string, kind: SemanticOperationKind) {
  const operations = program.operations.filter((operation) => operation.origin.elementId === elementId &&
    operation.kind === kind);
  assert.equal(operations.length, 1, `${elementId} ${kind}`);
  return operations[0]!;
}

const placesOf = (program: SemanticProcessProgram, flows: readonly string[]): readonly string[] =>
  program.controlPlaces.filter(({ origin }) => flows.includes(origin.elementId)).map(({ id }) => id).sort();

const flow = (id: string, from: string, to: string, body = ""): string =>
  body === "" ? `<sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}" />`
    : `<sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}">${body}</sequenceFlow>`;

/** *Issue equipment* with a splitting or a serial body, closed by its own End. */
function issueEquipment(split: boolean): string {
  const flows = split
    ? [flow("Flow_ToBadge", "EquipmentRequested", "IssueBadge"), flow("Flow_ToLaptop", "EquipmentRequested", "IssueLaptop"),
      flow("Flow_BadgeIssued", "IssueBadge", "EquipmentReady"), flow("Flow_LaptopIssued", "IssueLaptop", "EquipmentReady"),
      flow("Flow_EquipmentReady", "EquipmentReady", "EquipmentIssued")]
    : [flow("Flow_ToBadge", "EquipmentRequested", "IssueBadge"), flow("Flow_BadgeIssued", "IssueBadge", "IssueLaptop"),
      flow("Flow_LaptopIssued", "IssueLaptop", "EquipmentIssued")];
  return `<subProcess id="IssueEquipment" name="Issue equipment"><startEvent id="EquipmentRequested" />
    <userTask id="IssueBadge" /><userTask id="IssueLaptop" />
    ${split ? '<parallelGateway id="EquipmentReady" gatewayDirection="Converging" />' : ""}
    <endEvent id="EquipmentIssued" />${flows.join("")}</subProcess>`;
}

/** The retained model's header, Process and mapped *Register hire*, around `elements`. */
async function variant(elements: readonly string[]): Promise<string> {
  const retained = await source();
  const opening = retained.slice(0, retained.indexOf("<userTask id=\"PrepareWorkstation\""));
  return `${opening}${elements.join("\n    ")}\n  </process>\n</definitions>\n`;
}

/**
 * *Issue equipment* on the branch of the root split that *Prepare workstation* held. With `exitSplits` its two outgoing
 * flows, or an explicit Parallel fork after it, rejoin on that branch before the root join.
 */
async function equipmentOnBranch(bodySplits: boolean, exitSplits: boolean, explicitFork = false): Promise<string> {
  const exit = !exitSplits ? [flow("Flow_ToItAccess", "IssueEquipment", "ConfirmItAccess"),
    flow("Flow_ItAccessConfirmed", "ConfirmItAccess", "StartPrepared")] : [
    '<userTask id="NotifyFacilities" />', '<parallelGateway id="EquipmentDone" gatewayDirection="Converging" />',
    ...(explicitFork ? ['<parallelGateway id="EquipmentFork" gatewayDirection="Diverging" />',
      flow("Flow_ToFork", "IssueEquipment", "EquipmentFork"), flow("Flow_ToItAccess", "EquipmentFork", "ConfirmItAccess"),
      flow("Flow_ToFacilities", "EquipmentFork", "NotifyFacilities")]
      : [flow("Flow_ToItAccess", "IssueEquipment", "ConfirmItAccess"),
        flow("Flow_ToFacilities", "IssueEquipment", "NotifyFacilities")]),
    flow("Flow_ItAccessConfirmed", "ConfirmItAccess", "EquipmentDone"),
    flow("Flow_FacilitiesNotified", "NotifyFacilities", "EquipmentDone"), flow("Flow_EquipmentDone", "EquipmentDone", "StartPrepared")];
  return variant([
    issueEquipment(bodySplits), '<userTask id="ConfirmItAccess" />',
    '<parallelGateway id="StartPrepared" gatewayDirection="Converging" />', '<userTask id="PrepareWorkstation" />',
    '<endEvent id="AccessConfirmed" />',
    flow("Flow_ToRegister", "HireConfirmed", "RegisterHire"), flow("Flow_ToEquipment", "HireConfirmed", "IssueEquipment"),
    ...exit,
    flow("Flow_Registered", "RegisterHire", "StartPrepared"),
    flow("Flow_ToWorkstation", "StartPrepared", "PrepareWorkstation"),
    flow("Flow_WorkstationPrepared", "PrepareWorkstation", "AccessConfirmed"),
  ]);
}

test("SCPH-ADMIT-01: the root Start, the body Start and the Sub-Process lower to hosts and an exit over their flows", async () => {
  const program = await admitted(await source(), model);
  const start = only(program, "HireConfirmed", SemanticOperationKind.Scope);
  assert.ok(start.kind === SemanticOperationKind.Scope && start.work.kind === ScopeWorkKind.Process);
  assert.deepEqual(start.inputs, []);
  assert.deepEqual(start.entries.map(({ place }) => place), placesOf(program, ["Flow_ToRegister", "Flow_ToWorkstation"]));
  const equipment = only(program, "IssueEquipment", SemanticOperationKind.Scope);
  assert.ok(equipment.kind === SemanticOperationKind.Scope && equipment.work.kind === ScopeWorkKind.SubProcess);
  assert.deepEqual(equipment.inputs, placesOf(program, ["Flow_ToEquipment"]));
  assert.deepEqual(equipment.entries.map(({ place }) => place), placesOf(program, ["Flow_ToBadge", "Flow_ToLaptop"]));
  const exit = only(program, "IssueEquipment", SemanticOperationKind.ScopeExit);
  assert.ok(exit.kind === SemanticOperationKind.ScopeExit);
  assert.equal(exit.scopeId, equipment.work.childScopeId);
  assert.equal(exit.origin.elementId, "IssueEquipment");
  assert.deepEqual(exit.outputs.map(({ place }) => place), placesOf(program, ["Flow_ToFacilities", "Flow_ToItAccess"]));
  // SCPH-START-01: the body Start is the host's entry step, never an operation of its own.
  assert.equal(program.operations.some(({ origin }) => origin.elementId === "EquipmentRequested"), false);
  // Wrong algorithm 10: the Program alone reads a host and an exit as splits, though it holds no `duplicate`.
  assert.equal(program.operations.some(({ kind }) => kind === SemanticOperationKind.Duplicate), false);
  assert.equal(concurrentStructuredScopeDataProgram(program), true);
  assert.equal(scopeReentryProgram(program), false);
});

test("SCPH-ONE-01: one-flow Starts and Sub-Processes keep their legacy operations", async () => {
  const xml = replaceOnce(replaceOnce(await source(), flow("Flow_ToFacilities", "IssueEquipment", "NotifyFacilities"), ""),
    '<endEvent id="NotifyFacilities" name="Notify facilities" />', "");
  const program = await admitted(xml, "one-flow Sub-Process");
  only(program, "IssueEquipment", SemanticOperationKind.Scope);
  only(program, "IssueEquipment", SemanticOperationKind.CompleteScope);
  assert.equal(program.operations.some(({ kind }) => kind === SemanticOperationKind.ScopeExit), false);
  // A serial body keeps the legacy entry.
  const serial = await admitted(await equipmentOnBranch(false, false), "serial body");
  only(serial, "IssueEquipment", SemanticOperationKind.EnterScope);
});

test("SCPH-SINGLE-01: a split on a branch of the root split is refused; its serial twin is admitted", async () => {
  await admitted(await equipmentOnBranch(false, false), "serial Sub-Process on a branch");
  await refused(await equipmentOnBranch(true, false), "body split on a branch");
  await refused(await equipmentOnBranch(false, true), "Sub-Process split on a branch");
  await admitted(await equipmentOnBranch(false, true, true), "explicit fork after the Sub-Process on a branch");
});

test("SCPH-ADMIT-01: conditioned, default and merging forms stay refused", async () => {
  const xml = await source();
  const condition = '<conditionExpression xsi:type="tFormalExpression">stringEquals(hireSummary,"x")</conditionExpression>';
  const conditional = (text: string, id: string, from: string, to: string) => replaceOnce(
    replaceOnce(text, "<definitions ", '<definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '),
    flow(id, from, to), flow(id, from, to, condition));
  await refused(conditional(xml, "Flow_ToWorkstation", "HireConfirmed", "PrepareWorkstation"), "conditioned Start flow");
  await refused(conditional(xml, "Flow_ToFacilities", "IssueEquipment", "NotifyFacilities"), "conditioned Sub-Process flow");
  await refused(replaceOnce(xml, '<subProcess id="IssueEquipment" name="Issue equipment">',
    '<subProcess id="IssueEquipment" name="Issue equipment" default="Flow_ToItAccess">'), "default Sub-Process flow");
  await refused(replaceOnce(xml, flow("Flow_ToFacilities", "IssueEquipment", "NotifyFacilities"),
    `${flow("Flow_ToFacilities", "IssueEquipment", "NotifyFacilities")}${flow("Flow_Again", "RegisterHire", "IssueEquipment")}`),
  "second incoming flow at the Sub-Process");
});

test("SCPH-PROFILE-01: the embedded completion profile refuses the model", async () => {
  await refused(await source(), "embedded completion profile", SemanticProfileId.EmbeddedSubProcessCompletion);
});

/** A retained model of the same profile with its own overlay, for the edits the onboarding model has no node for. */
async function retained(family: string, name: string) {
  const at = new URL(`../../../scenarios/${family}/`, import.meta.url);
  const xml = await readFile(new URL(`${name}.bpmn`, at), "utf8");
  const bytes = await readFile(new URL(`${name}-overlay.json`, at));
  const compileXml = async (text: string) => compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(text),
    sourceId: name, expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: `${name}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes },
    limits: semanticProcessTestLimits });
  return { xml, compileXml };
}

/** `source` with one more flow from `from` to a fresh None End in `from`'s scope. */
function withTerminalFlow(source: CheckedProcess, from: string): CheckedProcess {
  const scopeId = source.nodeScopes.find(({ nodeId }) => nodeId === from)!.scopeId;
  return { ...source,
    nodes: [...source.nodes, { kind: CheckedNodeKind.NoneEndEvent, id: "Aside" }],
    nodeScopes: [...source.nodeScopes, { nodeId: "Aside", scopeId }],
    sequenceFlows: [...source.sequenceFlows, { id: "Flow_Aside", sourceId: from, targetId: "Aside", condition: null }],
    sequenceFlowScopes: [...source.sequenceFlowScopes, { sequenceFlowId: "Flow_Aside", scopeId }] };
}

const terminal = (id: string) => `<endEvent id="Aside_${id}" />${flow(`Flow_Aside_${id}`, id, `Aside_${id}`)}`;
const before = (xml: string, closing: string, inserted: string): string => replaceOnce(xml, closing, `${inserted}${closing}`);

// A merging Call has no edit here that differs from an admitted twin in that fact alone; it rests on the unchanged Call
// arity, which the Lean `calls_never_split_or_merge` check holds under every flag.
test("SCPH-ADMIT-01: a splitting Call and a splitting called-Process Start stay refused", async () => {
  const loan = await retained("call-variable-mapping", "loan-application");
  assert.equal((await loan.compileXml(loan.xml)).status, BpmnCompilationStatus.Accepted, "loan control");
  const rootClose = '<endEvent id="ApplicationDecided" name="Application decided" />';
  assert.equal((await loan.compileXml(before(loan.xml, rootClose, terminal("VerifyIdentity")))).status,
    BpmnCompilationStatus.Rejected, "splitting Call");
  assert.equal((await loan.compileXml(before(loan.xml, '<endEvent id="VerificationCompleted"',
    terminal("VerificationRequested")))).status, BpmnCompilationStatus.Rejected, "splitting called Start");
});

// Wrong algorithm 10: each refusal also holds for the lowered Program alone, whose Start or Sub-Process now lowers to a
// host or exit beside a root Call or Choice, while the unedited control's Program is admitted.
test("SCPH-ADMIT-01: a root split beside a root Call or Choice is refused at both levels", async () => {
  const { lowerCheckedProcess } = await import(new URL("../dist/semantic-process-lowering.js", import.meta.url).href) as
    { lowerCheckedProcess: (source: CheckedProcess) => SemanticProcessProgram };
  const cases = [
    ["call-variable-mapping", "loan-application", "ApplicationReceived", "ApplicationDecided", SemanticOperationKind.Scope],
    ["call-variable-mapping", "loan-application", "ReviewApplication", "ApplicationDecided", SemanticOperationKind.ScopeExit],
    ["scope-reentry", "claim-rework", "ClaimReceived", "ClaimClosed", SemanticOperationKind.Scope],
  ] as const;
  for (const [family, name, from, end, kind] of cases) {
    const model = await retained(family, name);
    const control = await model.compileXml(model.xml);
    assert.ok(control.status === BpmnCompilationStatus.Accepted, `${name} control`);
    assert.notEqual(structuredScopeDataProgramAnalysis(control.semanticProcess), null, `${name} control Program`);
    const closing = model.xml.match(new RegExp(`<endEvent id="${end}"[^>]*/>`, "u"))![0];
    assert.equal((await model.compileXml(before(model.xml, closing, terminal(from)))).status,
      BpmnCompilationStatus.Rejected, `${name}: ${from} split`);
    const program = lowerCheckedProcess(withTerminalFlow(control.checkedProcess, from));
    assert.ok(program.operations.some((operation) => operation.kind === kind && operation.origin.elementId === from),
      `${name}: ${from} lowers to ${kind}`);
    assert.equal(structuredScopeDataProgramAnalysis(program), null, `${name}: ${from} split, Program alone`);
  }
});

/** `xml` under the profile with an overlay that binds no handler, as a model with no Service Task needs. */
async function compileUnbound(xml: string) {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id: "unbound",
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData, effectBindings: [], inertAttributes: [] }));
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "unbound",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "unbound", sha256: createHash("sha256").update(bytes).digest("hex"), bytes },
    limits: semanticProcessTestLimits });
}

const processOf = (body: string): string => '<?xml version="1.0" encoding="UTF-8"?><definitions ' +
  `xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:x"><process id="P" isExecutable="true">${body}</process></definitions>`;
const fork = '<parallelGateway id="Fork" gatewayDirection="Diverging" />';
const join = (id: string) => `<parallelGateway id="${id}" gatewayDirection="Converging" />`;

/** `from` forking into `T1` and `T2`, directly or through an explicit Parallel fork, rejoined at `Join`. */
const twoBranches = (from: string, explicit: boolean): string => (explicit
  ? `${fork}${flow("f0", from, "Fork")}${flow("f1", "Fork", "T1")}${flow("f2", "Fork", "T2")}`
  : `${flow("f1", from, "T1")}${flow("f2", from, "T2")}`) +
  `<userTask id="T1" /><userTask id="T2" />${join("Join")}${flow("f3", "T1", "Join")}${flow("f4", "T2", "Join")}`;

/** CIB's `UncontrolledFlowTest#testSubProcessTwoOutgoingFlowsEndProcess` shape: a Sub-Process left on two flows to two Ends. */
const subProcessToTwoEnds = (explicit: boolean): string =>
  '<startEvent id="Start" /><subProcess id="S"><startEvent id="S_Start" /><userTask id="S_Task" /><endEvent id="S_End" />' +
  `${flow("s1", "S_Start", "S_Task")}${flow("s2", "S_Task", "S_End")}</subProcess>` +
  '<endEvent id="E1" /><endEvent id="E2" />' + flow("a", "Start", "S") + (explicit
    ? `${fork}${flow("b", "S", "Fork")}${flow("c", "Fork", "E1")}${flow("d", "Fork", "E2")}`
    : `${flow("c", "S", "E1")}${flow("d", "S", "E2")}`);

// CSSD-ADMIT-01: a model that forks routes to the concurrent account, which may bind no handler; an implicit split forks
// as its explicit-fork twin does, so the two are admitted alike. A serial model keeps NSD-ADMIT-01's overlay rule.
test("SCPH-ADMIT-01: an implicit split binds no handler exactly as its explicit-fork twin", async () => {
  const models: readonly (readonly [string, (explicit: boolean) => string])[] = [
    ["root Start split", (explicit) => processOf(`<startEvent id="Start" />${twoBranches("Start", explicit)}` +
      `<endEvent id="End" />${flow("f5", "Join", "End")}`)],
    ["body Start split", (explicit) => processOf('<startEvent id="Start" /><subProcess id="S"><startEvent id="S_Start" />' +
      `${twoBranches("S_Start", explicit)}<endEvent id="S_End" />${flow("f5", "Join", "S_End")}</subProcess>` +
      `<endEvent id="End" />${flow("a", "Start", "S")}${flow("b", "S", "End")}`)],
    ["Sub-Process split to two Ends", (explicit) => processOf(subProcessToTwoEnds(explicit))],
    ["pass-through split", (explicit) => processOf('<startEvent id="Start" /><manualTask id="M" />' +
      `${flow("a", "Start", "M")}${twoBranches("M", explicit)}<endEvent id="End" />${flow("f5", "Join", "End")}`)],
  ];
  for (const [label, model] of models) {
    for (const explicit of [true, false]) {
      const result = await compileUnbound(model(explicit));
      assert.equal(result.status, BpmnCompilationStatus.Accepted,
        `${label}${explicit ? ", explicit fork" : ""}: ${JSON.stringify(result.diagnostics)}`);
    }
  }
  const serial = await compileUnbound(processOf('<startEvent id="Start" /><userTask id="T" /><endEvent id="End" />' +
    `${flow("a", "Start", "T")}${flow("b", "T", "End")}`));
  assert.equal(serial.status, BpmnCompilationStatus.Rejected, "serial model without a handler");
});

// The census's executable counterexample for SCPH-SINGLE-01: a body-Start host on a Parallel branch is enabled beside
// the sibling branch's work, and the scheduler refuses the start rather than choose, while the admitted twin, whose body
// Start does not split, commits.
test("SCPH-SINGLE-01: a host placed on a Parallel branch fails closed in the scheduler", async () => {
  const { lowerCheckedProcess } = await import(new URL("../dist/semantic-process-lowering.js", import.meta.url).href) as
    { lowerCheckedProcess: (source: CheckedProcess) => SemanticProcessProgram };
  const twin = await compileUnbound(processOf('<startEvent id="Start" /><userTask id="Sibling" /><endEvent id="SiblingEnd" />' +
    '<subProcess id="S"><startEvent id="S_Start" /><userTask id="S_Task" /><endEvent id="S_End" />' +
    `${flow("s1", "S_Start", "S_Task")}${flow("s2", "S_Task", "S_End")}</subProcess><endEvent id="End" />` +
    `${fork}${flow("a", "Start", "Fork")}${flow("b", "Fork", "Sibling")}${flow("c", "Sibling", "SiblingEnd")}` +
    `${flow("d", "Fork", "S")}${flow("e", "S", "End")}`));
  assert.ok(twin.status === BpmnCompilationStatus.Accepted, JSON.stringify(twin.diagnostics));
  const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: "P", instanceId: "i",
    initialVariables: [] };
  assert.equal(applyStimulus(twin.semanticProcess, initialState, start).outcome, "committed", "admitted twin");
  const program = lowerCheckedProcess(withTerminalFlow(twin.checkedProcess, "S_Start"));
  assert.ok(program.operations.some((operation) => operation.kind === SemanticOperationKind.Scope &&
    operation.origin.elementId === "S"), "the branch-placed Sub-Process lowers to a host");
  assert.equal(applyStimulus(program, initialState, start).outcome, "rejected", "host on a branch");
});

/**
 * The retained loan application without its Service Task, so CSE-ADMIT-01's refusal of a Service Task beside a Call
 * cannot refuse a variant on its own; its overlay keeps the now unused binding.
 */
async function loanWithoutServiceTask() {
  const loan = await retained("call-variable-mapping", "loan-application");
  const task = loan.xml.slice(loan.xml.indexOf('<serviceTask id="AcknowledgeApplication"'),
    loan.xml.indexOf("</serviceTask>") + "</serviceTask>".length);
  const xml = replaceOnce(replaceOnce(replaceOnce(loan.xml, task, ""),
    flow("Flow_Received", "ApplicationReceived", "AcknowledgeApplication"),
    flow("Flow_Received", "ApplicationReceived", "VerifyIdentity")),
  flow("Flow_Acknowledged", "AcknowledgeApplication", "VerifyIdentity"), "");
  return { xml, compileXml: loan.compileXml };
}

// Wrong algorithm 10, isolated: with no Service Task beside the Call, the structured analysis alone admits a root Start
// or root Sub-Process split beside the root Call, so the root-split restriction (RPF-ADMIT-01) is what refuses it, at
// the checked level and on the lowered Program alone; a body-Start split is no root split, so it stays admitted.
test("SCPH-ADMIT-01: the root-split restriction alone refuses a root split beside a root Call", async () => {
  const { lowerCheckedProcess } = await import(new URL("../dist/semantic-process-lowering.js", import.meta.url).href) as
    { lowerCheckedProcess: (source: CheckedProcess) => SemanticProcessProgram };
  const { nestedScopeControlProgramStartNameRule } = await import(
    new URL("../../semantic-core/dist/nested-scope-control-admission.js", import.meta.url).href) as
    { nestedScopeControlProgramStartNameRule: (program: SemanticProcessProgram) => unknown };
  const loan = await loanWithoutServiceTask();
  const control = await loan.compileXml(loan.xml);
  assert.ok(control.status === BpmnCompilationStatus.Accepted, `control: ${JSON.stringify(control.diagnostics)}`);
  const closing = '<endEvent id="ApplicationDecided" name="Application decided" />';
  for (const [from, kind] of [["ApplicationReceived", SemanticOperationKind.Scope],
    ["ReviewApplication", SemanticOperationKind.ScopeExit]] as const) {
    assert.equal((await loan.compileXml(before(loan.xml, closing, terminal(from)))).status,
      BpmnCompilationStatus.Rejected, `${from} split beside the root Call`);
    const program = lowerCheckedProcess(withTerminalFlow(control.checkedProcess, from));
    assert.ok(program.operations.some((operation) => operation.kind === kind && operation.origin.elementId === from), from);
    assert.notEqual(nestedScopeControlProgramStartNameRule(program), null, `${from}: the analysis alone admits it`);
    assert.equal(structuredScopeDataProgramAnalysis(program), null, `${from}: the restriction refuses it`);
  }
  const bodySplit = await loan.compileXml(before(loan.xml, '<endEvent id="ReviewClosed"', terminal("ReviewOpened")));
  assert.equal(bodySplit.status, BpmnCompilationStatus.Accepted,
    `body Start split beside the root Call: ${JSON.stringify(bodySplit.status === BpmnCompilationStatus.Rejected ? bodySplit.diagnostics : [])}`);
});
