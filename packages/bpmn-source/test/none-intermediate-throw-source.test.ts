/**
 * NIT-KIND-01, NIT-ADMIT-01 and NIT-PROFILE-01 over the retained None Throw models through the exact-bytes source path,
 * at the Program and checked levels. The oracle is the approved specification's witness account: each model compiles
 * under the nested scope-data profile with its None Throws kept as their own checked node and lowered to one-input
 * merges, and each refusal is a one-fact edit of an admitted model, so a gate refusing every None Throw, or passing any
 * Intermediate Throw Event through as None, cannot pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CheckedNodeKind, SemanticOperationKind, SemanticProfileId, isWellFormedSemanticProcessProgram,
  nestedScopeControlCheckedAnalysis, nestedScopeControlProgramAnalysis, scopeReentryCheckedAnalysis,
  scopeReentryProgramAnalysis, structuredScopeDataCheckedStartNames, structuredScopeDataProgramStartNames,
} from "@bpmn-lean/semantic-core";
import type { CheckedNode, CheckedProcess } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

type Retained = Readonly<{ family: string; model: string }>;
const warranty: Retained = { family: "none-intermediate-throw", model: "warranty-repair" };
const onboarding: Retained = { family: "none-intermediate-throw", model: "onboarding-milestones" };
const loan: Retained = { family: "concurrent-structured-scope-data", model: "loan-assessment" };

const directory = ({ family }: Retained): URL => new URL(`../../../scenarios/${family}/`, import.meta.url);
const source = async (retained: Retained): Promise<string> =>
  readFile(new URL(`${retained.model}.bpmn`, directory(retained)), "utf8");

async function compile(retained: Retained, xml: string) {
  const bytes = await readFile(new URL(`${retained.model}-overlay.json`, directory(retained)));
  const sourceOverlay = { id: `${retained.model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: retained.model,
    expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData, sourceOverlay,
    limits: semanticProcessTestLimits });
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

const noneThrows = {
  "warranty-repair": ["DeviceReleased", "FaultDiagnosed", "RepairStarted", "ReworkRequested"],
  "onboarding-milestones": ["AccountReady", "OnboardingComplete", "WelcomeSent"],
} as const;

test("both witnesses are admitted with every None Throw kept as its own node and lowered to a one-input merge", async () => {
  for (const retained of [warranty, onboarding]) {
    const { checkedProcess, semanticProcess } = await admitted(retained, await source(retained));
    const ids = noneThrows[retained.model as keyof typeof noneThrows];
    assert.deepEqual(checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.NoneIntermediateThrowEvent)
      .map(({ id }) => id).sort(), [...ids]);
    assert.equal(checkedProcess.nodes.some(({ kind }) => kind === CheckedNodeKind.NonOperationalTask), false);
    for (const id of ids) {
      const operations = semanticProcess.operations.filter(({ origin }) => origin.elementId === id);
      assert.equal(operations.length, 1, id);
      const [operation] = operations;
      assert.ok(operation?.kind === SemanticOperationKind.MergeExclusive, id);
      assert.equal(operation.inputs.length, 1, id);
    }
  }
});

test("the warranty repair stands on the re-entry route with its rework closure at the limit of eight", async () => {
  const { checkedProcess, semanticProcess } = await admitted(warranty, await source(warranty));
  // After Test device in a failing round: the body End's two steps, the Choice, Rework requested, the Merge, the scope
  // entry, Repair started and the arming of Replace part.
  assert.equal(scopeReentryProgramAnalysis(semanticProcess)?.burst, 8);
  assert.equal(scopeReentryCheckedAnalysis(checkedProcess)?.burst, 8);
});

test("the onboarding milestones run on the concurrent route with agreeing bursts at both levels", async () => {
  const { checkedProcess, semanticProcess } = await admitted(onboarding, await source(onboarding));
  assert.equal(nestedScopeControlProgramAnalysis(semanticProcess), 7);
  assert.equal(nestedScopeControlCheckedAnalysis({ ...checkedProcess, flows: checkedProcess.sequenceFlows }), 7);
});

test("a None Throw alone on a terminal branch is refused while its waiting twin is admitted", async () => {
  const xml = await source(onboarding);
  // Set up account forks after its Start: Create account as before, beside a terminal branch of `branch` alone.
  const terminal = (branch: string): string => replaceOnce(xml,
    '<sequenceFlow id="Flow_AccountSetupOpened" sourceRef="AccountSetupOpened" targetRef="CreateAccount" />',
    '<parallelGateway id="SplitSetup" /><endEvent id="BadgeClosed" />' + branch +
      '<sequenceFlow id="Flow_AccountSetupOpened" sourceRef="AccountSetupOpened" targetRef="SplitSetup" />' +
      '<sequenceFlow id="Flow_SplitToAccount" sourceRef="SplitSetup" targetRef="CreateAccount" />' +
      '<sequenceFlow id="Flow_SplitToBadge" sourceRef="SplitSetup" targetRef="Badge" />' +
      '<sequenceFlow id="Flow_Badge" sourceRef="Badge" targetRef="BadgeClosed" />');
  await admitted(onboarding, terminal('<userTask id="Badge" name="Print badge" />'), "waiting terminal branch");
  await refused(onboarding, terminal('<intermediateThrowEvent id="Badge" name="Badge requested" />'),
    "wait-free terminal branch");
});

test("each excluded None Throw form is refused", async () => {
  const xml = await source(warranty);
  const throwEvent = '<intermediateThrowEvent id="FaultDiagnosed" name="Fault diagnosed" />';
  const edit = (to: string): string => replaceOnce(xml, throwEvent, to);
  const open = '<intermediateThrowEvent id="FaultDiagnosed" name="Fault diagnosed">';
  const close = "</intermediateThrowEvent>";
  await refused(warranty, edit(`${open}<messageEventDefinition />${close}`), "Message trigger");
  await refused(warranty, edit(`${open}<signalEventDefinition />${close}`), "Signal trigger");
  // moddle declares the reference non-enumerable, so only a refusal by name sees it.
  await refused(warranty, edit(`${open}<eventDefinitionRef>Flow_Requested</eventDefinitionRef>${close}`),
    "referenced EventDefinition");
  await refused(warranty, edit(
    '<intermediateThrowEvent id="FaultDiagnosed" name="Fault diagnosed" camunda:asyncBefore="true" />'),
    "asynchronous continuation");
  await refused(warranty, edit(`${open}<extensionElements><camunda:executionListener class="org.example.Audit" ` +
    `event="start" /></extensionElements>${close}`), "execution listener");
  // The extra flow ends at the root End, whose fan-in the profile admits, so only the Event's arity is at fault.
  await refused(warranty, replaceOnce(xml,
    '<sequenceFlow id="Flow_ToRepair" sourceRef="FaultDiagnosed" targetRef="RepairRound" />',
    '<sequenceFlow id="Flow_ToRepair" sourceRef="FaultDiagnosed" targetRef="RepairRound" />' +
      '<sequenceFlow id="Flow_Abandoned" sourceRef="FaultDiagnosed" targetRef="DeviceReturned" />'), "second outgoing flow");
  // The Event replaces the rework Merge as the loop's join, Clause 10.5.4's uncontrolled flow.
  const uncontrolled = [
    ['<exclusiveGateway id="RepairRound" name="Repair round" gatewayDirection="Converging" />', ""],
    ['<sequenceFlow id="Flow_ToRepair" sourceRef="FaultDiagnosed" targetRef="RepairRound" />',
      '<sequenceFlow id="Flow_ToRepair" sourceRef="FaultDiagnosed" targetRef="RepairDevice" />'],
    ['<sequenceFlow id="Flow_Repair" sourceRef="RepairRound" targetRef="RepairDevice" />', ""],
    ['<sequenceFlow id="Flow_Rework" sourceRef="ReworkRequested" targetRef="RepairRound" />',
      '<sequenceFlow id="Flow_Rework" sourceRef="ReworkRequested" targetRef="FaultDiagnosed" />'],
  ] as const;
  await refused(warranty, uncontrolled.reduce((edited, [from, to]) => replaceOnce(edited, from, to), xml),
    "second incoming flow");
});

test("a None Throw that alone separates a Call from its body's Start is refused", async () => {
  const xml = await source(loan);
  await admitted(loan, xml);
  await refused(loan, replaceOnce(xml, '<userTask id="PrepareCreditFile" name="Prepare credit file" />',
    '<intermediateThrowEvent id="PrepareCreditFile" name="Credit file prepared" />'), "Start, None Throw, Call");
});

const onboardingUrl = new URL("../../../scenarios/nested-embedded-scope-control/employee-onboarding.bpmn", import.meta.url);

async function compileOnboarding(xml: string) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "employee-onboarding",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion, sourceOverlay: null,
    limits: semanticProcessTestLimits });
}

/** The onboarding graph with one None Throw spliced onto the flow that enters `UserTask_WelcomeMeeting`. */
function spliced(graph: CheckedProcess): CheckedProcess {
  const entering = graph.sequenceFlows.find(({ targetId }) => targetId === "UserTask_WelcomeMeeting");
  const meeting = graph.nodeScopes.find(({ nodeId }) => nodeId === "UserTask_WelcomeMeeting");
  assert.ok(entering !== undefined && meeting !== undefined);
  const node: CheckedNode = { kind: CheckedNodeKind.NoneIntermediateThrowEvent, id: "MeetingScheduled" };
  return {
    ...graph,
    nodes: [...graph.nodes, node],
    nodeScopes: [...graph.nodeScopes, { nodeId: node.id, scopeId: meeting.scopeId }],
    sequenceFlows: [...graph.sequenceFlows.map(flow => flow.id === entering.id ? { ...flow, targetId: node.id } : flow),
      { ...entering, id: "Flow_MeetingScheduled", sourceId: node.id, targetId: "UserTask_WelcomeMeeting" }],
    sequenceFlowScopes: [...graph.sequenceFlowScopes, { sequenceFlowId: "Flow_MeetingScheduled", scopeId: meeting.scopeId }],
  };
}

