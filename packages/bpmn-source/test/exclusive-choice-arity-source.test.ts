/**
 * XCA-ADMIT-01 and the source half of XCA-ORDER-01 over the retained complaint handling model, through the exact-bytes
 * source path and the core's checked-graph and Program analyses. The oracle is the Exclusive choice arity proposal's
 * "Separating witnesses": candidate order is XML declaration order, which only this lane can observe
 * (CIB-INT-0001), and every refused edit differs from the admitted model in the one fact its label names.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, BpmnSourceDiagnosticCode, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CheckedNodeKind, SemanticOperationKind, SemanticProfileId, concurrentStructuredScopeDataProgram,
  structuredScopeDataCheckedAnalysis, structuredScopeDataProgramAnalysis,
} from "@bpmn-lean/semantic-core";
import type { CheckedProcess, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/exclusive-choice-arity/", import.meta.url);
const complaint = await readFile(new URL("complaint-handling.bpmn", directory), "utf8");
const overlay = new Uint8Array(await readFile(new URL("complaint-handling-overlay.json", directory)));

async function compile(xml: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "complaint-handling", expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "complaint-handling-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: semanticProcessTestLimits,
  });
}

async function admitted(label: string, xml: string) {
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  return result;
}

async function refused(label: string, xml: string): Promise<void> {
  const result = await compile(xml);
  assert.equal(result.status, BpmnCompilationStatus.Rejected, label);
  assert.deepEqual(result.diagnostics.map(({ code }) => code), [BpmnSourceDiagnosticCode.UnsupportedModel], label);
}

/** `xml` with each `[from, to]` replaced exactly once. */
function edited(xml: string, ...replacements: readonly (readonly [string, string])[]): string {
  return replacements.reduce((current, [from, to]) => {
    assert.equal(current.split(from).length, 2, from);
    return current.replace(from, to);
  }, xml);
}

/** The exact source text of the `sequenceFlow` element `id`, conditional or not. */
function flowElement(xml: string, id: string): string {
  const match = new RegExp(`    <sequenceFlow id="${id}"[^>]*?(?:/>|>[\\s\\S]*?</sequenceFlow>)\\n`, "u").exec(xml);
  assert.ok(match, id);
  return match[0];
}

/** The targets of a checked Choice's candidates, in candidate order. */
function checkedTargets(process: CheckedProcess, gateway: string): readonly string[] {
  const node = process.nodes.find(({ id }) => id === gateway);
  assert.ok(node?.kind === CheckedNodeKind.ExclusiveGateway, gateway);
  return node.candidateFlowIds.map(flowId => process.sequenceFlows.find(({ id }) => id === flowId)!.targetId);
}

/** The flow origins of the IL Choice's candidates, in candidate order. */
function programOrigins(program: SemanticProcessProgram, gateway: string): readonly string[] {
  const choice = program.operations.find(operation =>
    operation.kind === SemanticOperationKind.Choose && operation.origin.elementId === gateway);
  assert.ok(choice?.kind === SemanticOperationKind.Choose, gateway);
  return choice.candidates.map(({ origin }) => origin.elementId);
}

const routeTargets = ["EscalateToSupervisor", "CorrectInvoice", "ReshipOrder"];

test("XCA-ADMIT-01 admits a three-condition and a one-condition Choice, in declaration order, requiring orderNumber", async () => {
  const { checkedProcess, semanticProcess } = await admitted("complaint handling", complaint);
  assert.deepEqual(checkedTargets(checkedProcess, "RouteComplaint"), routeTargets);
  assert.deepEqual(checkedTargets(checkedProcess, "FollowUpNeeded"), ["ConfirmDelivery"]);
  assert.deepEqual(programOrigins(semanticProcess, "RouteComplaint"), ["Flow_Escalate", "Flow_Invoice", "Flow_Reship"]);
  assert.deepEqual(programOrigins(semanticProcess, "FollowUpNeeded"), ["Flow_FollowUp"]);
  assert.equal(concurrentStructuredScopeDataProgram(semanticProcess), false);
  // SRE-AVAILABLE-01: a Choice's reads require nothing, and Review complaint's inputs are literals, so only the root
  // Service Task's input is a required Start binding.
  assert.deepEqual(structuredScopeDataCheckedAnalysis(checkedProcess), ["orderNumber"]);
  assert.deepEqual(structuredScopeDataProgramAnalysis(semanticProcess), ["orderNumber"]);
});

