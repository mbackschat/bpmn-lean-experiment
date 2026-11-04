/**
 * IGR-ADMIT-01, IGR-BIND-01, IGR-ROOT-01 and IGR-PROFILE-01 through the exact-bytes source path. The oracle is the
 * Inclusive regions proposal's witness account: both retained models compile under the nested scope-data profile at
 * the checked and Program levels, and every refused edit differs from an admitted twin in exactly its named fact.
 * Program-level refusals mutate the admitted Program in the one fact the edit changes, so the Program analysis decides
 * without the checked graph.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  SemanticOperationKind, SemanticProfileId, SimpleBooleanExpressionKind, StimulusKind, inclusiveOperationsArePaired,
  isWellFormedSemanticProcessProgram,
  nestedScopeControlCheckedAnalysis, nestedScopeControlProgramAnalysis, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { CheckedProcess, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const scenarios = new URL("../../../scenarios/", import.meta.url);
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
const start = (processId: string) => ({ kind: StimulusKind.StartProcess, commandId: "start", processId,
  instanceId: "Regions_1", initialVariables: [] }) as const;

async function admitted(xml: string, delegates: readonly string[], label: string,
  semanticProfile: string = SemanticProfileId.NestedEmbeddedScopeData) {
  const result = await compile(xml, semanticProfile, delegates);
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

/** The profile names Simple Boolean v1 exactly when a model holds a condition (SRE-ADMIT-01). */
const withoutExpressionLanguage = (xml: string): string =>
  replaceOnce(xml, ' expressionLanguage="urn:bpmn-lean:expression:simple-boolean:v1"', "");

const retained = (path: string): Promise<string> => readFile(new URL(path, scenarios), "utf8");
const accountOpening = () => retained("inclusive-gateway-regions/account-opening.bpmn");
const eventBooking = () => retained("inclusive-gateway-regions/event-booking.bpmn");
const accountHandlers = ["verifyIdentityDocument"];
const bookingHandlers = ["quoteEvent"];

/** The Program with one operation replaced, keeping its scope; the Program analysis alone must decide. */
function withOperation(program: SemanticProcessProgram, elementId: string,
  replace: (operation: SemanticOperation) => SemanticOperation): SemanticProcessProgram {
  const targets = program.operations.filter(({ origin }) => origin.elementId === elementId);
  assert.equal(targets.length, 1, elementId);
  return { ...program, operations: program.operations.map(operation =>
    operation === targets[0] ? replace(operation) : operation) } as SemanticProcessProgram;
}

function selectMany(operation: SemanticOperation) {
  assert.ok(operation.kind === SemanticOperationKind.SelectMany);
  return operation;
}

type InclusiveCandidate = ReturnType<typeof selectMany>["candidates"][number];

/** The split `operation` with each candidate rewritten by `rewrite`, keeping its candidate count. */
function rewritingCandidates(operation: SemanticOperation,
  rewrite: (candidate: InclusiveCandidate, index: number) => InclusiveCandidate): SemanticOperation {
  const split = selectMany(operation);
  const [first, ...rest] = split.candidates;
  return { ...split, candidates: [rewrite(first, 0), ...rest.map((candidate, index) => rewrite(candidate, index + 1))] };
}

const stringEquals = (variable: string, value: string) =>
  ({ kind: SimpleBooleanExpressionKind.StringEquals, variable, value }) as const;

test("IGR-ADMIT-01 admits the account opening and the event booking at both levels within the closure limit", async () => {
  const account = await admitted(await accountOpening(), accountHandlers, "account opening");
  const booking = await admitted(await eventBooking(), bookingHandlers, "event booking");
  assert.equal(nestedScopeControlProgramAnalysis(account.semanticProcess), 8);
  assert.equal(nestedScopeControlProgramAnalysis(booking.semanticProcess), 8);
  const extras = selectMany(booking.semanticProcess.operations.find(({ kind }) => kind === SemanticOperationKind.SelectMany)!);
  // CIB-INT-0005: the unconditioned output lowers to the literal `true`; the checked graph keeps its condition absent.
  assert.deepEqual(extras.candidates.map(({ condition }) => condition.kind),
    [SimpleBooleanExpressionKind.Literal, SimpleBooleanExpressionKind.StringEquals, SimpleBooleanExpressionKind.StringEquals]);
  assert.equal(extras.defaultBranch, undefined);
  assert.equal(booking.checkedProcess.sequenceFlows.find(({ id }) => id === "Flow_AttendeeList")?.condition, null);
});

