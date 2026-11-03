/**
 * XND-ADMIT-01 and XND-ROUTE-01's source lane over the two default-less Choice witnesses. The oracle is the proposal's
 * witness account: both models compile without inventing a default, each refused edit is refused beside a control that
 * differs only in giving every Choice a default (so the refusal can come only from the new rule), flow ids decide nothing,
 * and only the nested scope-data profile admits an absent default at either level.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import { CheckedNodeKind, SemanticOperationKind, SemanticProfileId } from "@bpmn-lean/semantic-core";
import { readFile } from "node:fs/promises";
import { compileWitness } from "./exclusive-choice-without-default-fixture.ts";
import type { Model } from "./exclusive-choice-without-default-fixture.ts";

const source = (model: Model) =>
  readFile(new URL(`../../../scenarios/exclusive-choice-without-default/${model}.bpmn`, import.meta.url), "utf8");

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

async function admitted(model: Model, xml: string) {
  const result = await compileWitness(model, () => xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result;
}

async function refused(model: Model, xml: string, label: string): Promise<void> {
  assert.equal((await compileWitness(model, () => xml)).status, BpmnCompilationStatus.Rejected, label);
}

/** Gives a Choice a default flow to `target`, the all-defaults control of each refused edit. */
function withDefault(xml: string, gateway: string, lastOutgoing: string, target: string): string {
  const flow = `Flow_${gateway}Default`;
  return replaceOnce(replaceOnce(replaceOnce(xml, `id="${gateway}" name`, `default="${flow}" id="${gateway}" name`),
    `<outgoing>${lastOutgoing}</outgoing>`, `<outgoing>${lastOutgoing}</outgoing><outgoing>${flow}</outgoing>`),
  "</process>", `<sequenceFlow id="${flow}" sourceRef="${gateway}" targetRef="${target}" /></process>`);
}

const expenseDefaults = (xml: string) => withDefault(withDefault(xml, "RouteExpense", "Flow_Equipment", "ExpenseReviewed"),
  "PayOut", "Flow_Payroll", "ExpensePaid");
const ticketDefaults = (xml: string) => withDefault(xml, "RouteBySeverity", "Flow_Low", "TicketHandled");

test("XND-ADMIT-01: both models compile with no default on any checked Choice or IL Choose", async () => {
  for (const model of ["expense-routing", "ticket-triage"] as const) {
    const { checkedProcess, semanticProcess } = await admitted(model, await source(model));
    const gateways = checkedProcess.nodes.filter(node => node.kind === CheckedNodeKind.ExclusiveGateway);
    const chooses = semanticProcess.operations.filter(operation => operation.kind === SemanticOperationKind.Choose);
    assert.equal(gateways.length, model === "expense-routing" ? 2 : 1);
    assert.equal(chooses.length, gateways.length);
    for (const value of [...gateways, ...chooses]) {
      assert.deepEqual(["defaultFlowId", "defaultOutput", "defaultOrigin"].filter(key => key in value), []);
    }
  }
});

test("XND-ROUTE-01: renamed flow ids and reordered outgoing references leave the candidate order to declaration order", async () => {
  const xml = await source("expense-routing");
  const renamed = ["Urgent", "Travel", "Equipment"].reduce((text, name, index) =>
    text.replaceAll(`"Flow_${name}"`, `"Z${2 - index}_${name}"`).replaceAll(`>Flow_${name}<`, `>Z${2 - index}_${name}<`), xml);
  const reordered = replaceOnce(renamed, "<outgoing>Z2_Urgent</outgoing>\n      <outgoing>Z1_Travel</outgoing>\n      <outgoing>Z0_Equipment</outgoing>",
    "<outgoing>Z0_Equipment</outgoing>\n      <outgoing>Z1_Travel</outgoing>\n      <outgoing>Z2_Urgent</outgoing>");
  const { semanticProcess } = await admitted("expense-routing", reordered);
  const route = semanticProcess.operations.find(({ origin }) => origin.elementId === "RouteExpense");
  assert.ok(route?.kind === SemanticOperationKind.Choose);
  assert.deepEqual(route.candidates.map(({ origin }) => origin.elementId), ["Z2_Urgent", "Z1_Travel", "Z0_Equipment"]);
});

