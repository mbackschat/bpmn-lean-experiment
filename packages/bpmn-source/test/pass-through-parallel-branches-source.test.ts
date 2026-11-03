/**
 * PTPB-ADMIT-01, PTPB-WORK-01, PTPB-CALL-01 and PTPB-BURST-01 over the retained pass-through branch models through the
 * exact-bytes source path, at the Program and checked levels. The oracle is the approved specification's witness
 * account: each model compiles under the nested scope-data profile with its Tasks lowered to one-input merges, and each
 * refusal is a one-fact edit of an admitted model or of a twin the test admits beside it, so a gate refusing every Task
 * on a branch, or admitting every one, cannot pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CheckedNodeKind, SemanticOperationKind, isWellFormedSemanticProcessProgram, nestedScopeControlCheckedAnalysis,
  nestedScopeControlProgramAnalysis, structuredScopeDataCheckedStartNames, structuredScopeDataProgramStartNames,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const semanticProfile = "cibseven-2.2.0-nested-embedded-scope-data-draft";

type Retained = Readonly<{ family: string; model: string }>;
const relocation: Retained = { family: "pass-through-parallel-branches", model: "office-relocation" };
const settlement: Retained = { family: "pass-through-parallel-branches", model: "invoice-settlement" };
const loan: Retained = { family: "concurrent-structured-scope-data", model: "loan-assessment" };

const directory = ({ family }: Retained): URL => new URL(`../../../scenarios/${family}/`, import.meta.url);
const source = async (retained: Retained): Promise<string> =>
  readFile(new URL(`${retained.model}.bpmn`, directory(retained)), "utf8");

async function compile(retained: Retained, xml: string) {
  const bytes = await readFile(new URL(`${retained.model}-overlay.json`, directory(retained)));
  const sourceOverlay = { id: `${retained.model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: retained.model,
    expectedSha256: undefined, semanticProfile, sourceOverlay, limits: semanticProcessTestLimits });
}

async function admitted(retained: Retained, xml: string, label = retained.model) {
  const result = await compile(retained, xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true, label);
  // Both levels agree independently, so a Program-only or checked-only relaxation cannot pass.
  assert.deepEqual(structuredScopeDataProgramStartNames(result.semanticProcess),
    structuredScopeDataCheckedStartNames(result.checkedProcess), label);
  return result;
}

async function refused(retained: Retained, xml: string, label: string): Promise<void> {
  assert.equal((await compile(retained, xml)).status, BpmnCompilationStatus.Rejected, label);
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

/** `count` plain Tasks inserted on `flow`, which keeps its source and now enters the first inserted Task. */
function chain(xml: string, flow: string, count: number): string {
  const match = new RegExp(`<sequenceFlow id="${flow}" sourceRef="(\\w+)" targetRef="(\\w+)" />`, "u").exec(xml);
  assert.ok(match !== null, flow);
  const [, from, to] = match;
  const ids = Array.from({ length: count }, (_, index) => `Chained${index + 1}`);
  const steps = [from!, ...ids, to!];
  const tasks = ids.map(id => `<task id="${id}" name="Chained step" />`).join("");
  const flows = steps.slice(1).map((target, index) =>
    `<sequenceFlow id="${index === 0 ? flow : `Flow_Chained${index}`}" sourceRef="${steps[index]}" targetRef="${target}" />`).join("");
  return replaceOnce(xml, match[0], tasks + flows);
}

const passThroughTasks = { "office-relocation": ["CloseRelocationTicket", "FileMoversConfirmation", "HandOverKeys",
  "LabelBoxes", "NotifyFacilities"], "invoice-settlement": ["ArchiveReceipt", "NotifyAccounting"] } as const;

