/**
 * PTSM-ADMIT-01, PTSM-MERGE-01, PTSM-SPLIT-01 and PTSM-PROFILE-01 over the retained implicit split and merge models
 * through the exact-bytes source path, at the checked and Program levels. The oracle is the approved proposal's
 * "Separating witnesses": both models, their notation twins and the projection witness are admitted with agreeing
 * analyses, and each refused edit differs from an admitted model in its one named fact, so a gate that widened at one
 * level only, for every profile, or classified a several-flow node by its kind cannot pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess, lowerCheckedProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ControlStateKind, SemanticOperationKind, SemanticProfileId, applyStimulus, initialState,
  isWellFormedSemanticProcessProgram, nestedScopeControlCheckedAnalysis, nestedScopeControlProgramAnalysis,
  scopeReentryChecked, scopeReentryCheckedAnalysis, scopeReentryProgram, scopeReentryProgramAnalysis,
  structuredScopeDataCheckedStartNames, structuredScopeDataProgramStartNames,
} from "@bpmn-lean/semantic-core";
import type { CheckedProcess, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/pass-through-implicit-split-merge/", import.meta.url);
type Model = "claim-archiving" | "equipment-dispatch";
const delegates: Record<Model, string> = { "claim-archiving": "assessClaim", "equipment-dispatch": "reserveEquipment" };
const activity = "urn:bpmn-lean:effect-protocol:activity-v1";

const source = async (model: Model): Promise<string> => readFile(new URL(`${model}.bpmn`, directory), "utf8");

/** The model's overlay, its profile relabelled to `semanticProfile` so another profile's refusal is its own gate. */
function overlay(model: Model, semanticProfile: string) {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id: `${model}-handlers`, semanticProfile,
    effectBindings: [{ source: { implementation: activity, delegateExpression: `\${${delegates[model]}}` },
      descriptor: { protocol: activity, operation: delegates[model] } }], inertAttributes: [] }));
  return { id: `${model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(model: Model, xml: string, semanticProfile: string = SemanticProfileId.NestedEmbeddedScopeData) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile, sourceOverlay: overlay(model, semanticProfile), limits: semanticProcessTestLimits });
}

async function admitted(model: Model, xml: string, label: string = model) {
  const result = await compile(model, xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true, label);
  // Both levels decide independently, so a Program-only or checked-only widening cannot pass.
  assert.deepEqual(structuredScopeDataProgramStartNames(result.semanticProcess),
    structuredScopeDataCheckedStartNames(result.checkedProcess), label);
  return result;
}

async function refused(model: Model, xml: string, label: string): Promise<void> {
  assert.equal((await compile(model, xml)).status, BpmnCompilationStatus.Rejected, label);
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

const flow = (id: string, from: string, to: string) => `<sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}" />`;
const archive = '<manualTask id="ArchiveClaimFile" name="Archive claim file" />';
const note = '<manualTask id="PrintDispatchNote" name="Print dispatch note" />';
const notations = [["Manual Task", "manualTask"], ["Abstract Task", "task"], ["None Throw", "intermediateThrowEvent"]] as const;
const twin = (xml: string, node: string, element: string): string =>
  replaceOnce(xml, node, node.replace("<manualTask ", `<${element} `));

/** The node's one operation, with its kind and places, which the proposal's lowering rule fixes. */
function only(program: SemanticProcessProgram, elementId: string) {
  const operations = program.operations.filter(({ origin }) => origin.elementId === elementId);
  assert.equal(operations.length, 1, elementId);
  return operations[0]!;
}

const placesOf = (program: SemanticProcessProgram, flows: readonly string[]): readonly string[] =>
  program.controlPlaces.filter(({ origin }) => flows.includes(origin.elementId)).map(({ id }) => id).sort();