test("IGR-ADMIT-01 condition 3 refuses a default-less split whose every output is conditioned, at each level", async () => {
  const booking = await eventBooking();
  await refusedAtCheckedLevel(replaceOnce(booking,
    '<sequenceFlow id="Flow_AttendeeList" sourceRef="OrderExtras" targetRef="ConfirmAttendeeList" />',
    '<sequenceFlow id="Flow_AttendeeList" sourceRef="OrderExtras" targetRef="ConfirmAttendeeList">' +
    '<conditionExpression xsi:type="tFormalExpression">stringEquals(catering,"no")</conditionExpression></sequenceFlow>'),
  bookingHandlers, "all conditioned");
  const { semanticProcess } = await admitted(booking, bookingHandlers, "event booking");
  const conditioned = withOperation(semanticProcess, "OrderExtras", operation =>
    rewritingCandidates(operation, candidate => candidate.origin.elementId === "Flow_AttendeeList"
      ? { ...candidate, condition: stringEquals("catering", "no") } : candidate));
  assert.equal(nestedScopeControlProgramAnalysis(conditioned), null);
});

test("IGR-ADMIT-01 condition 3 refuses a defaulted split with an unconditioned output, at each level", async () => {
  const account = await accountOpening();
  const unconditioned = replaceOnce(account,
    '<conditionExpression xsi:type="tFormalExpression">stringEquals(residency,"foreign")</conditionExpression>', "");
  await refusedAtCheckedLevel(unconditioned, accountHandlers, "default and unconditioned");
  const { semanticProcess } = await admitted(account, accountHandlers, "account opening");
  const literal = withOperation(semanticProcess, "RequiredChecks", operation =>
    rewritingCandidates(operation, candidate => candidate.origin.elementId === "Flow_TaxResidency"
      ? { ...candidate, condition: { kind: SimpleBooleanExpressionKind.Literal, value: true } } : candidate));
  assert.equal(nestedScopeControlProgramAnalysis(literal), null);
});

const ends = (xml: string, split: "inclusiveGateway" | "parallelGateway"): string => {
  let edited = xml.replace('<inclusiveGateway id="ChecksComplete" name="Checks complete" />',
    '<endEvent id="DueDiligenceEnded" /><endEvent id="TaxResidencyEnded" /><endEvent id="IdentityEnded" />' +
    '<endEvent id="StandardEnded" />')
    .replace('<userTask id="OpenAccount" name="Open account" />', "")
    .replace('<endEvent id="AccountOpened" name="Account opened" />', "")
    .replace('<sequenceFlow id="Flow_ChecksComplete" sourceRef="ChecksComplete" targetRef="OpenAccount" />', "")
    .replace('<sequenceFlow id="Flow_AccountOpened" sourceRef="OpenAccount" targetRef="AccountOpened" />', "");
  for (const [flow, end] of [["Flow_DueDiligenceDone", "DueDiligenceEnded"], ["Flow_TaxResidencyDone", "TaxResidencyEnded"],
    ["Flow_IdentityDocumentDone", "IdentityEnded"], ["Flow_StandardDone", "StandardEnded"]] as const) {
    edited = edited.replace(new RegExp(`(<sequenceFlow id="${flow}" sourceRef="[A-Za-z]+") targetRef="ChecksComplete"`),
      `$1 targetRef="${end}"`);
  }
  return split === "inclusiveGateway" ? edited : parallelTwin(edited);
};

/** The account opening's split as a Parallel fork: no default, no conditions, so no expression language either. */
const parallelTwin = (xml: string): string => withoutExpressionLanguage(xml)
  .replace('<inclusiveGateway id="RequiredChecks" name="Required checks" default="Flow_Standard" />',
    '<parallelGateway id="RequiredChecks" name="Required checks" />')
  .replace('<inclusiveGateway id="ChecksComplete" name="Checks complete" />', '<parallelGateway id="ChecksComplete" />')
  .replace(/<conditionExpression[^<]*<\/conditionExpression>/g, "");

test("IGR-ADMIT-01 refuses branches ending at separate Ends while the Parallel twin is a root terminal fork", async () => {
  const account = await accountOpening();
  await refusedAtCheckedLevel(ends(account, "inclusiveGateway"), accountHandlers, "Inclusive terminal split");
  await admitted(ends(account, "parallelGateway"), accountHandlers, "Parallel terminal fork");
});

test("IGR-ADMIT-01 condition 4 refuses a pass-through branch at each level while its Parallel twin is admitted", async () => {
  const account = await accountOpening();
  const plain = (xml: string) => replaceOnce(xml, '<userTask id="CollectTaxResidencyForm" name="Collect tax residency form" />',
    '<task id="CollectTaxResidencyForm" name="Collect tax residency form" />');
  await refusedAtCheckedLevel(plain(account), accountHandlers, "pass-through branch");
  await admitted(plain(parallelTwin(account)), accountHandlers, "pass-through Parallel twin");
  const { semanticProcess } = await admitted(account, accountHandlers, "account opening");
  const passing = withOperation(semanticProcess, "CollectTaxResidencyForm", operation => {
    assert.ok(operation.kind === SemanticOperationKind.AwaitUserTask);
    return { id: operation.id, origin: operation.origin, kind: SemanticOperationKind.MergeExclusive,
      inputs: [operation.input], output: operation.output } as SemanticOperation;
  });
  assert.equal(nestedScopeControlProgramAnalysis(passing), null);
});