test("both witnesses are admitted with every Task kept as a source node and lowered to a one-input merge", async () => {
  for (const retained of [relocation, settlement]) {
    const { checkedProcess, semanticProcess } = await admitted(retained, await source(retained));
    const ids = passThroughTasks[retained.model as keyof typeof passThroughTasks];
    assert.deepEqual(checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.NonOperationalTask)
      .map(({ id }) => id).sort(), [...ids]);
    for (const id of ids) {
      const operations = semanticProcess.operations.filter(({ origin }) => origin.elementId === id);
      assert.equal(operations.length, 1, id);
      const [operation] = operations;
      assert.ok(operation?.kind === SemanticOperationKind.MergeExclusive, id);
      assert.equal(operation.inputs.length, 1, id);
    }
  }
});

test("the office relocation's longest closure is the fork closure of seven steps at both levels", async () => {
  const { checkedProcess, semanticProcess } = await admitted(relocation, await source(relocation));
  assert.equal(nestedScopeControlProgramAnalysis(semanticProcess), 7);
  assert.equal(nestedScopeControlCheckedAnalysis({ ...checkedProcess, flows: checkedProcess.sequenceFlows }), 7);
});

test("a forking burst of eight through chained Tasks on a branch is admitted and one of nine is refused", async () => {
  const xml = await source(relocation);
  const { semanticProcess } = await admitted(relocation, chain(xml, "Flow_FacilitiesNotified", 1));
  assert.equal(nestedScopeControlProgramAnalysis(semanticProcess), 8);
  await refused(relocation, chain(xml, "Flow_FacilitiesNotified", 2), "nine-step fork closure");
});

test("a pass-through Task with a second outgoing flow on a branch is refused", async () => {
  await refused(relocation, replaceOnce(await source(relocation), '<sequenceFlow id="Flow_Ready" ',
    '<sequenceFlow id="Flow_Split" sourceRef="NotifyFacilities" targetRef="CloseRelocationTicket" />' +
    '<sequenceFlow id="Flow_Ready" '), "two outgoing flows on a branch");
});

test("an empty branch from a fork straight to its join is refused", async () => {
  await refused(settlement, replaceOnce(await source(settlement), '<sequenceFlow id="Flow_Recorded" ',
    '<sequenceFlow id="Flow_Empty" sourceRef="RecordInvoice" targetRef="InvoiceRecorded" />' +
    '<sequenceFlow id="Flow_Recorded" '), "empty branch");
});

/**
 * The invoice body's join replaced by separate Ends: the second branch reaches a User Task, and the first branch is
 * `first`. The twin whose first branch also waits is admitted, so only the wait-free terminal branch decides.
 */
function terminalFork(xml: string, first: string): string {
  const joined = '<parallelGateway id="InvoiceRecorded" name="Invoice recorded" />';
  const flows = '<sequenceFlow id="Flow_Archived" sourceRef="ArchiveReceipt" targetRef="InvoiceRecorded" />' +
    "\n      " + '<sequenceFlow id="Flow_AccountingNotified" sourceRef="NotifyAccounting" targetRef="InvoiceRecorded" />' +
    "\n      " + '<sequenceFlow id="Flow_Recorded" sourceRef="InvoiceRecorded" targetRef="ReviewClosed" />';
  const archive = '<task id="ArchiveReceipt" name="Archive receipt" />';
  let edited = replaceOnce(replaceOnce(xml, joined, '<userTask id="ConfirmBooking" name="Confirm booking" />' +
    '<endEvent id="ReceiptArchived" name="Receipt archived" />'), flows,
    '<sequenceFlow id="Flow_Archived" sourceRef="ArchiveReceipt" targetRef="ReceiptArchived" />' +
    '<sequenceFlow id="Flow_AccountingNotified" sourceRef="NotifyAccounting" targetRef="ConfirmBooking" />' +
    '<sequenceFlow id="Flow_Booked" sourceRef="ConfirmBooking" targetRef="ReviewClosed" />');
  edited = replaceOnce(edited, archive, first);
  return edited;
}