async function commitsEveryStimulus(program: SemanticProcessProgram, scenario: string) {
  const { stimuli } = JSON.parse(await readFile(new URL(`${scenario}.scenario.json`, directory), "utf8")) as
    { stimuli: Stimulus[] };
  let state = initialState;
  for (const stimulus of stimuli) {
    const result = applyStimulus(program, state, stimulus);
    assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
    state = result.state;
  }
  return state;
}

/** The checked graph with one extra Sequence Flow in the root, lowered without admission for the Program-level gate. */
function withFlow(graph: CheckedProcess, id: string, sourceId: string, targetId: string): CheckedProcess {
  const root = graph.sequenceFlowScopes[0]!.scopeId;
  return { ...graph, sequenceFlows: [...graph.sequenceFlows, { ...graph.sequenceFlows[0]!, id, sourceId, targetId }],
    sequenceFlowScopes: [...graph.sequenceFlowScopes, { sequenceFlowId: id, scopeId: root }] };
}

test("PTSM-MERGE-01: the claim archiving lowers its Manual Task to a two-input merge on the re-entry route", async () => {
  for (const [label, element] of notations) {
    const { checkedProcess, semanticProcess } = await admitted("claim-archiving",
      twin(await source("claim-archiving"), archive, element), label);
    const operation = only(semanticProcess, "ArchiveClaimFile");
    assert.ok(operation.kind === SemanticOperationKind.MergeExclusive, label);
    assert.deepEqual(operation.inputs, placesOf(semanticProcess, ["Flow_LetterWritten", "Flow_PayoutApproved"]), label);
    // SRE-ROUTE-01: the merging node counts as a Merge at both levels, as its lowered operation does.
    assert.equal(scopeReentryProgram(semanticProcess), true, label);
    assert.equal(scopeReentryChecked(checkedProcess), true, label);
    assert.deepEqual(scopeReentryCheckedAnalysis(checkedProcess), scopeReentryProgramAnalysis(semanticProcess), label);
  }
  const { semanticProcess } = await admitted("claim-archiving", await source("claim-archiving"));
  for (const scenario of ["claim-approved", "claim-rejected"]) {
    assert.equal((await commitsEveryStimulus(semanticProcess, scenario)).control.kind, ControlStateKind.Completed, scenario);
  }
});

test("PTSM-SPLIT-01: the equipment dispatch lowers its Manual Task to a two-output fork on the concurrent route", async () => {
  for (const [label, element] of notations) {
    const { checkedProcess, semanticProcess } = await admitted("equipment-dispatch",
      twin(await source("equipment-dispatch"), note, element), label);
    const operation = only(semanticProcess, "PrintDispatchNote");
    assert.ok(operation.kind === SemanticOperationKind.Duplicate, label);
    assert.deepEqual(operation.outputs, placesOf(semanticProcess, ["Flow_ToCourier", "Flow_ToPacking"]), label);
    assert.equal(scopeReentryProgram(semanticProcess), false, label);
    const burst = nestedScopeControlProgramAnalysis(semanticProcess);
    assert.notEqual(burst, null, label);
    assert.equal(nestedScopeControlCheckedAnalysis({ ...checkedProcess, flows: checkedProcess.sequenceFlows }), burst, label);
  }
  const { semanticProcess } = await admitted("equipment-dispatch", await source("equipment-dispatch"));
  for (const scenario of ["dispatch-packed-first", "dispatch-courier-first"]) {
    assert.equal((await commitsEveryStimulus(semanticProcess, scenario)).control.kind, ControlStateKind.Completed, scenario);
  }
});

const eventBooking = new URL("../../../scenarios/inclusive-gateway-regions/event-booking.bpmn", import.meta.url);

async function compileBooking(xml: string) {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id: "event-booking-handlers",
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData, effectBindings: [{ source: { implementation: activity,
      delegateExpression: "${quoteEvent}" }, descriptor: { protocol: activity, operation: "quoteEvent" } }],
    inertAttributes: [] }));
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "event-booking",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "event-booking-handlers", sha256: createHash("sha256").update(bytes).digest("hex"), bytes },
    limits: semanticProcessTestLimits });
}

