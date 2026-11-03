/**
 * SSM-ADMIT-01 and SSM-PROFILE-01 through the exact-bytes source path, at the Program and checked levels. The oracle is
 * the specification's witness account: each retained model holds no embedded Sub-Process and compiles under the
 * nested scope-data profile on the route its shape selects, while each embedded completion control stays refused with
 * one scope and admitted once its Tasks sit in a Sub-Process, so a lower bound dropped for every profile, or kept at one
 * level only, cannot pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind, CheckedNodeKind, CommandOutcome, ProcessStatus, SemanticProfileId,
  isWellFormedSemanticProcessProgram, nestedScopeControlCheckedAnalysis, nestedScopeControlProgramAnalysis,
  nestedScopeCheckedAnalysis, nestedScopeProgramAnalysis, runScenario, scopeReentryCheckedAnalysis,
  scopeReentryProgramAnalysis, structuredScopeDataCheckedStartNames, structuredScopeDataProgramStartNames,
  supportsSemanticProcessScenario,
} from "@bpmn-lean/semantic-core";
import type { CheckedProcess, Scenario, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const scenarios = new URL("../../../scenarios/", import.meta.url);
const activity = "urn:bpmn-lean:effect-protocol:activity-v1";

function overlay(id: string, semanticProfile: string, delegates: readonly string[]) {
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id, semanticProfile,
    effectBindings: delegates.map(delegate => ({ source: { implementation: activity, delegateExpression: `\${${delegate}}` },
      descriptor: { protocol: activity, operation: delegate } })), inertAttributes: [] }));
  return { id, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(xml: string, semanticProfile: string, delegates: readonly string[] | null) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "model", expectedSha256: undefined,
    semanticProfile, sourceOverlay: delegates === null ? null : overlay("model-handlers", semanticProfile, delegates),
    limits: semanticProcessTestLimits });
}

async function retained(family: string, model: string): Promise<string> {
  return readFile(new URL(`${family}/${model}.bpmn`, scenarios), "utf8");
}

async function admitted(xml: string, delegates: readonly string[], label: string) {
  const result = await compile(xml, SemanticProfileId.NestedEmbeddedScopeData, delegates);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true, label);
  // Both levels agree independently, so a Program-only or checked-only relaxation cannot pass.
  assert.deepEqual(structuredScopeDataProgramStartNames(result.semanticProcess),
    structuredScopeDataCheckedStartNames(result.checkedProcess), label);
  return result;
}

function replaceOnce(xml: string, from: string | RegExp, to: string): string {
  const matches = xml.match(typeof from === "string" ? new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
    : new RegExp(from.source, "g"));
  assert.equal(matches?.length, 1, String(from));
  return xml.replace(from, to);
}

const controlGraph = (graph: CheckedProcess) => ({ ...graph, flows: graph.sequenceFlows });

test("the purchase request forks at its only scope on the concurrent route", async () => {
  const { checkedProcess, semanticProcess } = await admitted(await retained("single-scope-models", "purchase-request"),
    ["checkBudget"], "purchase-request");
  assert.equal(checkedProcess.definitionScopes.length, 1);
  assert.equal(semanticProcess.definitionScopes.length, 1);
  assert.notEqual(nestedScopeControlCheckedAnalysis(controlGraph(checkedProcess)), null);
  assert.notEqual(nestedScopeControlProgramAnalysis(semanticProcess), null);
  assert.deepEqual(structuredScopeDataProgramStartNames(semanticProcess)?.required, ["request"]);
  assert.deepEqual(checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.NonOperationalTask ||
    kind === CheckedNodeKind.NoneIntermediateThrowEvent).map(({ id }) => id).sort(),
  ["CollectSignature", "LogBudgetCheck", "PurchaseApproved"]);
});

test("the invoice clearing runs its rework loop at its only scope on the re-entry route", async () => {
  const { checkedProcess, semanticProcess } = await admitted(await retained("single-scope-models", "invoice-clearing"),
    ["validateInvoice"], "invoice-clearing");
  assert.equal(semanticProcess.definitionScopes.length, 1);
  assert.notEqual(scopeReentryCheckedAnalysis(checkedProcess), null);
  assert.deepEqual(scopeReentryProgramAnalysis(semanticProcess), scopeReentryCheckedAnalysis(checkedProcess));
  assert.deepEqual(structuredScopeDataProgramStartNames(semanticProcess)?.required, ["invoice"]);
});

test("a serial model whose only other scope is a called Process is admitted on the serial route", async () => {
  const xml = await retained("call-variable-mapping", "loan-application");
  const unedited = await admitted(xml, ["acknowledgeApplication"], "loan-application");
  assert.equal(unedited.semanticProcess.definitionScopes.length, 3);
  const flattened = replaceOnce(xml, /<subProcess id="ReviewApplication"[\s\S]*?<\/subProcess>/,
    '<userTask id="ReviewApplication" name="Review application" />');
  const { checkedProcess, semanticProcess } = await admitted(flattened, ["acknowledgeApplication"], "flattened loan");
  assert.equal(semanticProcess.definitionScopes.length, 2);
  assert.notEqual(nestedScopeCheckedAnalysis(checkedProcess), null);
  assert.notEqual(nestedScopeProgramAnalysis(semanticProcess), null);
  // The retained approval journey, its last step retargeted from the Sub-Process's task to the flattened Review
  // application, runs to completion in the core, and NSD-TASK-01 still refuses a non-empty patch on that task.
  const journey = JSON.parse(await readFile(new URL("call-variable-mapping/loan-approved.scenario.json", scenarios), "utf8"));
  const run = (submittedValues: unknown[]) => runFlattened(journey, semanticProcess, submittedValues);
  const completed = run([]);
  assert.equal(completed.last, CommandOutcome.Committed);
  assert.equal(completed.status, ProcessStatus.Completed);
  const patched = run([{ name: "decision", value: { kind: "string", value: "referred" } }]);
  assert.equal(patched.last, CommandOutcome.Rejected);
  assert.equal(patched.status, ProcessStatus.Running);
});

function runFlattened(journey: Scenario, program: SemanticProcessProgram, submittedValues: unknown[]) {
  const last = journey.stimuli.at(-1);
  assert.ok(last?.kind === "completeUserTaskInstance");
  const scenario = { ...journey,
    bpmn: { ...journey.bpmn, id: program.identity.sourceId, sha256: program.identity.sourceSha256,
      sourceOverlay: program.identity.sourceOverlay },
    stimuli: [...journey.stimuli.slice(0, -1), { ...last, commandId: "complete-review",
      taskId: { ...last.taskId, elementId: "ReviewApplication" }, submittedValues }] } as Scenario;
  assert.equal(supportsSemanticProcessScenario(scenario, program), true);
  const trace = runScenario(scenario, program).trace;
  const command = trace.findLast(entry => entry.kind === CanonicalObservationKind.Command);
  const state = trace.at(-1);
  assert.ok(command?.kind === CanonicalObservationKind.Command && state?.kind === CanonicalObservationKind.State);
  return { last: command.outcome, status: state.status };
}

const serial = (body: string, flows: string) => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
             id="Definitions_Serial" targetNamespace="urn:bpmn-lean:serial">
  <process id="Process_Serial" isExecutable="true">
    <startEvent id="Opened" />${body}
    <endEvent id="Closed" />${flows}
  </process>
</definitions>`;

const recordTask = `
    <serviceTask id="Record" implementation="${activity}" camunda:delegateExpression="\${record}" camunda:asyncBefore="true">
      <extensionElements><camunda:inputOutput>
        <camunda:inputParameter name="entry">\${entry}</camunda:inputParameter>
        <camunda:outputParameter name="receipt">\${receipt}</camunda:outputParameter>
      </camunda:inputOutput></extensionElements>
    </serviceTask>`;

test("a degenerate single scope keeps the serial overlay rule while its one-Service-Task twin is admitted", async () => {
  const bare = serial("", '\n    <sequenceFlow id="Flow_Closed" sourceRef="Opened" targetRef="Closed" />');
  // NSD-ADMIT-01's overlay rule: a serial model binds at least one handler, with or without a Sub-Process.
  assert.equal((await compile(bare, SemanticProfileId.NestedEmbeddedScopeData, [])).status, BpmnCompilationStatus.Rejected);
  const recorded = serial(recordTask, `
    <sequenceFlow id="Flow_Record" sourceRef="Opened" targetRef="Record" />
    <sequenceFlow id="Flow_Recorded" sourceRef="Record" targetRef="Closed" />`);
  const { semanticProcess } = await admitted(recorded, ["record"], "recorded");
  assert.equal(semanticProcess.definitionScopes.length, 1);
});

const budgetLog = `
  <process id="Process_BudgetLog" isExecutable="true">
    <startEvent id="LogOpened" /><userTask id="WriteLog" /><endEvent id="LogClosed" />
    <sequenceFlow id="Flow_LogOpened" sourceRef="LogOpened" targetRef="WriteLog" />
    <sequenceFlow id="Flow_LogWritten" sourceRef="WriteLog" targetRef="LogClosed" />
  </process>
</definitions>`;
const loggedCall = `<callActivity id="LogBudgetCheck" name="Log budget check" calledElement="Process_BudgetLog">
      <extensionElements><camunda:in source="request" target="request" /></extensionElements>
    </callActivity>`;
const terminalFork = `
    <parallelGateway id="Split" />
    <userTask id="Review" />
    <userTask id="Approve" />
    <endEvent id="Approved" />`;
const terminalFlows = (from: string, to: string) => `
    <sequenceFlow id="Flow_Split" sourceRef="${from}" targetRef="Split" />
    <sequenceFlow id="Flow_Review" sourceRef="Split" targetRef="Review" />
    <sequenceFlow id="Flow_Approve" sourceRef="Split" targetRef="Approve" />
    <sequenceFlow id="Flow_Reviewed" sourceRef="Review" targetRef="${to}" />
    <sequenceFlow id="Flow_Approved" sourceRef="Approve" targetRef="Approved" />`;
const checkedRefusal = "The checked graph does not satisfy nested scope-data admission.";

test("each excluded single-scope form is refused", async () => {
  const purchase = await retained("single-scope-models", "purchase-request");
  const refusals: ReadonlyArray<readonly [string, string]> = [
    ["a Call in the forking root", replaceOnce(replaceOnce(purchase, '<task id="LogBudgetCheck" name="Log budget check" />',
      loggedCall), /\n  <\/process>\n<\/definitions>\n?$/, `\n  </process>${budgetLog}`)],
    // A forking root reaches a second None End only through a terminal branch; a fork that also joins is refused in
    // a body too, so the separating form is the terminal fork.
    ["a terminal fork, the root's second None End", serial(terminalFork, terminalFlows("Opened", "Closed"))],
  ];
  // Each refusal is the graph rule's: the reader admits every element, so a mapping or overlay refusal cannot stand in.
  for (const [label, xml] of refusals) {
    const result = await compile(xml, SemanticProfileId.NestedEmbeddedScopeData, ["checkBudget"]);
    assert.equal(result.status, BpmnCompilationStatus.Rejected, label);
    assert.deepEqual(result.diagnostics.map(({ evidence }) => evidence), [checkedRefusal], label);
  }
});

const wrapped = (body: string, inner: string, innerFlows: string) => serial(`
    <subProcess id="Work">
      <startEvent id="WorkOpened" />${inner}
      <endEvent id="WorkClosed" />${innerFlows}
    </subProcess>${body}`, `
    <sequenceFlow id="Flow_Work" sourceRef="Opened" targetRef="Work" />
    <sequenceFlow id="Flow_Worked" sourceRef="Work" targetRef="Closed" />`);

const reviewTasks = `
    <parallelGateway id="Split" />
    <userTask id="Review" />
    <userTask id="Approve" />
    <parallelGateway id="Join" />`;

const reviewFlows = (from: string, to: string) => `
    <sequenceFlow id="Flow_Split" sourceRef="${from}" targetRef="Split" />
    <sequenceFlow id="Flow_Review" sourceRef="Split" targetRef="Review" />
    <sequenceFlow id="Flow_Approve" sourceRef="Split" targetRef="Approve" />
    <sequenceFlow id="Flow_Reviewed" sourceRef="Review" targetRef="Join" />
    <sequenceFlow id="Flow_Approved" sourceRef="Approve" targetRef="Join" />
    <sequenceFlow id="Flow_Joined" sourceRef="Join" targetRef="${to}" />`;

test("the embedded completion profile refuses each single-scope control and admits its Sub-Process twin", async () => {
  const pairs: ReadonlyArray<readonly [string, string, string, readonly string[] | null]> = [
    ["data-free fork", serial(reviewTasks, reviewFlows("Opened", "Closed")),
    wrapped("", reviewTasks, reviewFlows("WorkOpened", "WorkClosed")), null],
    ["data-bearing", serial(recordTask, `
    <sequenceFlow id="Flow_Record" sourceRef="Opened" targetRef="Record" />
    <sequenceFlow id="Flow_Recorded" sourceRef="Record" targetRef="Closed" />`),
    wrapped("", recordTask, `
      <sequenceFlow id="Flow_Record" sourceRef="WorkOpened" targetRef="Record" />
      <sequenceFlow id="Flow_Recorded" sourceRef="Record" targetRef="WorkClosed" />`), ["record"]],
  ];
  for (const [label, single, twin, delegates] of pairs) {
    const twinResult = await compile(twin, SemanticProfileId.EmbeddedSubProcessCompletion, delegates);
    assert.ok(twinResult.status === BpmnCompilationStatus.Accepted, `${label} twin: ${JSON.stringify(twinResult.diagnostics)}`);
    assert.equal((await compile(single, SemanticProfileId.EmbeddedSubProcessCompletion, delegates)).status,
      BpmnCompilationStatus.Rejected, label);
    // Past the source reader: the single-scope graph and Program the nested profile admits, relabelled to the embedded
    // completion profile, are refused by the shared analyses, so a relaxation keyed on anything but identity fails.
    // A forking nested model may bind no handler (CSSD-ADMIT-01), so the data-free fork compiles with an empty overlay.
    const nested = await compile(single, SemanticProfileId.NestedEmbeddedScopeData, delegates ?? []);
    assert.ok(nested.status === BpmnCompilationStatus.Accepted, `${label} nested: ${JSON.stringify(nested.diagnostics)}`);
    const graph = { ...nested.checkedProcess, identity: { ...nested.checkedProcess.identity,
      semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion } };
    const program = { ...nested.semanticProcess, identity: { ...nested.semanticProcess.identity,
      semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion } };
    assert.equal(nestedScopeControlCheckedAnalysis(controlGraph(graph)), null, `${label} checked`);
    assert.equal(nestedScopeControlProgramAnalysis(program), null, `${label} Program`);
  }
});

test("the refused Call and terminal fork are admitted where the account admits them", async () => {
  const purchase = await retained("single-scope-models", "purchase-request");
  const checkBudget = purchase.slice(purchase.indexOf("    <serviceTask"), purchase.indexOf('    <task id="LogBudgetCheck"'));
  const serialCall = serial(`\n${checkBudget}    ${loggedCall}`, `
    <sequenceFlow id="Flow_ToBudget" sourceRef="Opened" targetRef="CheckBudget" />
    <sequenceFlow id="Flow_BudgetChecked" sourceRef="CheckBudget" targetRef="LogBudgetCheck" />
    <sequenceFlow id="Flow_BudgetLogged" sourceRef="LogBudgetCheck" targetRef="Closed" />`)
    .replace(/\n  <\/process>\n<\/definitions>$/, `\n  </process>${budgetLog}`);
  await admitted(serialCall, ["checkBudget"], "the same Call in a serial root");
  await admitted(wrapped("", terminalFork, terminalFlows("WorkOpened", "WorkClosed")), [], "the terminal fork in a body");
});
