/**
 * NEF-ADMIT-01 and the lowering half of NEF-END-01 over the retained travel request model, through the exact-bytes source
 * path and the core's checked-graph and Program analyses. The oracle is the None End fan-in specification's "Separating
 * witnesses": each refused edit differs from an admitted model in the one fact its label names, and each Program
 * negative edits one origin or scope of the admitted Program, so only the rule it names can refuse it.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, BpmnSourceDiagnosticCode, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CheckedNodeKind, SemanticOperationKind, SemanticProfileId, isWellFormedSemanticProcessProgram, nestedScopeProgramModel,
  scopeReentryCheckedAnalysis, scopeReentryProgramAnalysis,
} from "@bpmn-lean/semantic-core";
import type { SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/none-end-fan-in/", import.meta.url);
const travel = await readFile(new URL("travel-request.bpmn", directory), "utf8");
const overlay = new Uint8Array(await readFile(new URL("travel-request-overlay.json", directory)));

const forks = new URL("../../../scenarios/root-parallel-forks/", import.meta.url);
const onboarding = await readFile(new URL("employee-onboarding.bpmn", forks), "utf8");
const onboardingOverlay = new Uint8Array(await readFile(new URL("employee-onboarding-overlay.json", forks)));

async function compile(xml: string, model: "travel-request" | "employee-onboarding" = "travel-request") {
  const bytes = model === "travel-request" ? overlay : onboardingOverlay;
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: `${model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes },
    limits: semanticProcessTestLimits,
  });
}

/** Admits the model and checks both re-entry analysis levels agree on it. */
async function admitted(label: string, xml: string) {
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true, label);
  const analysis = scopeReentryProgramAnalysis(result.semanticProcess);
  assert.ok(analysis !== null, label);
  assert.deepEqual(scopeReentryCheckedAnalysis(result.checkedProcess), analysis, label);
  return result;
}

async function refused(label: string, xml: string, model?: "employee-onboarding"): Promise<void> {
  const result = await compile(xml, model);
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

/** The `reachNoneEnd` operations of the End `end`, as `[operation id, input place, scope]`. */
function endArrivals(program: SemanticProcessProgram, end: string): readonly (readonly [string, string, string])[] {
  return program.operations.flatMap(operation =>
    operation.kind === SemanticOperationKind.ReachNoneEnd && operation.origin.elementId === end
      ? [[operation.id, operation.input,
        program.operationScopes.find(({ operationId }) => operationId === operation.id)!.scopeId] as const]
      : []);
}

/** `program` with the origin element of operation `id` replaced by `elementId`. */
function withOrigin(program: SemanticProcessProgram, id: string, elementId: string): SemanticProcessProgram {
  assert.ok(program.operations.some(operation => operation.id === id), id);
  return { ...program, operations: program.operations.map(operation => operation.id === id
    ? { ...operation, origin: { ...operation.origin, elementId } } as SemanticOperation : operation) };
}

const rootScope = (program: SemanticProcessProgram): string =>
  program.definitionScopes.find(({ parentScopeId }) => parentScopeId === null)!.id;

test("NEF-ADMIT-01 admits a root None End with three incoming flows and lowers one operation per flow", async () => {
  const { checkedProcess, semanticProcess } = await admitted("travel request", travel);
  assert.equal(checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.NoneEndEvent).length, 2);
  assert.deepEqual(checkedProcess.sequenceFlows.filter(({ targetId }) => targetId === "RequestClosed").map(({ id }) => id),
    ["Flow_Booked", "Flow_Called", "Flow_Reject"]);
  const root = rootScope(semanticProcess);
  assert.deepEqual(endArrivals(semanticProcess, "RequestClosed"), [
    ["operation:RequestClosed:from:Flow_Booked", "place:Flow_Booked", root],
    ["operation:RequestClosed:from:Flow_Called", "place:Flow_Called", root],
    ["operation:RequestClosed:from:Flow_Reject", "place:Flow_Reject", root],
  ]);
  // A single-incoming End keeps its element-derived identifier, so every Program lowered before this family is unchanged.
  assert.deepEqual(endArrivals(semanticProcess, "AssessmentClosed").map(([id]) => id), ["operation:AssessmentClosed"]);
  // SRE-AVAILABLE-01: Assess request's inputs are literals and the Choice reads its outputs, so only Book travel's input
  // is a required Start binding.
  assert.deepEqual(scopeReentryProgramAnalysis(semanticProcess)?.required, ["traveller"]);
});