test("PTSM-ADMIT-01: a splitting Task on an Inclusive region branch is admitted with agreeing analyses", async () => {
  const xml = replaceOnce(await readFile(eventBooking, "utf8"),
    '<parallelGateway id="ArrangeTechnology" name="Arrange technology" />', '<task id="ArrangeTechnology" name="Arrange technology" />');
  const result = await compileBooking(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const { checkedProcess, semanticProcess } = result;
  assert.equal(only(semanticProcess, "ArrangeTechnology").kind, SemanticOperationKind.Duplicate);
  const burst = nestedScopeControlProgramAnalysis(semanticProcess);
  assert.notEqual(burst, null);
  assert.equal(nestedScopeControlCheckedAnalysis({ ...checkedProcess, flows: checkedProcess.sequenceFlows }), burst);
});

test("PTSM-ADMIT-01: a node that both merges and splits is refused at each level", async () => {
  const xml = replaceOnce(await source("claim-archiving"), flow("Flow_Archived", "ArchiveClaimFile", "ClaimClosed"),
    flow("Flow_Archived", "ArchiveClaimFile", "ClaimClosed") + flow("Flow_Filed", "ArchiveClaimFile", "ClaimClosed"));
  await refused("claim-archiving", xml, "merge and split at once");
  const { checkedProcess } = await admitted("claim-archiving", await source("claim-archiving"));
  const both = withFlow(checkedProcess, "Flow_Filed", "ArchiveClaimFile", "ClaimClosed");
  assert.equal(structuredScopeDataCheckedStartNames(both), null);
  // No one operation both merges and splits, so the Program level cannot even represent the node.
  assert.throws(() => lowerCheckedProcess(both), /exactly one incoming/u);
});

test("PTSM-ADMIT-01: a conditioned outgoing flow of a splitting node is refused", async () => {
  await refused("equipment-dispatch", replaceOnce(await source("equipment-dispatch"),
    flow("Flow_ToCourier", "PrintDispatchNote", "BookCourier"),
    '<sequenceFlow id="Flow_ToCourier" sourceRef="PrintDispatchNote" targetRef="BookCourier">' +
    '<conditionExpression xsi:type="tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    'isPresent(reservation)</conditionExpression></sequenceFlow>'), "conditioned outgoing flow");
});

test("PTSM-ADMIT-01: dispatch branches reconverging at a Manual Task are a merge under a fork, refused at each level", async () => {
  const xml = replaceOnce(await source("equipment-dispatch"),
    '<parallelGateway id="ReadyToShip" name="Ready to ship" gatewayDirection="Converging" />',
    '<manualTask id="ReadyToShip" name="Load van" />');
  await refused("equipment-dispatch", xml, "merge under a fork");
  const { checkedProcess } = await admitted("equipment-dispatch", await source("equipment-dispatch"));
  const merged: CheckedProcess = { ...checkedProcess, nodes: checkedProcess.nodes.map(node => node.id === "ReadyToShip"
    ? { kind: "nonOperationalTask", id: "ReadyToShip", notation: "manualTask" } as CheckedProcess["nodes"][number] : node) };
  assert.equal(structuredScopeDataCheckedStartNames(merged), null);
  assert.equal(structuredScopeDataProgramStartNames(lowerCheckedProcess(merged)), null);
});

const reviewProcess = `<process id="Process_ExpertReview" isExecutable="true"><startEvent id="ReviewRequested" />` +
  `<userTask id="GiveOpinion" /><endEvent id="ReviewCompleted" />${flow("Flow_ReviewRequested", "ReviewRequested",
    "GiveOpinion")}${flow("Flow_OpinionGiven", "GiveOpinion", "ReviewCompleted")}</process>`;
const emptyOverlay = new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id: "loan-intake-handlers",
  semanticProfile: SemanticProfileId.NestedEmbeddedScopeData, effectBindings: [], inertAttributes: [] }));