test("an Exclusive Choice before the split routes the model away from regions and is refused", async () => {
  const account = await accountOpening();
  const choice = replaceOnce(replaceOnce(account,
    '<sequenceFlow id="Flow_ApplicantAssessed" sourceRef="AssessApplicant" targetRef="RequiredChecks" />',
    '<sequenceFlow id="Flow_ApplicantAssessed" sourceRef="AssessApplicant" targetRef="Triage" />' +
    '<sequenceFlow id="Flow_Regular" sourceRef="Triage" targetRef="RequiredChecks">' +
    '<conditionExpression xsi:type="tFormalExpression">stringEquals(riskRating,"low")</conditionExpression></sequenceFlow>' +
    '<sequenceFlow id="Flow_Declined" sourceRef="Triage" targetRef="Declined" />'),
    '<inclusiveGateway id="RequiredChecks"',
    '<exclusiveGateway id="Triage" default="Flow_Declined" /><endEvent id="Declined" /><inclusiveGateway id="RequiredChecks"');
  const result = await compile(choice, SemanticProfileId.NestedEmbeddedScopeData, accountHandlers);
  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

test("IGR-ADMIT-01 condition 5 refuses an Inclusive supplier onboarding with Calls while its Parallel original is admitted", async () => {
  const supplier = await retained("concurrent-mapped-calls/supplier-onboarding.bpmn");
  await admitted(supplier, [], "Parallel supplier onboarding");
  const inclusive = supplier.replace('<parallelGateway id="ReviewsFork" name="Start reviews" />',
    '<inclusiveGateway id="ReviewsFork" name="Start reviews" />')
    .replace('<parallelGateway id="ReviewsJoin" name="Reviews done" />', '<inclusiveGateway id="ReviewsJoin" name="Reviews done" />');
  await refusedAtCheckedLevel(inclusive, [], "Inclusive supplier onboarding");
});

test("a root Call after the join stays refused beside a region (RPF-ADMIT-01)", async () => {
  const account = await accountOpening();
  const called = replaceOnce(replaceOnce(replaceOnce(account,
    '<sequenceFlow id="Flow_AccountOpened" sourceRef="OpenAccount" targetRef="AccountOpened" />',
    '<sequenceFlow id="Flow_AccountOpened" sourceRef="OpenAccount" targetRef="NotifyBranch" />' +
    '<sequenceFlow id="Flow_Notified" sourceRef="NotifyBranch" targetRef="AccountOpened" />'),
    '<userTask id="OpenAccount" name="Open account" />',
    '<userTask id="OpenAccount" name="Open account" /><callActivity id="NotifyBranch" calledElement="Process_Notify">' +
    '<extensionElements><camunda:in source="application" target="application" />' +
    '<camunda:out source="notice" target="notice" /></extensionElements></callActivity>'),
    "  </process>\n</definitions>",
    '  </process>\n  <process id="Process_Notify" isExecutable="true"><startEvent id="NotifyOpened" />' +
    '<userTask id="WriteNotice" /><endEvent id="NotifyClosed" />' +
    '<sequenceFlow id="Flow_N1" sourceRef="NotifyOpened" targetRef="WriteNotice" />' +
    '<sequenceFlow id="Flow_N2" sourceRef="WriteNotice" targetRef="NotifyClosed" /></process>\n</definitions>');
  await refusedAtCheckedLevel(called, accountHandlers, "root Call beside a region");
});

test("IGR-BIND-01 refuses the account opening Program with two expected join inputs swapped", async () => {
  const { semanticProcess } = await admitted(await accountOpening(), accountHandlers, "account opening");
  const swapped = withOperation(semanticProcess, "RequiredChecks", operation => {
    const inputs = selectMany(operation).candidates.map(({ expectedJoinInput }) => expectedJoinInput);
    return rewritingCandidates(operation, (candidate, index) =>
      ({ ...candidate, expectedJoinInput: inputs[index === 0 ? 1 : index === 1 ? 0 : index]! }));
  });
  // The operation pairing compares sets of expected inputs, so it admits the swap; only the walk separates it.
  assert.equal(inclusiveOperationsArePaired(swapped.operations), true, "pairing alone admits the swap");
  assert.equal(nestedScopeControlProgramAnalysis(swapped), null);
});

/** Profile-control graphs: a data-free root region after a Sub-Process, as the proposal's minimal pair states. */
const definitions = (process: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    id="Definitions_Region" targetNamespace="urn:bpmn-lean:region" expressionLanguage="urn:bpmn-lean:expression:simple-boolean:v1">
  <process id="Process_Region" isExecutable="true">${process}
  </process>
</definitions>
`;
const flow = (id: string, source: string, target: string, condition?: string) => condition === undefined
  ? `<sequenceFlow id="${id}" sourceRef="${source}" targetRef="${target}" />`
  : `<sequenceFlow id="${id}" sourceRef="${source}" targetRef="${target}"><conditionExpression xsi:type="tFormalExpression">${condition}</conditionExpression></sequenceFlow>`;
const region = (prefix: string) => `
    <inclusiveGateway id="${prefix}Split" default="${prefix}Flow_Normal" /><userTask id="${prefix}Rush" />
    <userTask id="${prefix}Normal" /><inclusiveGateway id="${prefix}Join" />
    ${flow(`${prefix}Flow_Rush`, `${prefix}Split`, `${prefix}Rush`, "isPresent(rush)")}
    ${flow(`${prefix}Flow_Normal`, `${prefix}Split`, `${prefix}Normal`)}
    ${flow(`${prefix}Flow_RushDone`, `${prefix}Rush`, `${prefix}Join`)}${flow(`${prefix}Flow_NormalDone`, `${prefix}Normal`, `${prefix}Join`)}`;
const rootRegion = definitions(`
    <startEvent id="Opened" /><subProcess id="Work"><startEvent id="WorkOpened" /><userTask id="Inner" /><endEvent id="WorkClosed" />
      ${flow("Flow_W1", "WorkOpened", "Inner")}${flow("Flow_W2", "Inner", "WorkClosed")}</subProcess>${region("")}
    <userTask id="Finish" /><endEvent id="Closed" />
    ${flow("Flow_1", "Opened", "Work")}${flow("Flow_2", "Work", "Split")}${flow("Flow_3", "Join", "Finish")}
    ${flow("Flow_4", "Finish", "Closed")}`);
const wrappedRegion = definitions(`
    <startEvent id="Opened" /><userTask id="Prepare" />
    <subProcess id="Work"><startEvent id="WorkOpened" />${region("Inner")}<endEvent id="WorkClosed" />
      ${flow("Flow_W1", "WorkOpened", "InnerSplit")}${flow("Flow_W2", "InnerJoin", "WorkClosed")}</subProcess>
    <userTask id="Finish" /><endEvent id="Closed" />
    ${flow("Flow_1", "Opened", "Prepare")}${flow("Flow_2", "Prepare", "Work")}${flow("Flow_3", "Work", "Finish")}
    ${flow("Flow_4", "Finish", "Closed")}`);

test("IGR-ROOT-01 refuses a region in a Sub-Process body while the same region in the root is admitted", async () => {
  await admitted(rootRegion, [], "root region");
  await refusedAtCheckedLevel(wrappedRegion, [], "body region");
});

test("IGR-PROFILE-01 refuses the root region under the embedded completion identity, not under this profile", async () => {
  const nested = await admitted(rootRegion, [], "root region");
  assert.equal(supportsSemanticProcessExecution(start(nested.semanticProcess.processId), nested.semanticProcess), true);
  assert.equal((await compile(rootRegion, SemanticProfileId.EmbeddedSubProcessCompletion, null)).status,
    BpmnCompilationStatus.Rejected);
  const embedded = { semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion, sourceOverlay: null };
  const graph = { ...nested.checkedProcess, identity: { ...nested.checkedProcess.identity, ...embedded } };
  const program = { ...nested.semanticProcess, identity: { ...nested.semanticProcess.identity, ...embedded } };
  assert.equal(nestedScopeControlCheckedAnalysis(controlGraph(graph)), null, "checked");
  assert.equal(nestedScopeControlProgramAnalysis(program), null, "Program");
  assert.equal(supportsSemanticProcessExecution(start(program.processId), program), false, "profile admission");
  const parallel = withoutExpressionLanguage(rootRegion).replace('<inclusiveGateway id="Split" default="Flow_Normal" />', '<parallelGateway id="Split" />')
    .replace('<inclusiveGateway id="Join" />', '<parallelGateway id="Join" />')
    .replace(/<conditionExpression[^<]*<\/conditionExpression>/g, "");
  await admitted(parallel, [], "Parallel twin, nested");
  assert.equal((await compile(parallel, SemanticProfileId.EmbeddedSubProcessCompletion, null)).status,
    BpmnCompilationStatus.Accepted, "Parallel twin, embedded");
});
