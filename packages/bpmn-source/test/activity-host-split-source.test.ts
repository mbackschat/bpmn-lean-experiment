/**
 * ACSP-ADMIT-01, ACSP-ONE-01, ACSP-SINGLE-01 and ACSP-PROFILE-01 over the retained insurance claim intake model through
 * the exact-bytes source path, at the checked and Program levels. The oracle is the approved proposal's "Separating
 * witnesses": *Register claim* and *Review claim* lower to Activity hosts with one input and every outgoing flow as an
 * output, both levels route the model to the concurrent account, and each refused edit differs from an admitted control
 * in its one named fact.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  ActivityWorkKind, CheckedNodeKind, SemanticOperationKind, SemanticProfileId, StimulusKind, applyStimulus,
  concurrentStructuredScopeDataProgram, initialState, isWellFormedSemanticProcessProgram, scopeReentryProgram,
  structuredScopeDataCheckedAnalysis, structuredScopeDataCheckedStartNames, structuredScopeDataProgramAnalysis,
  structuredScopeDataProgramStartNames,
} from "@bpmn-lean/semantic-core";
import type { CheckedProcess, SemanticOperation, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { assertProgramSchema, programSchemaAccepts, semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/activity-host-split/", import.meta.url);
const model = "insurance-claim-intake";

const source = async (): Promise<string> => readFile(new URL(`${model}.bpmn`, directory), "utf8");

/** The model's overlay, relabelled to `semanticProfile` and without the bindings `dropped` names. */
async function overlay(semanticProfile: string, dropped: readonly string[] = []) {
  const retained = JSON.parse(await readFile(new URL(`${model}-overlay.json`, directory), "utf8"));
  const effectBindings = retained.effectBindings.filter(({ descriptor }: { descriptor: { operation: string } }) =>
    !dropped.includes(descriptor.operation));
  const bytes = new TextEncoder().encode(JSON.stringify({ ...retained, semanticProfile, effectBindings }));
  return { id: `${model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(xml: string, semanticProfile: string = SemanticProfileId.NestedEmbeddedScopeData,
  dropped: readonly string[] = []) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile, sourceOverlay: await overlay(semanticProfile, dropped), limits: semanticProcessTestLimits });
}

async function admitted(xml: string, label: string) {
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true, label);
  assertProgramSchema(result.semanticProcess, label);
  // Each level admits the model independently, so a widening at one level only cannot pass (wrong algorithm 1).
  assert.notEqual(structuredScopeDataProgramAnalysis(result.semanticProcess), null, `${label}: Program analysis`);
  assert.notEqual(structuredScopeDataCheckedAnalysis(result.checkedProcess), null, `${label}: checked analysis`);
  assert.deepEqual(structuredScopeDataProgramStartNames(result.semanticProcess),
    structuredScopeDataCheckedStartNames(result.checkedProcess), label);
  return result.semanticProcess;
}

async function refused(xml: string, label: string, semanticProfile?: string, dropped?: readonly string[]): Promise<void> {
  assert.equal((await compile(xml, semanticProfile, dropped)).status, BpmnCompilationStatus.Rejected, label);
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

function only(program: SemanticProcessProgram, elementId: string, kind: SemanticOperationKind) {
  const operations = program.operations.filter((operation) => operation.origin.elementId === elementId &&
    operation.kind === kind);
  assert.equal(operations.length, 1, `${elementId} ${kind}`);
  return operations[0]!;
}

const placesOf = (program: SemanticProcessProgram, flows: readonly string[]): readonly string[] =>
  program.controlPlaces.filter(({ origin }) => flows.includes(origin.elementId)).map(({ id }) => id).sort();

const flow = (id: string, from: string, to: string): string =>
  `<sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}" />`;

test("ACSP-ADMIT-01: a splitting Service Task and User Task lower to hosts over every outgoing flow", async () => {
  const program = await admitted(await source(), model);
  const register = only(program, "RegisterClaim", SemanticOperationKind.Activity);
  assert.ok(register.kind === SemanticOperationKind.Activity && register.work.kind === ActivityWorkKind.Effect);
  assert.deepEqual(register.inputs, placesOf(program, ["Flow_ToRegister"]));
  assert.deepEqual(register.outputs.map(({ place }) => place), placesOf(program, ["Flow_ToArchive", "Flow_ToBroker"]));
  const review = only(program, "ReviewClaim", SemanticOperationKind.Activity);
  assert.ok(review.kind === SemanticOperationKind.Activity && review.work.kind === ActivityWorkKind.UserTask);
  assert.deepEqual(review.inputs, placesOf(program, ["Flow_ToReview"]));
  assert.deepEqual(review.outputs.map(({ place }) => place), placesOf(program, ["Flow_ToAssessment", "Flow_ToCustomer"]));
  // Wrong algorithm 4: the split is the host's own step, never a separate `duplicate`.
  assert.equal(program.operations.some(({ kind }) => kind === SemanticOperationKind.Duplicate), false);
  // Wrong algorithm 9: the Program alone routes the splitting hosts to the concurrent account.
  assert.equal(concurrentStructuredScopeDataProgram(program), true);
  assert.equal(scopeReentryProgram(program), false);
});

test("ACSP-ONE-01: one-flow Tasks keep their legacy operations", async () => {
  const program = await admitted(await source(), model);
  only(program, "ArchiveDocuments", SemanticOperationKind.AwaitUserTask);
  only(program, "NotifyBroker", SemanticOperationKind.AwaitEffect);
  only(program, "OrderAssessment", SemanticOperationKind.AwaitEffect);
  only(program, "DecideClaim", SemanticOperationKind.AwaitUserTask);
});

test("ACSP-ADMIT-01: a splitting Send Task lowers to a host like a Service Task", async () => {
  const xml = (await source()).replace(/<serviceTask id="RegisterClaim"([\s\S]*?)<\/serviceTask>/u,
    (_, body: string) => `<sendTask id="RegisterClaim"${body.replace(
      /\s*<camunda:outputParameter[^>]*>[^<]*<\/camunda:outputParameter>/u, "")}</sendTask>`);
  const program = await admitted(xml, "Send Task twin");
  const register = only(program, "RegisterClaim", SemanticOperationKind.Activity);
  assert.ok(register.kind === SemanticOperationKind.Activity && register.work.kind === ActivityWorkKind.Effect);
  assert.equal(register.outputs.length, 2);
});

test("ACSP-SINGLE-01: a split on a branch of another split, or below one, is refused", async () => {
  const xml = await source();
  // *Order assessment* feeds two checks that rejoin before *Review done*: through an explicit fork (admitted) or by
  // splitting itself on the branch of *Review claim*'s split (wrong algorithm 5), which differs in that fact alone.
  const nested = (explicit: boolean) => replaceOnce(replaceOnce(xml, flow("Flow_Assessed", "OrderAssessment", "ReviewDone"),
    (explicit ? `${flow("Flow_ToAssessFork", "OrderAssessment", "AssessFork")}${flow("Flow_ToCheckA", "AssessFork", "CheckA")}` +
      flow("Flow_ToCheckB", "AssessFork", "CheckB")
      : `${flow("Flow_ToCheckA", "OrderAssessment", "CheckA")}${flow("Flow_ToCheckB", "OrderAssessment", "CheckB")}`) +
    `${flow("Flow_CheckedA", "CheckA", "ChecksDone")}${flow("Flow_CheckedB", "CheckB", "ChecksDone")}` +
    flow("Flow_Assessed", "ChecksDone", "ReviewDone")),
  '<endEvent id="ClaimDecided" name="Claim decided" />', '<endEvent id="ClaimDecided" name="Claim decided" />' +
    '<userTask id="CheckA" /><userTask id="CheckB" /><parallelGateway id="ChecksDone" gatewayDirection="Converging" />' +
    (explicit ? '<parallelGateway id="AssessFork" gatewayDirection="Diverging" />' : ""));
  await admitted(nested(true), "explicit fork on a split's branch");
  await refused(nested(false), "split on a split's branch");
  // The ancestor-scope part: *Intake* on a branch of a root Parallel fork, admitted with a serial body and refused while
  // *Register claim* splits in it.
  const serialIntake = replaceOnce(replaceOnce(replaceOnce(xml, flow("Flow_ToBroker", "RegisterClaim", "NotifyBroker"),
    flow("Flow_ToBroker", "ArchiveDocuments", "NotifyBroker")), flow("Flow_Archived", "ArchiveDocuments", "DocumentsArchived"), ""),
  '<endEvent id="DocumentsArchived" name="Documents archived" />', "");
  // The root fork rejoins before *Review claim*, so only *Intake*'s body differs.
  const belowRootFork = (text: string) => replaceOnce(replaceOnce(replaceOnce(text,
    flow("Flow_ToIntake", "ClaimReported", "Intake"),
    `${flow("Flow_ToFork", "ClaimReported", "RootFork")}${flow("Flow_ToIntake", "RootFork", "Intake")}` +
    `${flow("Flow_ToTriage", "RootFork", "TriageClaim")}${flow("Flow_Triaged", "TriageClaim", "RootJoin")}`),
  flow("Flow_ToReview", "Intake", "ReviewClaim"),
  `${flow("Flow_IntakeDone", "Intake", "RootJoin")}${flow("Flow_ToReview", "RootJoin", "ReviewClaim")}`),
  '<userTask id="ReviewClaim" name="Review claim" />',
  '<userTask id="ReviewClaim" name="Review claim" /><parallelGateway id="RootFork" gatewayDirection="Diverging" />' +
    '<userTask id="TriageClaim" /><parallelGateway id="RootJoin" gatewayDirection="Converging" />');
  await admitted(belowRootFork(serialIntake), "serial Intake below a root fork");
  await refused(belowRootFork(xml), "split below a root fork's branch");
});

test("ACSP-ADMIT-01: conditioned, default, merging, Error-routed and boundary forms stay refused", async () => {
  const xml = await source();
  const conditioned = replaceOnce(replaceOnce(xml, "<definitions ",
    '<definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '),
  flow("Flow_ToCustomer", "ReviewClaim", "InformCustomer"),
  '<sequenceFlow id="Flow_ToCustomer" sourceRef="ReviewClaim" targetRef="InformCustomer">' +
    '<conditionExpression xsi:type="tFormalExpression">stringEquals(claimSummary,"x")</conditionExpression></sequenceFlow>');
  await refused(conditioned, "conditioned outgoing flow");
  await refused(replaceOnce(xml, '<userTask id="ReviewClaim" name="Review claim" />',
    '<userTask id="ReviewClaim" name="Review claim" default="Flow_ToCustomer" />'), "default outgoing flow");
  await refused(replaceOnce(xml, flow("Flow_Decided", "DecideClaim", "ClaimDecided"),
    `${flow("Flow_Decided", "DecideClaim", "ClaimDecided")}${flow("Flow_Again", "ArchiveDocuments", "ReviewClaim")}`),
  "second incoming flow while splitting");
  await refused(replaceOnce(xml, '<userTask id="DecideClaim" name="Decide claim" />',
    '<userTask id="DecideClaim" name="Decide claim" /><boundaryEvent id="BrokerReplied" attachedToRef="ReviewClaim">' +
      '<messageEventDefinition /></boundaryEvent><endEvent id="Replied" />' +
      flow("Flow_Replied", "BrokerReplied", "Replied")), "Message boundary on a splitting Task");
  await refused(replaceOnce(xml, '<endEvent id="BrokerNotified" name="Broker notified" />',
    '<endEvent id="BrokerNotified" name="Broker notified" /><boundaryEvent id="RegistrationFailed" ' +
      'attachedToRef="RegisterClaim"><errorEventDefinition /></boundaryEvent><endEvent id="Failed" />' +
      flow("Flow_Failed", "RegistrationFailed", "Failed")), "BPMN Error route on a splitting Service Task");
});

test("ACSP-ADMIT-01: the overlay must bind the splitting Service Task's handler", async () => {
  await refused(await source(), "overlay without registerClaim", undefined, ["registerClaim"]);
});

test("ACSP-PROFILE-01: the embedded completion profile refuses the model", async () => {
  await refused(await source(), "embedded completion profile", SemanticProfileId.EmbeddedSubProcessCompletion);
});

const loweringModule = async () => await import(new URL("../dist/semantic-process-lowering.js", import.meta.url).href) as
  { lowerCheckedProcess: (source: CheckedProcess) => SemanticProcessProgram };

const byKey = <T>(key: (value: T) => string) => (left: T, right: T): number =>
  key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0;

/** `source` with extra flows and None Ends, kept in the canonical id order the compiler produces. */
function withEdits(source: CheckedProcess, ends: readonly Readonly<{ id: string; scopeOf: string }>[],
  flows: readonly Readonly<{ id: string; from: string; to: string }>[]): CheckedProcess {
  const scopeOf = (nodeId: string) => source.nodeScopes.find((entry) => entry.nodeId === nodeId)!.scopeId;
  return { ...source,
    nodes: [...source.nodes, ...ends.map(({ id }) => ({ kind: CheckedNodeKind.NoneEndEvent, id }) as const)]
      .sort(byKey(({ id }) => id)),
    nodeScopes: [...source.nodeScopes, ...ends.map(({ id, scopeOf: owner }) => ({ nodeId: id, scopeId: scopeOf(owner) }))]
      .sort(byKey(({ nodeId }) => nodeId)),
    sequenceFlows: [...source.sequenceFlows, ...flows.map(({ id, from, to }) =>
      ({ id, sourceId: from, targetId: to, condition: null }))].sort(byKey(({ id }) => id)),
    sequenceFlowScopes: [...source.sequenceFlowScopes, ...flows.map(({ id, from }) =>
      ({ sequenceFlowId: id, scopeId: scopeOf(from) }))].sort(byKey(({ sequenceFlowId }) => sequenceFlowId)) };
}

/** `source` with one more flow from `from` to a fresh None End in `from`'s scope, so a one-flow Task splits. */
const withTerminalFlow = (source: CheckedProcess, from: string): CheckedProcess =>
  withEdits(source, [{ id: "Aside", scopeOf: from }], [{ id: "Flow_Aside", from, to: "Aside" }]);

/** A retained model of another family under this profile and its own overlay. */
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

// Wrong algorithm 9: a root Task split beside a root Call (RPF-ADMIT-01) and beside a root Choice (re-entry refusal) is
// refused from the source, and its lowered Program alone, which holds the splitting host, is refused too, while each
// unedited control is admitted at the Program level.
test("ACSP-ADMIT-01: a root Task split beside a root Call or Choice is refused at both levels", async () => {
  const { lowerCheckedProcess } = await loweringModule();
  const cases = [
    ["call-variable-mapping", "loan-application", "AcknowledgeApplication", "ApplicationDecided"],
    ["scope-reentry", "claim-rework", "NotifyClaimant", "ClaimClosed"],
  ] as const;
  for (const [family, name, task, end] of cases) {
    const retainedModel = await retained(family, name);
    const control = await retainedModel.compileXml(retainedModel.xml);
    assert.ok(control.status === BpmnCompilationStatus.Accepted, `${name} control`);
    assert.notEqual(structuredScopeDataProgramAnalysis(control.semanticProcess), null, `${name} control Program`);
    const closing = retainedModel.xml.match(new RegExp(`<endEvent id="${end}"[^>]*/>`, "u"))![0];
    const edited = replaceOnce(retainedModel.xml, closing,
      `<endEvent id="Aside_${task}" />${flow(`Flow_Aside_${task}`, task, `Aside_${task}`)}${closing}`);
    assert.equal((await retainedModel.compileXml(edited)).status, BpmnCompilationStatus.Rejected, `${name}: ${task} split`);
    const program = lowerCheckedProcess(withTerminalFlow(control.checkedProcess, task));
    const host = only(program, task, SemanticOperationKind.Activity);
    assert.ok(host.kind === SemanticOperationKind.Activity && host.outputs.length === 2, `${name}: ${task} lowers to a host`);
    assert.equal(structuredScopeDataProgramAnalysis(program), null, `${name}: ${task} split, Program alone`);
  }
});

// The Program schema carries ACSP-HOST-01's shape bound: a splitting host validates, and the same host cut to one output,
// which would double the legacy encoding, does not.
test("ACSP-HOST-01: the Program schema refuses a host with one input and one output", async () => {
  const program = await admitted(await source(), model);
  const register = only(program, "RegisterClaim", SemanticOperationKind.Activity);
  assert.ok(register.kind === SemanticOperationKind.Activity);
  const plain = { ...register, outputs: register.outputs.slice(0, 1) };
  assert.equal(programSchemaAccepts({ ...program, operations: program.operations.map((operation) =>
    operation === register ? plain : operation) }), false);
});

// The refused edits that add a flow, on the lowered Program alone: a split on a split's branch (wrong algorithm 5) and a
// Task that both merges and splits. The conditioned and default flows, the boundary events and the profile are
// checked-level facts with no Program-level encoding beyond the refused source.
test("ACSP-SINGLE-01, ACSP-HOST-01: the flow-adding refused edits are refused on the lowered Program alone", async () => {
  const { lowerCheckedProcess } = await loweringModule();
  const control = await compile(await source());
  assert.ok(control.status === BpmnCompilationStatus.Accepted);
  const nested = lowerCheckedProcess(withTerminalFlow(control.checkedProcess, "OrderAssessment"));
  assert.equal(only(nested, "OrderAssessment", SemanticOperationKind.Activity).kind, SemanticOperationKind.Activity);
  assert.equal(structuredScopeDataProgramAnalysis(nested), null, "split on a split's branch, Program alone");
  const merging = lowerCheckedProcess(withEdits(control.checkedProcess, [],
    [{ id: "Flow_Again", from: "InformCustomer", to: "ReviewClaim" }]));
  assert.equal(isWellFormedSemanticProcessProgram(merging), false, "a host that both merges and splits");
});

// ACSP-SINGLE-01 on the runtime path: the lowered Program with a Task host on a Parallel branch is refused by Program
// admission, whose well-formedness includes the concurrent analysis under this profile, so the start is rejected before
// the scheduler runs (no ambiguous internal choice is reported), while the admitted twin, whose Task does not split,
// commits. The scheduler's own fail-closed refusal is not reachable through the public entry and stays unwitnessed.
test("ACSP-SINGLE-01: a splitting Task host placed on a Parallel branch is refused before it can run", async () => {
  const { lowerCheckedProcess } = await loweringModule();
  const twin = await compileUnbound(processOf('<startEvent id="Start" /><userTask id="Sibling" /><endEvent id="SiblingEnd" />' +
    `<userTask id="T" /><endEvent id="End" />${fork}${flow("a", "Start", "Fork")}${flow("b", "Fork", "Sibling")}` +
    `${flow("c", "Sibling", "SiblingEnd")}${flow("d", "Fork", "T")}${flow("e", "T", "End")}`));
  assert.ok(twin.status === BpmnCompilationStatus.Accepted, JSON.stringify(twin.diagnostics));
  const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: "P", instanceId: "i",
    initialVariables: [] };
  assert.equal(applyStimulus(twin.semanticProcess, initialState, start).outcome, "committed", "admitted twin");
  const program = lowerCheckedProcess(withTerminalFlow(twin.checkedProcess, "T"));
  assert.equal(only(program, "T", SemanticOperationKind.Activity).kind, SemanticOperationKind.Activity);
  const { profileAllowsProgramShape } = await import(new URL("../../semantic-core/dist/semantic-process-profile.js",
    import.meta.url).href) as { profileAllowsProgramShape: (profile: string, operations: SemanticProcessProgram["operations"],
      scopes: number) => boolean };
  assert.equal(profileAllowsProgramShape(program.identity.semanticProfile, program.operations,
    program.definitionScopes.length), true, "the operation shape alone is allowed");
  assert.equal(structuredScopeDataProgramAnalysis(program), null, "the concurrent analysis refuses the placement");
  assert.equal(isWellFormedSemanticProcessProgram(program), false, "so Program admission refuses it");
  const { outcome, ambiguousInternalChoice } = applyStimulus(program, initialState, start);
  assert.deepEqual({ outcome, ambiguousInternalChoice }, { outcome: "rejected", ambiguousInternalChoice: false },
    "host on a branch");
});