test("XCA-ORDER-01 takes candidate order from flow declarations, never from flow ids or outgoing references", async () => {
  const [escalate, invoice, reship] = ["Flow_Escalate", "Flow_Invoice", "Flow_Reship"].map(id => flowElement(complaint, id));
  const reversed = edited(complaint, [`${escalate!}${invoice!}${reship!}`, `${reship!}${invoice!}${escalate!}`]);
  const { checkedProcess, semanticProcess } = await admitted("reversed declarations", reversed);
  assert.deepEqual(checkedTargets(checkedProcess, "RouteComplaint"), [...routeTargets].reverse());
  assert.deepEqual(programOrigins(semanticProcess, "RouteComplaint"), ["Flow_Reship", "Flow_Invoice", "Flow_Escalate"]);
  // Ids that sort against declaration order, with the outgoing references reordered by id: nothing changes.
  const renamed = edited(complaint,
    ["Flow_Escalate\"", "Flow_Z\""], ["Flow_Invoice\"", "Flow_Y\""], ["Flow_Reship\"", "Flow_X\""],
    [`      <outgoing>Flow_Escalate</outgoing>
      <outgoing>Flow_Invoice</outgoing>
      <outgoing>Flow_Reship</outgoing>`, `      <outgoing>Flow_X</outgoing>
      <outgoing>Flow_Y</outgoing>
      <outgoing>Flow_Z</outgoing>`]);
  const renamedResult = await admitted("renamed ids", renamed);
  assert.deepEqual(checkedTargets(renamedResult.checkedProcess, "RouteComplaint"), routeTargets);
  assert.deepEqual(programOrigins(renamedResult.semanticProcess, "RouteComplaint"), ["Flow_Z", "Flow_Y", "Flow_X"]);
});

test("XCA-ADMIT-01 refuses each one-fact edit of the complaint model that leaves the class", async () => {
  await refused("Route complaint without its default", edited(complaint,
    [` default="Flow_Answer">`, ">"], ["      <outgoing>Flow_Answer</outgoing>\n", ""],
    [`    <userTask id="AnswerCustomer" name="Answer customer" />\n`, ""],
    [flowElement(complaint, "Flow_Answer"), ""], [flowElement(complaint, "Flow_Answered"), ""]));
  await refused("a fourth outgoing flow without a condition", edited(complaint,
    ["      <outgoing>Flow_Answer</outgoing>\n", "      <outgoing>Flow_Answer</outgoing>\n      <outgoing>Flow_Refund</outgoing>\n"],
    [`    <userTask id="AnswerCustomer" name="Answer customer" />\n`,
      `    <userTask id="AnswerCustomer" name="Answer customer" />\n    <userTask id="IssueRefund" name="Issue refund" />\n`],
    [flowElement(complaint, "Flow_Answered"), `${flowElement(complaint, "Flow_Answered")}` +
      `    <sequenceFlow id="Flow_Refund" sourceRef="RouteComplaint" targetRef="IssueRefund" />\n` +
      `    <sequenceFlow id="Flow_Refunded" sourceRef="IssueRefund" targetRef="ComplaintHandled" />\n`]));
  await refused("a condition on the default", edited(complaint,
    [flowElement(complaint, "Flow_Answer"), `    <sequenceFlow id="Flow_Answer" sourceRef="RouteComplaint" targetRef="AnswerCustomer">
      <conditionExpression xsi:type="tFormalExpression">stringEquals(category,"other")</conditionExpression>
    </sequenceFlow>\n`]));
  await refused("a three-condition Choice in the body of Review complaint", edited(complaint,
    [`      <endEvent id="ReviewClosed" name="Review closed" />`,
      `      <exclusiveGateway id="TriageComplaint" default="Flow_TriageOther" />
      <userTask id="TriageUrgent" /><userTask id="TriageBilling" /><userTask id="TriageDelivery" /><userTask id="TriageOther" />
      <exclusiveGateway id="TriageDone" />
      <endEvent id="ReviewClosed" name="Review closed" />`],
    [`      <sequenceFlow id="Flow_Classified" sourceRef="ClassifyComplaint" targetRef="ReviewClosed" />`,
      `      <sequenceFlow id="Flow_Classified" sourceRef="ClassifyComplaint" targetRef="TriageComplaint" />
      <sequenceFlow id="Flow_TriageUrgent" sourceRef="TriageComplaint" targetRef="TriageUrgent"><conditionExpression xsi:type="tFormalExpression">stringEquals(priority,"urgent")</conditionExpression></sequenceFlow>
      <sequenceFlow id="Flow_TriageBilling" sourceRef="TriageComplaint" targetRef="TriageBilling"><conditionExpression xsi:type="tFormalExpression">stringEquals(category,"billing")</conditionExpression></sequenceFlow>
      <sequenceFlow id="Flow_TriageDelivery" sourceRef="TriageComplaint" targetRef="TriageDelivery"><conditionExpression xsi:type="tFormalExpression">stringEquals(category,"delivery")</conditionExpression></sequenceFlow>
      <sequenceFlow id="Flow_TriageOther" sourceRef="TriageComplaint" targetRef="TriageOther" />
      <sequenceFlow id="Flow_UrgentDone" sourceRef="TriageUrgent" targetRef="TriageDone" />
      <sequenceFlow id="Flow_BillingDone" sourceRef="TriageBilling" targetRef="TriageDone" />
      <sequenceFlow id="Flow_DeliveryDone" sourceRef="TriageDelivery" targetRef="TriageDone" />
      <sequenceFlow id="Flow_OtherDone" sourceRef="TriageOther" targetRef="TriageDone" />
      <sequenceFlow id="Flow_Triaged" sourceRef="TriageDone" targetRef="ReviewClosed" />`]));
});
