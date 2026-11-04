/**
 * LNK-KIND-01, LNK-PAIR-01, LNK-CONT-01, LNK-ADMIT-01 and LNK-PROFILE-01 over the two Link witnesses through the
 * exact-bytes source path and at the checked level. The oracle is the retained explicit-flow twin of each model in
 * `scenarios/none-intermediate-throw/`: a Link model's Program and contracted checked graph must equal the twin's apart
 * from the source identity, so a pass-through lowering, a dropped condition or a pairing by Event name cannot pass, and
 * each refusal is a one-fact edit of an admitted model.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess, contractLinks } from "@bpmn-lean/bpmn-source";
import { CheckedNodeKind, SemanticProfileId } from "@bpmn-lean/semantic-core";
import type { CheckedProcess } from "@bpmn-lean/semantic-core";
import { effectResultReachesDefaultlessChoice } from "../src/defaultless-choice-effect-closure.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

type Witness = Readonly<{ model: string; twin: string }>;
const warranty: Witness = { model: "warranty-repair-links", twin: "warranty-repair" };
const onboarding: Witness = { model: "onboarding-milestones-links", twin: "onboarding-milestones" };

const scenarios = new URL("../../../scenarios/", import.meta.url);
const read = (path: string): Promise<string> => readFile(new URL(path, scenarios), "utf8");
const source = (witness: Witness): Promise<string> => read(`link-events/${witness.model}.bpmn`);
const twinSource = (witness: Witness): Promise<string> => read(`none-intermediate-throw/${witness.twin}.bpmn`);

/** Both models bind the twin's overlay, whose one handler they share. */
async function compile(witness: Witness, xml: string) {
  const bytes = await readFile(new URL(`none-intermediate-throw/${witness.twin}-overlay.json`, scenarios));
  const sourceOverlay = { id: `${witness.twin}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: witness.twin,
    expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData, sourceOverlay,
    limits: semanticProcessTestLimits });
}

async function admitted(witness: Witness, xml: string, label = witness.model) {
  const result = await compile(witness, xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  return result;
}

async function refused(witness: Witness, xml: string, label: string): Promise<void> {
  assert.equal((await compile(witness, xml)).status, BpmnCompilationStatus.Rejected, label);
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

/** The source identity is the only part of a Program or checked graph allowed to tell a Link model from its twin. */
const withoutIdentity = <T extends { identity: unknown }>(value: T) => ({ ...value, identity: null });

async function assertTwin(witness: Witness, xml: string, label: string): Promise<void> {
  const linked = await admitted(witness, xml, label);
  const twin = await admitted(witness, await twinSource(witness), `${label} twin`);
  assert.deepEqual(withoutIdentity(linked.semanticProcess), withoutIdentity(twin.semanticProcess), label);
  const contracted = contractLinks(linked.checkedProcess);
  assert.ok(contracted !== undefined, label);
  assert.deepEqual(withoutIdentity(contracted), withoutIdentity(twin.checkedProcess), label);
}

const links = {
  "warranty-repair-links": [["ThrowBackToRepair", "BackToRepair"], ["ThrowReleaseDevice", "ReleaseDevice"],
    ["ThrowToTesting", "ToTesting"]],
  "onboarding-milestones-links": [["ThrowAccountDone", "AccountDone"], ["ThrowAllSet", "AllSet"],
    ["ThrowWelcomeTrack", "WelcomeTrack"]],
} as const;

test("both witnesses keep their Link arms and are admitted exactly as their explicit-flow twins", async () => {
  for (const witness of [warranty, onboarding]) {
    const { checkedProcess, semanticProcess } = await admitted(witness, await source(witness));
    const throws = checkedProcess.nodes.flatMap(node =>
      node.kind === CheckedNodeKind.LinkThrowEvent ? [[node.id, node.linkName]] : []);
    assert.deepEqual(throws, links[witness.model as keyof typeof links].map(pair => [...pair]));
    assert.equal(checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.LinkCatchEvent).length, 3);
    // LNK-CONT-01: no operation, occurrence or wait stands for a Link Event.
    assert.equal(semanticProcess.operations.some(({ origin }) => /^(Throw|Catch)/.test(origin.elementId)), false);
    await assertTwin(witness, await source(witness), witness.model);
  }
});

test("pairing follows the definition name, not the Event name", async () => {
  // Pairing by Event name would join the rework flow to Device released and change the Program.
  const crossed = replaceOnce(replaceOnce(await source(warranty),
    '<intermediateThrowEvent id="ThrowBackToRepair" name="Back to repair">',
    '<intermediateThrowEvent id="ThrowBackToRepair" name="Release device">'),
    '<intermediateThrowEvent id="ThrowReleaseDevice" name="Release device">',
    '<intermediateThrowEvent id="ThrowReleaseDevice" name="Back to repair">');
  await assertTwin(warranty, crossed, "crossed Event names");
});

const throwOf = (id: string, name: string, linkName: string, body = "") =>
  `<intermediateThrowEvent id="${id}" name="${name}">${body}<linkEventDefinition name="${linkName}" /></intermediateThrowEvent>`;
const catchOf = (id: string, name: string, linkName: string, body = "") =>
  `<intermediateCatchEvent id="${id}" name="${name}">${body}<linkEventDefinition name="${linkName}" /></intermediateCatchEvent>`;
const releaseThrow = `<intermediateThrowEvent id="ThrowReleaseDevice" name="Release device">
      <linkEventDefinition name="ReleaseDevice" />
    </intermediateThrowEvent>`;
const releaseCatch = `<intermediateCatchEvent id="CatchReleaseDevice" name="Release device">
      <linkEventDefinition name="ReleaseDevice" />
    </intermediateCatchEvent>`;
const testingCatch = `<intermediateCatchEvent id="CatchToTesting" name="To testing">
        <linkEventDefinition name="ToTesting" />
      </intermediateCatchEvent>`;
const end = "    <endEvent id=\"DeviceReturned\" name=\"Device returned\" />";

test("each excluded pairing form is refused at the source level", async () => {
  const xml = await source(warranty);
  const edits: ReadonlyArray<readonly [string, string]> = [
    // Multiple sources: a second throw Back to repair on the passed path, the clause PC-BASIC-02 keeps open.
    ["second throw of one name", replaceOnce(replaceOnce(xml, end, throwOf("ThrowBackAgain", "Back to repair", "BackToRepair") + end),
      '<sequenceFlow id="Flow_Released" sourceRef="DeviceReleased" targetRef="DeviceReturned" />',
      '<sequenceFlow id="Flow_Released" sourceRef="DeviceReleased" targetRef="ThrowBackAgain" />')],
    ["missing catch", replaceOnce(replaceOnce(xml, testingCatch, ""),
      '<sequenceFlow id="Flow_TestingCaught" sourceRef="CatchToTesting" targetRef="TestDevice" />', "")],
    ["second catch of one name", replaceOnce(xml, testingCatch, testingCatch + catchOf("CatchToTestingAgain", "To testing", "ToTesting"))],
    // CIB keeps one name space per resource (`BpmnParse.java:313`): a complete root pair beside a body pair of one name.
    ["one name in two scopes", replaceOnce(replaceOnce(xml, testingCatch, testingCatch +
      throwOf("ThrowBodyBack", "Back to repair", "BackToRepair") + catchOf("CatchBodyBack", "Back to repair", "BackToRepair") +
      '<userTask id="RecheckDevice" name="Recheck device" />'),
      '<sequenceFlow id="Flow_DeviceTested" sourceRef="TestDevice" targetRef="RepairClosed" />',
      '<sequenceFlow id="Flow_DeviceTested" sourceRef="TestDevice" targetRef="ThrowBodyBack" />' +
        '<sequenceFlow id="Flow_BodyBackCaught" sourceRef="CatchBodyBack" targetRef="RecheckDevice" />' +
        '<sequenceFlow id="Flow_Rechecked" sourceRef="RecheckDevice" targetRef="RepairClosed" />')],
    // Regression check only: ownership already refuses the contracted cross-scope flow.
    ["cross-scope pair", replaceOnce(replaceOnce(replaceOnce(xml, testingCatch, ""), end, catchOf("CatchToTesting", "To testing", "ToTesting") + end),
      '<sequenceFlow id="Flow_TestingCaught" sourceRef="CatchToTesting" targetRef="TestDevice" />', "")],
    ["conditioned catch flow", replaceOnce(xml,
      '<sequenceFlow id="Flow_ReleaseCaught" sourceRef="CatchReleaseDevice" targetRef="DeviceReleased" />',
      '<sequenceFlow id="Flow_ReleaseCaught" sourceRef="CatchReleaseDevice" targetRef="DeviceReleased">' +
        '<conditionExpression xsi:type="tFormalExpression">stringEquals(testResult,"passed")</conditionExpression></sequenceFlow>')],
    ["incoming flow on a catch", replaceOnce(xml,
      '<sequenceFlow id="Flow_Failed" sourceRef="DevicePasses" targetRef="ReworkRequested" />',
      '<sequenceFlow id="Flow_Failed" sourceRef="DevicePasses" targetRef="CatchBackToRepair" />')],
    ["outgoing flow on a throw", replaceOnce(xml,
      '<sequenceFlow id="Flow_Released" sourceRef="DeviceReleased" targetRef="DeviceReturned" />',
      '<sequenceFlow id="Flow_Released" sourceRef="DeviceReleased" targetRef="DeviceReturned" />' +
        '<sequenceFlow id="Flow_ThrowLeaves" sourceRef="ThrowReleaseDevice" targetRef="DeviceReturned" />')],
    ["catch into a throw", replaceOnce(replaceOnce(xml,
      '<sequenceFlow id="Flow_Rework" sourceRef="ReworkRequested" targetRef="ThrowBackToRepair" />',
      '<sequenceFlow id="Flow_Rework" sourceRef="ReworkRequested" targetRef="ThrowReworkHop" />' +
        '<sequenceFlow id="Flow_ReworkHopCaught" sourceRef="CatchReworkHop" targetRef="ThrowBackToRepair" />'),
      end, throwOf("ThrowReworkHop", "Rework hop", "ReworkHop") + catchOf("CatchReworkHop", "Rework hop", "ReworkHop") + end)],
    ["asynchronous throw", replaceOnce(xml, '<intermediateThrowEvent id="ThrowReleaseDevice" name="Release device">',
      '<intermediateThrowEvent id="ThrowReleaseDevice" name="Release device" camunda:asyncBefore="true">')],
    ["listener on a catch", replaceOnce(xml, releaseCatch, catchOf("CatchReleaseDevice", "Release device", "ReleaseDevice",
      '<extensionElements><camunda:executionListener class="org.example.Audit" event="start" /></extensionElements>'))],
    ["target reference on a throw", replaceOnce(xml, releaseThrow,
      '<intermediateThrowEvent id="ThrowReleaseDevice" name="Release device"><linkEventDefinition id="LinkOut" ' +
        'name="ReleaseDevice"><target>LinkIn</target></linkEventDefinition></intermediateThrowEvent>')],
    ["source reference on a catch", replaceOnce(xml, releaseCatch,
      '<intermediateCatchEvent id="CatchReleaseDevice" name="Release device"><linkEventDefinition id="LinkIn" ' +
        'name="ReleaseDevice"><source>LinkOut</source></linkEventDefinition></intermediateCatchEvent>')],
    ["empty Link name", replaceOnce(replaceOnce(xml, releaseThrow, throwOf("ThrowReleaseDevice", "Release device", "")),
      releaseCatch, catchOf("CatchReleaseDevice", "Release device", ""))],
  ];
  for (const [label, edited] of edits) await refused(warranty, edited, label);
});

test("a Link pair in a called Process is refused beside its admitted original", async () => {
  const loan: Witness = { model: "loan-application", twin: "loan-application" };
  const xml = await read("call-variable-mapping/loan-application.bpmn");
  const bytes = await readFile(new URL("call-variable-mapping/loan-application-overlay.json", scenarios));
  const compileLoan = (text: string) => compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(text),
    sourceId: loan.model, expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "loan-application-handlers", sha256: createHash("sha256").update(bytes).digest("hex"), bytes },
    limits: semanticProcessTestLimits });
  assert.equal((await compileLoan(xml)).status, BpmnCompilationStatus.Accepted);
  const edited = replaceOnce(xml,
    '<sequenceFlow id="Flow_Collected" sourceRef="CollectDocument" targetRef="RecordVerdict" />',
    '<sequenceFlow id="Flow_Collected" sourceRef="CollectDocument" targetRef="ThrowToVerdict" />' +
      '<sequenceFlow id="Flow_VerdictCaught" sourceRef="CatchToVerdict" targetRef="RecordVerdict" />' +
      throwOf("ThrowToVerdict", "To verdict", "ToVerdict") + catchOf("CatchToVerdict", "To verdict", "ToVerdict"));
  assert.equal((await compileLoan(edited)).status, BpmnCompilationStatus.Rejected);
});

test("the profile's analyses run on the contraction, not on the raw graph", async () => {
  // Order spare part's result reaches a default-less Choice only through the Link pair To testing (XND-ADMIT-01).
  const withoutTest = (xml: string, catchTarget: string) => replaceOnce(replaceOnce(xml,
    '<userTask id="TestDevice" name="Test device" />', ""),
    `sourceRef="${catchTarget}" targetRef="TestDevice" />`, `sourceRef="${catchTarget}" targetRef="RepairClosed" />`);
  const defaultless = (xml: string) => replaceOnce(replaceOnce(xml,
    'gatewayDirection="Diverging" default="Flow_Failed" />', 'gatewayDirection="Diverging" />'),
    '<sequenceFlow id="Flow_Failed" sourceRef="DevicePasses" targetRef="ReworkRequested" />',
    '<sequenceFlow id="Flow_Failed" sourceRef="DevicePasses" targetRef="ReworkRequested">' +
      '<conditionExpression xsi:type="tFormalExpression">stringEquals(testResult,"failed")</conditionExpression></sequenceFlow>');
  const linked = withoutTest(replaceOnce(await source(warranty),
    '<sequenceFlow id="Flow_DeviceTested" sourceRef="TestDevice" targetRef="RepairClosed" />', ""), "CatchToTesting");
  const twin = withoutTest(replaceOnce(await twinSource(warranty),
    '<sequenceFlow id="Flow_DeviceTested" sourceRef="TestDevice" targetRef="RepairClosed" />', ""), "OrderSparePart");
  // With its default the Choice is admitted at both, so the refusals below are XND-ADMIT-01's alone.
  const kept = await admitted(warranty, linked, "Link model with a default");
  await admitted(warranty, twin, "twin with a default");
  await refused(warranty, defaultless(linked), "Link model without a default");
  await refused(warranty, defaultless(twin), "twin without a default");
  // The analysis itself: the raw graph hides the closure behind the throw, the contraction shows it.
  const raw: CheckedProcess = { ...kept.checkedProcess, nodes: kept.checkedProcess.nodes.map(node =>
    node.kind === CheckedNodeKind.ExclusiveGateway ? withoutDefault(node) : node) };
  assert.equal(effectResultReachesDefaultlessChoice(raw), false);
  const contracted = contractLinks(raw);
  assert.ok(contracted !== undefined);
  assert.equal(effectResultReachesDefaultlessChoice(contracted), true);
});

function withoutDefault<Node extends { readonly defaultFlowId?: string }>(node: Node): Omit<Node, "defaultFlowId"> {
  const { defaultFlowId: _default, ...rest } = node;
  return rest;
}

test("the contraction refuses each excluded form at the checked level and is the identity without Links", async () => {
  const { checkedProcess } = await admitted(warranty, await source(warranty));
  const twin = (await admitted(warranty, await twinSource(warranty))).checkedProcess;
  assert.equal(contractLinks(twin), twin);
  const rename = (id: string, linkName: string): CheckedProcess => ({ ...checkedProcess, nodes: checkedProcess.nodes.map(node =>
    node.id === id && (node.kind === CheckedNodeKind.LinkThrowEvent || node.kind === CheckedNodeKind.LinkCatchEvent)
      ? { ...node, linkName } : node) });
  assert.equal(contractLinks(rename("ThrowBackToRepair", "ReleaseDevice")), undefined, "two throws of one name");
  assert.equal(contractLinks(rename("CatchBackToRepair", "ReleaseDevice")), undefined, "two catches of one name");
  assert.equal(contractLinks(rename("ThrowBackToRepair", "")), undefined, "empty Link name");
  assert.equal(contractLinks({ ...checkedProcess, sequenceFlows: checkedProcess.sequenceFlows.map(flow =>
    flow.id === "Flow_ReleaseCaught" ? { ...flow, condition: { kind: "literal", value: true } as never } : flow) }),
  undefined, "conditioned catch flow");
  const body = checkedProcess.nodeScopes.find(({ nodeId }) => nodeId === "CatchToTesting")!.scopeId;
  const root = checkedProcess.nodeScopes.find(({ nodeId }) => nodeId === "CatchBackToRepair")!.scopeId;
  assert.notEqual(body, root);
  const moved = (scopeId: string) => ({ ...checkedProcess,
    nodeScopes: checkedProcess.nodeScopes.map(entry => entry.nodeId === "CatchToTesting" ? { ...entry, scopeId } : entry),
    sequenceFlowScopes: checkedProcess.sequenceFlowScopes.map(entry =>
      entry.sequenceFlowId === "Flow_TestingCaught" ? { ...entry, scopeId } : entry) });
  assert.equal(contractLinks(moved(root)), undefined, "cross-scope pair");
  // LNK-PROFILE-01: the same pairs under another profile are refused, while the Link-free twin passes unchanged.
  const relabel = <T extends CheckedProcess>(graph: T): T =>
    ({ ...graph, identity: { ...graph.identity, semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion } });
  assert.equal(contractLinks(relabel(checkedProcess)), undefined, "another profile");
  assert.notEqual(contractLinks(relabel(twin)), undefined, "the twin under another profile");
});

test("the embedded completion profile refuses a Link pair its unedited onboarding model does without", async () => {
  const xml = await read("nested-embedded-scope-control/employee-onboarding.bpmn");
  const compileOnboarding = (text: string) => compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(text),
    sourceId: "employee-onboarding", expectedSha256: undefined, semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion,
    sourceOverlay: null, limits: semanticProcessTestLimits });
  assert.equal((await compileOnboarding(xml)).status, BpmnCompilationStatus.Accepted);
  const entering = 'sourceRef="Gateway_PrepareJoin" targetRef="UserTask_WelcomeMeeting"/>';
  const edited = replaceOnce(replaceOnce(xml, entering, 'sourceRef="Gateway_PrepareJoin" targetRef="ThrowMeeting"/>' +
      '<bpmn:sequenceFlow id="Flow_MeetingCaught" sourceRef="CatchMeeting" targetRef="UserTask_WelcomeMeeting"/>' +
      '<bpmn:intermediateThrowEvent id="ThrowMeeting"><bpmn:linkEventDefinition name="Meeting"/></bpmn:intermediateThrowEvent>' +
      '<bpmn:intermediateCatchEvent id="CatchMeeting"><bpmn:linkEventDefinition name="Meeting"/></bpmn:intermediateCatchEvent>'),
    "<bpmn:incoming>Flow_PrepareJoinToWelcomeMeeting</bpmn:incoming>", "<bpmn:incoming>Flow_MeetingCaught</bpmn:incoming>");
  assert.equal((await compileOnboarding(edited)).status, BpmnCompilationStatus.Rejected);
});

test("the checked-process schema admits both Link arms and refuses one without its name", async () => {
  const checked = JSON.parse(await readFile(new URL("../../../contracts/schemas/checked-process.schema.json", import.meta.url),
    "utf8")) as { $defs: Record<string, unknown> };
  const node = new Ajv2020({ strict: true }).compile({ $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: checked.$defs, $ref: "#/$defs/node" });
  const { checkedProcess } = await admitted(onboarding, await source(onboarding));
  const arms = checkedProcess.nodes.filter(({ kind }) =>
    kind === CheckedNodeKind.LinkThrowEvent || kind === CheckedNodeKind.LinkCatchEvent);
  assert.equal(arms.length, 6);
  for (const arm of arms) assert.equal(node(arm), true, arm.id);
  assert.equal(node({ kind: "linkThrowEvent", id: "Event" }), false);
  assert.equal(node({ kind: "linkCatchEvent", id: "Event", linkName: "" }), false);
});