test("the embedded completion profile refuses a None Throw its unedited onboarding model does without", async () => {
  const xml = await readFile(onboardingUrl, "utf8");
  const unedited = await compileOnboarding(xml);
  assert.ok(unedited.status === BpmnCompilationStatus.Accepted, JSON.stringify(unedited.diagnostics));
  const meeting = '<bpmn:userTask id="UserTask_WelcomeMeeting" name="Welcome meeting">';
  const entering = 'sourceRef="Gateway_PrepareJoin" targetRef="UserTask_WelcomeMeeting"/>';
  const edited = replaceOnce(replaceOnce(replaceOnce(xml,
    '<bpmn:incoming>Flow_PrepareJoinToWelcomeMeeting</bpmn:incoming>', "<bpmn:incoming>Flow_MeetingScheduled</bpmn:incoming>"),
    meeting, '<bpmn:intermediateThrowEvent id="MeetingScheduled"><bpmn:incoming>Flow_PrepareJoinToWelcomeMeeting' +
      "</bpmn:incoming><bpmn:outgoing>Flow_MeetingScheduled</bpmn:outgoing></bpmn:intermediateThrowEvent>" + meeting),
    entering, 'sourceRef="Gateway_PrepareJoin" targetRef="MeetingScheduled"/>' +
      '<bpmn:sequenceFlow id="Flow_MeetingScheduled" sourceRef="MeetingScheduled" targetRef="UserTask_WelcomeMeeting"/>');
  assert.equal((await compileOnboarding(edited)).status, BpmnCompilationStatus.Rejected);
  // The checked analysis alone, past the source reader, so a checked-level gate without the profile test is caught.
  const graph = unedited.checkedProcess;
  assert.notEqual(nestedScopeControlCheckedAnalysis({ ...graph, flows: graph.sequenceFlows }), null);
  const withThrow = spliced(graph);
  assert.equal(nestedScopeControlCheckedAnalysis({ ...withThrow, flows: withThrow.sequenceFlows }), null);
  // The same splice under the scope-data profile is admitted, so the refusal above is the profile gate, not the splice.
  const scopeData = { ...withThrow, identity: { ...withThrow.identity, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData } };
  assert.notEqual(nestedScopeControlCheckedAnalysis({ ...scopeData, flows: scopeData.sequenceFlows }), null);
});

test("the checked-process schema admits the None Throw node and refuses it with a notation", async () => {
  const checked = JSON.parse(await readFile(new URL("../../../contracts/schemas/checked-process.schema.json", import.meta.url),
    "utf8")) as { $defs: Record<string, unknown> };
  const node = new Ajv2020({ strict: true }).compile({ $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: checked.$defs, $ref: "#/$defs/node" });
  const { checkedProcess } = await admitted(warranty, await source(warranty));
  for (const event of checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.NoneIntermediateThrowEvent)) {
    assert.equal(node(event), true, event.id);
  }
  assert.equal(node({ kind: "noneIntermediateThrowEvent", id: "Event", notation: "manualTask" }), false);
});