// Wrong algorithm 7: a splitting host whose shape passes the host arm but whose work fails the legacy operation's own
// validity at some output is refused at the operation level, so no consumer sees a host its settled projection would
// drop. The operation level separates the work fact: the concurrent analysis, part of Program well-formedness under this
// profile, refuses every metadata-bearing User Task host, well-formed or not.
test("ACSP-HOST-01: a splitting host with ill-formed task metadata or a refused descriptor is refused", async () => {
  const program = await admitted(await source(), model);
  const { isWellFormedSemanticOperation } = await import(new URL(
    "../../semantic-core/dist/semantic-process-operation-admission.js", import.meta.url).href) as {
    isWellFormedSemanticOperation: (value: unknown, placeIds: ReadonlySet<string>,
      placeOrigins: ReadonlyMap<string, string>, scopeOrigins: ReadonlyMap<string, string>, profile: string) => boolean };
  const placeIds = new Set(program.controlPlaces.map(({ id }) => id));
  const placeOrigins = new Map(program.controlPlaces.map(({ id, origin }) => [id, origin.elementId]));
  const scopeOrigins = new Map(program.definitionScopes.map(({ id, originElementId }) => [id, originElementId]));
  const valid = (operation: SemanticOperation) =>
    isWellFormedSemanticOperation(operation, placeIds, placeOrigins, scopeOrigins, program.identity.semanticProfile);
  const review = only(program, "ReviewClaim", SemanticOperationKind.Activity);
  const register = only(program, "RegisterClaim", SemanticOperationKind.Activity);
  assert.ok(review.kind === SemanticOperationKind.Activity && review.work.kind === ActivityWorkKind.UserTask);
  assert.ok(register.kind === SemanticOperationKind.Activity && register.work.kind === ActivityWorkKind.Effect);
  const task = review.work;
  const effect = register.work;
  const withCandidate = (candidate: string): SemanticOperation => ({ ...review, work: { ...task,
    task: { ...task.task, metadata: { assignment: { candidates: [{ kind: "group", id: candidate }] } } } } });
  assert.equal(valid(withCandidate("claims")), true, "well-formed task metadata");
  assert.equal(valid(withCandidate("")), false, "ill-formed task metadata");
  const withProtocol = (protocol: string): SemanticOperation => ({ ...register, work: { ...effect,
    effect: { ...effect.effect, descriptor: { ...effect.effect.descriptor, protocol } } } });
  assert.equal(valid(withProtocol(effect.effect.descriptor.protocol)), true, "the profile's effect protocol");
  assert.equal(valid(withProtocol("urn:example:refused")), false, "a descriptor the profile refuses");
});