/** Loan intake: a root Task forks into `triage` and a Sub-Process whose body forks into two User Tasks. */
function loanIntake(triage: string): string {
  const body = `<subProcess id="AssessApplication"><startEvent id="AssessmentOpened" /><parallelGateway id="SplitAssessment" />` +
    `<userTask id="CheckCredit" /><userTask id="ValueCollateral" /><parallelGateway id="JoinAssessment" />` +
    `<endEvent id="AssessmentClosed" />${flow("Flow_A1", "AssessmentOpened", "SplitAssessment")}${
      flow("Flow_A2", "SplitAssessment", "CheckCredit")}${flow("Flow_A3", "SplitAssessment", "ValueCollateral")}${
      flow("Flow_A4", "CheckCredit", "JoinAssessment")}${flow("Flow_A5", "ValueCollateral", "JoinAssessment")}${
      flow("Flow_A6", "JoinAssessment", "AssessmentClosed")}</subProcess>`;
  return `<?xml version="1.0" encoding="UTF-8"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" ` +
    `xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_LoanIntake" targetNamespace="urn:LoanIntake">` +
    `<process id="Process_LoanIntake" isExecutable="true"><startEvent id="ApplicationReceived" />${triage}${body}` +
    `<task id="RootSplit" name="Open loan file" /><parallelGateway id="RootJoin" /><endEvent id="LoanTaken" />${
      flow("Flow_R1", "ApplicationReceived", "RootSplit")}${flow("Flow_R2", "RootSplit", "Triage")}${
      flow("Flow_R3", "RootSplit", "AssessApplication")}${flow("Flow_R4", "Triage", "RootJoin")}${
      flow("Flow_R5", "AssessApplication", "RootJoin")}${flow("Flow_R6", "RootJoin", "LoanTaken")}</process>` +
    `${triage.startsWith("<callActivity") ? reviewProcess : ""}</definitions>`;
}

async function compileLoan(xml: string) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "loan-intake",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "loan-intake-handlers", sha256: createHash("sha256").update(emptyOverlay).digest("hex"),
      bytes: emptyOverlay }, limits: semanticProcessTestLimits });
}

test("PTSM-ADMIT-01 and RPF-ADMIT-01: a root Call beside a root splitting Task is refused, a User Task there admitted", async () => {
  const task = await compileLoan(loanIntake('<userTask id="Triage" />'));
  assert.ok(task.status === BpmnCompilationStatus.Accepted, JSON.stringify(task.diagnostics));
  const call = `<callActivity id="Triage" calledElement="Process_ExpertReview"><extensionElements>` +
    `<camunda:in source="employee" target="case" /><camunda:out source="opinion" target="TriageOpinion" />` +
    `</extensionElements></callActivity>`;
  assert.equal((await compileLoan(loanIntake(call))).status, BpmnCompilationStatus.Rejected);
});

const region = (prefix: string) => `<inclusiveGateway id="${prefix}Split" default="${prefix}Flow_Normal" />` +
  `<userTask id="${prefix}Rush" /><userTask id="${prefix}Normal" /><inclusiveGateway id="${prefix}Join" />` +
  `<sequenceFlow id="${prefix}Flow_Rush" sourceRef="${prefix}Split" targetRef="${prefix}Rush"><conditionExpression ` +
  `xsi:type="tFormalExpression">isPresent(rush)</conditionExpression></sequenceFlow>` +
  `${flow(`${prefix}Flow_Normal`, `${prefix}Split`, `${prefix}Normal`)}${flow(`${prefix}Flow_RushDone`, `${prefix}Rush`,
    `${prefix}Join`)}${flow(`${prefix}Flow_NormalDone`, `${prefix}Normal`, `${prefix}Join`)}`;