test("XND-ADMIT-01: an effect result reaching a default-less Choice is refused, while its all-defaults control is admitted", async () => {
  const autoTriage = '<serviceTask id="AutoTriage" name="Auto-triage" implementation="urn:bpmn-lean:effect-protocol:activity-v1" ' +
    'camunda:delegateExpression="${autoCloseTicket}" camunda:asyncBefore="true" />';
  // Wrong algorithm 6: the effect is last in the Triage body, so only a traversal through the Sub-Process end reaches the Choice.
  const lastInBody = (xml: string) => replaceOnce(replaceOnce(xml, '<endEvent id="TriageClosed" name="Triage closed" />',
    `${autoTriage}<endEvent id="TriageClosed" name="Triage closed" />`),
  '<sequenceFlow id="Flow_Triaged" sourceRef="TriageTicket" targetRef="TriageClosed" />',
  '<sequenceFlow id="Flow_Triaged" sourceRef="TriageTicket" targetRef="AutoTriage" />' +
    '<sequenceFlow id="Flow_AutoTriaged" sourceRef="AutoTriage" targetRef="TriageClosed" />');
  const ticket = await source("ticket-triage");
  await admitted("ticket-triage", lastInBody(ticketDefaults(ticket)));
  await refused("ticket-triage", lastInBody(ticket), "effect last in the Sub-Process body");

  const confirm = '<serviceTask id="ConfirmClaimant" name="Confirm claimant" implementation="urn:bpmn-lean:effect-protocol:activity-v1" ' +
    'camunda:delegateExpression="${reimburseClaimant}" camunda:asyncBefore="true" />';
  const beforePayOut = (xml: string) => replaceOnce(replaceOnce(xml, '<endEvent id="ExpenseSettled"', `${confirm}<endEvent id="ExpenseSettled"`),
    '<sequenceFlow id="Flow_Reviewed" sourceRef="ExpenseReviewed" targetRef="PayOut" />',
    '<sequenceFlow id="Flow_Reviewed" sourceRef="ExpenseReviewed" targetRef="ConfirmClaimant" />' +
      '<sequenceFlow id="Flow_Confirmed" sourceRef="ConfirmClaimant" targetRef="PayOut" />');
  const expense = await source("expense-routing");
  await admitted("expense-routing", beforePayOut(expenseDefaults(expense)));
  await refused("expense-routing", beforePayOut(expense), "effect before Pay out");
});

test("XND-ADMIT-01: one conditional flow, or an unconditioned non-default flow, is refused; a mixture with a default is admitted", async () => {
  const expense = await source("expense-routing");
  const payroll = '    <sequenceFlow id="Flow_Payroll" sourceRef="PayOut" targetRef="AddToPayroll">\n' +
    '      <conditionExpression xsi:type="tFormalExpression">stringEquals(payout,"payroll")</conditionExpression>\n' +
    '    </sequenceFlow>\n';
  const oneFlow = replaceOnce(replaceOnce(replaceOnce(replaceOnce(expense, payroll, ""), "      <outgoing>Flow_Payroll</outgoing>\n", ""),
    '    <userTask id="AddToPayroll" name="Add to payroll" />\n', ""),
  '    <sequenceFlow id="Flow_Payrolled" sourceRef="AddToPayroll" targetRef="ExpensePaid" />\n', "");
  await refused("expense-routing", oneFlow, "one conditional flow");
  const unconditioned = replaceOnce(replaceOnce(expense, "<outgoing>Flow_Equipment</outgoing>",
    "<outgoing>Flow_Equipment</outgoing><outgoing>Flow_Other</outgoing>"),
  "</process>", '<sequenceFlow id="Flow_Other" sourceRef="RouteExpense" targetRef="ExpenseReviewed" /></process>');
  await refused("expense-routing", unconditioned, "unconditioned non-default flow");
  const mixture = await admitted("expense-routing", withDefault(expense, "PayOut", "Flow_Payroll", "ExpensePaid"));
  const defaults = new Map(mixture.semanticProcess.operations.flatMap(operation =>
    operation.kind === SemanticOperationKind.Choose ? [[operation.origin.elementId, "defaultOutput" in operation] as const] : []));
  assert.deepEqual(defaults, new Map([["PayOut", true], ["RouteExpense", false]]));
});

test("XND-ADMIT-01's profile control: only the nested scope-data profile admits an absent default at either level", async () => {
  type OperationModule = typeof import("../../semantic-core/src/semantic-process-operation-admission.ts");
  type GraphModule = typeof import("../src/checked-process-graph-admission.ts");
  const { isWellFormedSemanticOperation } = await import(
    new URL("../../semantic-core/dist/semantic-process-operation-admission.js", import.meta.url).href) as OperationModule;
  const { exclusiveChoiceWithoutDefault } = await import(
    new URL("../dist/checked-process-graph-admission.js", import.meta.url).href) as GraphModule;
  const { semanticProcess } = await admitted("ticket-triage", await source("ticket-triage"));
  const choice = semanticProcess.operations.find(operation => operation.kind === SemanticOperationKind.Choose)!;
  assert.ok(choice.kind === SemanticOperationKind.Choose);
  const ids = new Set([choice.input, ...choice.candidates.map(({ output }) => output)]);
  const origins = new Map(choice.candidates.map(({ output, origin }) => [output, origin.elementId] as const));
  const lone = { ...choice, candidates: [choice.candidates[0]] };
  for (const profile of Object.values(SemanticProfileId)) {
    const nested = profile === SemanticProfileId.NestedEmbeddedScopeData;
    assert.equal(isWellFormedSemanticOperation(choice, ids, origins, new Map(), profile), nested, profile);
    assert.equal(isWellFormedSemanticOperation(lone, ids, origins, new Map(), profile), false, profile);
    assert.equal(exclusiveChoiceWithoutDefault(profile), nested, profile);
  }
});