// Wrong algorithm 11: the concurrent Program analysis counts *Register claim*'s host as a Task and a Service Task of
// *Intake*'s body, so the Task and Service Task bounds see it.
test("ACSP-HOST-01: the Task and Service Task bounds count a splitting Service Task host", async () => {
  const program = await admitted(await source(), model);
  const { programBodies } = await import(new URL("../../semantic-core/dist/nested-scope-control-program-bodies.js",
    import.meta.url).href) as { programBodies: (program: SemanticProcessProgram, data: unknown, structured: boolean) =>
      ReadonlyMap<string, Readonly<{ tasks: readonly string[]; serviceTasks: readonly string[] }>> | null };
  const handlers = new Set(program.operations.flatMap((operation) => operation.kind === SemanticOperationKind.AwaitEffect
    ? [operation.effect.descriptor.operation] : operation.kind === SemanticOperationKind.Activity &&
      operation.work.kind === ActivityWorkKind.Effect ? [operation.work.effect.descriptor.operation] : []));
  const bodies = programBodies(program, { records: program.scopeLocalData ?? [], handlers }, true);
  assert.ok(bodies !== null);
  const register = only(program, "RegisterClaim", SemanticOperationKind.Activity).id;
  const counted = [...bodies.values()].filter(({ tasks, serviceTasks }) =>
    tasks.includes(register) && serviceTasks.includes(register));
  assert.equal(counted.length, 1, "Register claim counts once as a Task and a Service Task");
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
const join = '<parallelGateway id="Join" gatewayDirection="Converging" />';

// The data-free twin: CIB's `testTakeAllOutgoingFlowsFromNonScopeTask` shape, a User Task splitting to two User Tasks,
// under an overlay that binds no handler, admitted or refused exactly as its explicit-fork twin is, both with a Join
// and with two Ends, and refused alike in CIB's own shape, whose branches meet at one None End.
test("ACSP-ADMIT-01: the data-free split is admitted exactly where its explicit-fork twin is", async () => {
  const tail = (shape: "join" | "ends" | "oneEnd") => shape === "join"
    ? `${join}<endEvent id="End" />${flow("j2", "T2", "Join")}${flow("j3", "T3", "Join")}${flow("j4", "Join", "End")}`
    : shape === "ends" ? `<endEvent id="End2" /><endEvent id="End3" />${flow("e2", "T2", "End2")}${flow("e3", "T3", "End3")}`
      : `<endEvent id="End" />${flow("e2", "T2", "End")}${flow("e3", "T3", "End")}`;
  const tasks = '<startEvent id="Start" /><userTask id="T1" /><userTask id="T2" /><userTask id="T3" />';
  for (const shape of ["join", "ends", "oneEnd"] as const) {
    const split = await compileUnbound(processOf(`${tasks}${flow("s", "Start", "T1")}${flow("a", "T1", "T2")}` +
      `${flow("b", "T1", "T3")}${tail(shape)}`));
    const explicit = await compileUnbound(processOf(`${tasks}${fork}${flow("s", "Start", "T1")}${flow("f", "T1", "Fork")}` +
      `${flow("a", "Fork", "T2")}${flow("b", "Fork", "T3")}${tail(shape)}`));
    assert.equal(split.status, explicit.status, `${shape}: split and explicit fork agree`);
    assert.equal(split.status, shape === "oneEnd" ? BpmnCompilationStatus.Rejected : BpmnCompilationStatus.Accepted, shape);
  }
});