test("a terminal-fork branch that reaches its End without arming a task is refused beside its waiting twin", async () => {
  const xml = await source(settlement);
  await admitted(settlement, terminalFork(xml, '<userTask id="ArchiveReceipt" name="Archive receipt" />'),
    "terminal fork whose branches both wait");
  await refused(settlement, terminalFork(xml, '<task id="ArchiveReceipt" name="Archive receipt" />'),
    "terminal branch of a plain Task alone");
  // A nested fork of two plain Tasks joined before the End: its join is not work, so the branch is still wait-free.
  const nested = '<parallelGateway id="SplitArchive" name="Split archive" />' +
    '<task id="ArchivePaper" name="Archive paper" /><task id="ArchiveScan" name="Archive scan" />' +
    '<parallelGateway id="ArchiveDone" name="Archive done" />' +
    '<sequenceFlow id="Flow_ToPaper" sourceRef="SplitArchive" targetRef="ArchivePaper" />' +
    '<sequenceFlow id="Flow_ToScan" sourceRef="SplitArchive" targetRef="ArchiveScan" />' +
    '<sequenceFlow id="Flow_PaperDone" sourceRef="ArchivePaper" targetRef="ArchiveDone" />' +
    '<sequenceFlow id="Flow_ScanDone" sourceRef="ArchiveScan" targetRef="ArchiveDone" />' +
    '<sequenceFlow id="Flow_ArchiveDone" sourceRef="ArchiveDone" targetRef="ArchiveReceipt" />';
  const throughNested = (task: string): string => replaceOnce(terminalFork(xml, task + nested),
    '<sequenceFlow id="Flow_ToArchive" sourceRef="RecordInvoice" targetRef="ArchiveReceipt" />',
    '<sequenceFlow id="Flow_ToArchive" sourceRef="RecordInvoice" targetRef="SplitArchive" />');
  await admitted(settlement, throughNested('<userTask id="ArchiveReceipt" name="Archive receipt" />'),
    "nested wait-free fork before a waiting Task");
  await refused(settlement, throughNested('<task id="ArchiveReceipt" name="Archive receipt" />'),
    "terminal branch through a nested wait-free fork");
});

test("a Call that only pass-through Tasks separate from its body's Start is refused", async () => {
  const xml = await source(loan);
  const prepare = '<userTask id="PrepareCreditFile" name="Prepare credit file" />';
  await admitted(loan, xml);
  await admitted(loan, chain(xml, "Flow_CreditFilePrepared", 1), "pass-through Task between a wait and the Call");
  await refused(loan, replaceOnce(xml, prepare, '<manualTask id="PrepareCreditFile" name="Prepare credit file" />'),
    "Start, Manual Task, Call");
});

test("a Task on a branch or in a Sub-Process body of a forking Program is admitted", async () => {
  const order: Retained = { family: "concurrent-structured-scope-data", model: "order-fulfilment" };
  const xml = await source(order);
  for (const flow of ["Flow_StockPicked", "Flow_PickingOpened"]) await admitted(order, chain(xml, flow, 1), flow);
});

/**
 * PTPB-PROFILE-01: the embedded completion profile shares the concurrent analysis but never produces a pass vertex, so a
 * one-input merge inserted before a User Task on a branch of its onboarding Program stays a merge outside any region and
 * is refused, while the Program without it is admitted. Under the nested scope-data profile the same edit is a pass vertex.
 */
test("the embedded completion profile refuses a one-input merge its unedited Program does without", async () => {
  const xml = await readFile(new URL("../../../scenarios/nested-embedded-scope-control/employee-onboarding.bpmn",
    import.meta.url), "utf8");
  const result = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "employee-onboarding",
    expectedSha256: undefined, semanticProfile: "cibseven-2.2.0-embedded-subprocess-completion-draft", sourceOverlay: null,
    limits: semanticProcessTestLimits });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const program = result.semanticProcess;
  assert.ok(nestedScopeControlProgramAnalysis(program) !== null);
  const task = program.operations.find(({ origin }) => origin.elementId === "UserTask_AssignDesk");
  assert.ok(task?.kind === SemanticOperationKind.AwaitUserTask);
  const place = program.controlPlaces.find(({ id }) => id === task.input);
  const scope = program.operationScopes.find(({ operationId }) => operationId === task.id);
  assert.ok(place !== undefined && scope !== undefined);
  const passed = `${task.input}:passed`;
  const edited = {
    ...program,
    controlPlaces: [...program.controlPlaces, { ...place, id: passed }],
    operations: [...program.operations.map(operation => operation.id === task.id ? { ...task, input: passed } : operation),
      { id: "pass:AssignDesk", origin: task.origin, kind: SemanticOperationKind.MergeExclusive, inputs: [task.input], output: passed }],
    operationScopes: [...program.operationScopes, { operationId: "pass:AssignDesk", scopeId: scope.scopeId }],
  } as SemanticProcessProgram;
  assert.equal(nestedScopeControlProgramAnalysis(edited), null);
});