test("NEF-ADMIT-01 admits two flows of one Choice into the End", async () => {
  const twoFromChoice = edited(travel,
    [`targetRef="CallTraveller">`, `targetRef="RequestClosed">`],
    [`    <userTask id="CallTraveller" name="Call traveller" />\n`, ""],
    [`    <sequenceFlow id="Flow_Called" sourceRef="CallTraveller" targetRef="RequestClosed" />\n`, ""]);
  const { semanticProcess } = await admitted("two flows of Route request", twoFromChoice);
  assert.deepEqual(endArrivals(semanticProcess, "RequestClosed").map(([, input]) => input),
    ["place:Flow_Booked", "place:Flow_Call", "place:Flow_Reject"]);
});

test("NEF-ADMIT-01 refuses fan-in at an Activity, fan-in under a fork and a second root End", async () => {
  await refused("the reject candidate redirected to Book travel", edited(travel,
    [`<sequenceFlow id="Flow_Reject" sourceRef="RouteRequest" targetRef="RequestClosed">`,
      `<sequenceFlow id="Flow_Reject" sourceRef="RouteRequest" targetRef="BookTravel">`]));
  // Fan-in under a fork, isolated from SRE-ROUTE-01: the retained root-fork model, admitted today, with both branches
  // ending at its End instead of joining. The concurrent account's End arity refuses it.
  assert.equal((await compile(onboarding, "employee-onboarding")).status, BpmnCompilationStatus.Accepted);
  await refused("the two root branches of the employee onboarding end at its End without joining", edited(onboarding,
    [`    <parallelGateway id="OnboardingReady" name="Onboarding ready" />\n    <userTask id="HoldWelcomeMeeting" name="Hold welcome meeting" />\n`, ""],
    [`targetRef="OnboardingReady" />\n    <sequenceFlow id="Flow_DocumentsCollected"`, `targetRef="EmployeeOnboarded" />\n    <sequenceFlow id="Flow_DocumentsCollected"`],
    [`<sequenceFlow id="Flow_DocumentsCollected" sourceRef="CollectDocuments" targetRef="OnboardingReady" />`,
      `<sequenceFlow id="Flow_DocumentsCollected" sourceRef="CollectDocuments" targetRef="EmployeeOnboarded" />`],
    [`    <sequenceFlow id="Flow_Ready" sourceRef="OnboardingReady" targetRef="HoldWelcomeMeeting" />\n    <sequenceFlow id="Flow_Welcomed" sourceRef="HoldWelcomeMeeting" targetRef="EmployeeOnboarded" />\n`, ""]),
    "employee-onboarding");
  await refused("Book travel with its own second None End", edited(travel,
    [`    <endEvent id="RequestClosed" name="Request closed" />`,
      `    <endEvent id="RequestClosed" name="Request closed" />\n    <endEvent id="TravelBooked" name="Travel booked" />`],
    [`<sequenceFlow id="Flow_Booked" sourceRef="BookTravel" targetRef="RequestClosed" />`,
      `<sequenceFlow id="Flow_Booked" sourceRef="BookTravel" targetRef="TravelBooked" />`]));
});

test("the Program envelope counts a shared End origin once only among root End arrivals", async () => {
  const { semanticProcess } = await admitted("travel request", travel);
  assert.ok(nestedScopeProgramModel(semanticProcess) !== null);
  const sharesTaskOrigin = withOrigin(semanticProcess, "operation:RequestClosed:from:Flow_Called", "CallTraveller");
  assert.equal(nestedScopeProgramModel(sharesTaskOrigin), null, "an End arrival sharing a User Task's origin");
  assert.equal(scopeReentryProgramAnalysis(sharesTaskOrigin), null);
  const acrossScopes = withOrigin(semanticProcess, "operation:AssessmentClosed", "RequestClosed");
  assert.equal(nestedScopeProgramModel(acrossScopes), null, "a body End sharing the root End's origin");
  assert.equal(scopeReentryProgramAnalysis(acrossScopes), null);
});

test("SRE-ADMIT-01 at the Program level counts root End elements, not End arrivals", async () => {
  const { semanticProcess } = await admitted("travel request", travel);
  const secondEnd = withOrigin(semanticProcess, "operation:RequestClosed:from:Flow_Booked", "TravelBooked");
  assert.ok(nestedScopeProgramModel(secondEnd) !== null, "two root End elements pass the envelope");
  assert.equal(scopeReentryProgramAnalysis(secondEnd), null, "and the one-End rule refuses them");
});