const block = `<parallelGateway id="BSplit" /><userTask id="BRush" /><userTask id="BNormal" /><parallelGateway id="BJoin" />` +
  `${flow("BFlow_Rush", "BSplit", "BRush")}${flow("BFlow_Normal", "BSplit", "BNormal")}${flow("BFlow_RushDone", "BRush",
    "BJoin")}${flow("BFlow_NormalDone", "BNormal", "BJoin")}`;

/** After *Prepare*, the splitting Task *Fork* runs region `A` beside `B`, a second region or, as the twin, a block. */
const forkedRegions = (sibling: boolean) => `<?xml version="1.0" encoding="UTF-8"?><definitions ` +
  `xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
  `id="Definitions_Region" targetNamespace="urn:bpmn-lean:region" expressionLanguage="urn:bpmn-lean:expression:simple-boolean:v1">` +
  `<process id="Process_Region" isExecutable="true"><startEvent id="Opened" /><userTask id="Prepare" />` +
  `<task id="Fork" name="Split the work" />${region("A")}${sibling ? region("B") : block}<parallelGateway id="Joined" />` +
  `<userTask id="Finish" /><endEvent id="Closed" />${flow("Flow_1", "Opened", "Prepare")}${flow("Flow_2", "Prepare", "Fork")}${
    flow("Flow_3", "Fork", "ASplit")}${flow("Flow_4", "Fork", "BSplit")}${flow("Flow_5", "AJoin", "Joined")}${
    flow("Flow_6", "BJoin", "Joined")}${flow("Flow_7", "Joined", "Finish")}${flow("Flow_8", "Finish", "Closed")}</process></definitions>`;

test("PTSM-ADMIT-01: regions on both branches of a splitting Task are refused while one region beside a block is admitted", async () => {
  const compileRegions = (xml: string) => compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml),
    sourceId: "model", expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "loan-intake-handlers", sha256: createHash("sha256").update(emptyOverlay).digest("hex"),
      bytes: emptyOverlay }, limits: semanticProcessTestLimits });
  const single = await compileRegions(forkedRegions(false));
  assert.ok(single.status === BpmnCompilationStatus.Accepted, JSON.stringify(single.diagnostics));
  assert.equal((await compileRegions(forkedRegions(true))).status, BpmnCompilationStatus.Rejected);
});

// PTSM-PROFILE-01's checked-level profile control (wrong algorithm 2), which the relabelling below cannot reach because
// every other profile refuses the pass-through node kind before its arity.
test("PTSM-PROFILE-01: only the nested scope-data profile gives pass-through nodes several flows", async () => {
  type GraphModule = typeof import("../src/checked-process-graph-admission.ts");
  const { passThroughSplitMerge } =
    await import(new URL("../dist/checked-process-graph-admission.js", import.meta.url).href) as GraphModule;
  for (const registeredProfile of Object.values(SemanticProfileId)) {
    assert.equal(passThroughSplitMerge(registeredProfile), registeredProfile === SemanticProfileId.NestedEmbeddedScopeData,
      registeredProfile);
  }
});

test("PTSM-PROFILE-01: both models and their twins are refused under the embedded completion profile", async () => {
  for (const [model, node] of [["claim-archiving", archive], ["equipment-dispatch", note]] as const) {
    for (const [label, element] of notations) {
      const xml = twin(await source(model), node, element);
      const { checkedProcess, semanticProcess } = await admitted(model, xml, label);
      assert.equal((await compile(model, xml, SemanticProfileId.EmbeddedSubProcessCompletion)).status,
        BpmnCompilationStatus.Rejected, `${model} ${label}`);
      const relabel = <T extends { identity: { semanticProfile: string } }>(value: T): T =>
        ({ ...value, identity: { ...value.identity, semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion } });
      assert.equal(nestedScopeControlCheckedAnalysis({ ...relabel(checkedProcess), flows: checkedProcess.sequenceFlows }), null);
      assert.equal(nestedScopeControlProgramAnalysis(relabel(semanticProcess)), null);
    }
  }
});