/**
 * PTPB-CALL-01's pass-vertex skip runs before the body's structure check, so a cycle of Tasks or one-input merges in a
 * Call-bearing body must be refused rather than followed forever; Lean bounds the same walk by the vertex count.
 */
test("a cycle of pass-through Tasks or one-input merges in a Call-bearing body is refused", async () => {
  const xml = await source(loan);
  await refused(loan, replaceOnce(xml,
    '<sequenceFlow id="Flow_CreditCheckOpened" sourceRef="CreditCheckOpened" targetRef="PrepareCreditFile" />',
    '<task id="T1" /><task id="T2" /><sequenceFlow id="Flow_CreditCheckOpened" sourceRef="CreditCheckOpened" ' +
      'targetRef="T1" /><sequenceFlow id="Flow_T1" sourceRef="T1" targetRef="T2" /><sequenceFlow id="Flow_T2" ' +
      'sourceRef="T2" targetRef="T1" />'), "Start, then a two-Task cycle");
  const result = await admitted(loan, xml);
  const program = result.semanticProcess;
  const task = program.operations.find(({ origin }) => origin.elementId === "PrepareCreditFile");
  assert.ok(task?.kind === SemanticOperationKind.AwaitUserTask);
  const place = program.controlPlaces.find(({ id }) => id === task.input);
  const scope = program.operationScopes.find(({ operationId }) => operationId === task.id);
  assert.ok(place !== undefined && scope !== undefined);
  const entry = task.input;
  const cycled = {
    ...program,
    controlPlaces: [...program.controlPlaces, { ...place, id: "orphaned" }, { ...place, id: "between" }],
    operations: [...program.operations.map(operation => operation.id === task.id ? { ...task, input: "orphaned" } : operation),
      { id: "pass:first", origin: task.origin, kind: SemanticOperationKind.MergeExclusive, inputs: [entry], output: "between" },
      { id: "pass:second", origin: task.origin, kind: SemanticOperationKind.MergeExclusive, inputs: ["between"], output: entry }],
    operationScopes: [...program.operationScopes, { operationId: "pass:first", scopeId: scope.scopeId },
      { operationId: "pass:second", scopeId: scope.scopeId }],
  } as SemanticProcessProgram;
  assert.equal(nestedScopeControlProgramAnalysis(cycled), null);
});

/**
 * PTPB-PROFILE-01 at the checked level: the embedded completion source reader never emits a `nonOperationalTask`, so
 * only a direct call with that profile's identity can catch a checked-level gate that produces a pass vertex for every
 * profile.
 */
test("the checked analysis produces a pass vertex under the nested scope-data profile only", async () => {
  const { checkedProcess } = await admitted(relocation, await source(relocation));
  const graph = { ...checkedProcess, flows: checkedProcess.sequenceFlows };
  assert.ok(checkedProcess.nodes.some(({ kind }) => kind === CheckedNodeKind.NonOperationalTask));
  assert.notEqual(nestedScopeControlCheckedAnalysis(graph), null);
  assert.equal(nestedScopeControlCheckedAnalysis({ ...graph, identity: { ...graph.identity,
    semanticProfile: "cibseven-2.2.0-embedded-subprocess-completion-draft" } }), null);
});
