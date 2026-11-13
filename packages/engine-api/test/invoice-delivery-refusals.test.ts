/**
 * PC-DELIVERY-01's refusals through the engine API, on the exact source, overlay and profile each of its three invoice
 * journeys binds (`packages/differential/test/fixtures/{serial-classification,mixed-invoice-rework,business-error}`):
 * after rework the superseded Review occurrence is refused; a technical failure of *Validate* is an incident that its
 * business Error boundary never catches; and stale bytes or another journey's overlay are refused before any instance
 * exists. The kernel scenarios beside the journeys carry the first two schedules (`*-superseded-review*`,
 * `business-error-technical-failure`). Effect results are the memory host's own inputs, as a Workflow's Activity
 * delivers them; everything else goes through the API.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionStartStatus,
  EngineDeploymentIntegrityCode,
  EngineDeploymentStatus,
  EngineIncidentObservationStatus,
  EngineIncidentOperationKind,
  EngineOpenWorkStatus,
  EnginePublicationStatus,
  compileBpmnDefinition,
  completeWork,
  engineProcessLocatorForCanonicalProcess,
  observeEngineProcessExecution,
  observeEngineProcessIncidents,
  observeOpenWork,
  registerEngineDeployment,
  startBpmnDefinitionVersion,
  submitEngineIncidentOperation,
  type EngineBinding,
  type EngineDeploymentRequest,
  type EngineSourceOverlaySelection,
} from "@bpmn-lean/engine-api";

import { cibProfile, deployed, limits, sha256, testHost, testPopulation, type TestHost } from "./support.ts";

const projectRoot = new URL("../../../", import.meta.url);
const fixtures = "packages/differential/test/fixtures/";
const profile = await cibProfile();
const instance = "invoice";
const locator = engineProcessLocatorForCanonicalProcess(testPopulation, instance);
const workflowId = decodeURIComponent(locator.slice("bpmn-process:".length));

type Scenario = Readonly<{
  id: string;
  profile: string;
  bpmn: Readonly<{ relativePath: string; sha256: string; sourceOverlay: Readonly<{ id: string; sha256: string }> }>;
}>;

/** A journey's deployment exactly as its scenario binds it: source bytes, overlay bytes and the digests that bind them. */
type Journey = Readonly<{
  sourceId: string;
  processId: string;
  bytes: Uint8Array;
  sha256: string;
  overlay: EngineSourceOverlaySelection;
}>;

async function journey(name: string, processId: string): Promise<Journey> {
  const scenario = JSON.parse(await readFile(new URL(`${fixtures}${name}.scenario.json`, projectRoot), "utf8")) as Scenario;
  assert.equal(scenario.profile, profile.id);
  const bytes = new Uint8Array(await readFile(new URL(scenario.bpmn.relativePath, projectRoot)));
  const overlayBytes = new Uint8Array(await readFile(new URL(`${fixtures}${name}.overlay.json`, projectRoot)));
  assert.equal(await sha256(bytes), scenario.bpmn.sha256, `${name} binds its source's exact bytes`);
  assert.equal(await sha256(overlayBytes), scenario.bpmn.sourceOverlay.sha256, `${name} binds its overlay's exact bytes`);
  return {
    sourceId: scenario.id, processId, bytes, sha256: scenario.bpmn.sha256,
    overlay: { ...scenario.bpmn.sourceOverlay, bytes: overlayBytes },
  };
}

const serial = await journey("serial-classification", "Process_InvoiceValidation");
const rework = await journey("mixed-invoice-rework", "Invoice");
const businessError = await journey("business-error", "Invoice");

const text = (value: string) => ({ kind: "string", value }) as const;
const binding = (name: string, value: string): EngineBinding => ({ name, value: text(value) });
const at = (elementId: string, activation: number) => ({ processInstanceId: instance, elementId, activation });

const deployment = (host: TestHost, selected: Journey): EngineDeploymentRequest => ({
  host, bytes: selected.bytes, sourceId: selected.sourceId, expectedSha256: selected.sha256, profile,
  expectedProcessId: selected.processId, version: 1, limits, sourceOverlay: selected.overlay,
});

/** A deployed journey started with `variables`, as its scenario's start stimulus does. */
async function started(selected: Journey, variables: readonly EngineBinding[]): Promise<TestHost> {
  const host = testHost();
  const request = await deployed(deployment(host, selected));
  const result = await startBpmnDefinitionVersion({ ...request, processInstanceId: instance, initialVariables: variables });
  assert.equal(result.status, EngineDefinitionStartStatus.Started);
  return host;
}

let commands = 0;
async function complete(host: TestHost, elementId: string, activation: number, values: readonly EngineBinding[] = []):
  Promise<string> {
  const result = await completeWork({
    host, locator, hostingProcessInstanceId: instance,
    completion: { commandId: `${elementId}-${String(activation)}-${String(++commands)}`, taskId: at(elementId, activation), values },
  });
  return result.kind === "semantic" ? `${result.outcome}${result.code === null ? "" : ` ${result.code}`}` : result.kind;
}

type Outcome =
  | Readonly<{ kind: "success"; outputs: readonly EngineBinding[] }>
  | Readonly<{ kind: "businessFailure"; code: string; message: string; outputs: readonly EngineBinding[] }>
  | Readonly<{ kind: "technicalFailure" }>;

async function effect(host: TestHost, elementId: string, activation: number, outcome: Outcome): Promise<string> {
  const answer = await host.processes.arrive(workflowId, {
    kind: "effectResult", commandId: `${elementId}-effect-${String(++commands)}`, occurrence: at(elementId, activation), outcome,
  });
  return answer.outcome;
}

const success = (result: string): Outcome => ({ kind: "success", outputs: [binding("result", result)] });
const reviewRequired: Outcome =
  { kind: "businessFailure", code: "REVIEW_REQUIRED", message: "Invoice requires correction", outputs: [binding("result", "correct")] };

/** The open User Tasks as `Element#activation`, sorted; `null` once the process is closed. */
async function openTasks(host: TestHost): Promise<readonly string[] | null> {
  const work = await observeOpenWork({ host, locator, hostingProcessInstanceId: instance });
  if (work.status === EngineOpenWorkStatus.Closed) return null;
  assert.equal(work.status, EngineOpenWorkStatus.Open);
  return work.status === EngineOpenWorkStatus.Open
    ? work.openUserTasks.map((task) => `${task.id.elementId}#${String(task.id.activation)}`).sort()
    : [];
}

async function committedState(host: TestHost, selected: Journey) {
  const compiled = await compileBpmnDefinition({
    bytes: selected.bytes, sourceId: selected.sourceId, profile, limits, sourceOverlay: selected.overlay,
  });
  if (compiled.status !== EngineDefinitionCompilationStatus.Accepted) throw new Error(`not admitted: ${compiled.diagnostics[0].code}`);
  const page = await observeEngineProcessExecution({
    host, locator, definition: { ...compiled.definition, ref: { ...compiled.definition.ref, version: 1 } },
    processInstanceId: instance, afterRevision: 0,
  });
  if (page.status !== EnginePublicationStatus.Available || page.current === null) throw new Error("no committed state");
  return page.current.state;
}

const variable = async (host: TestHost, selected: Journey, name: string) =>
  (await committedState(host, selected)).variables.find((entry) => entry.name === name)?.value;

test("after rework the superseded Review occurrence is refused, and the current one carries the journey to its end", async () => {
  const host = await started(rework, [binding("request", "initial")]);
  assert.equal(await complete(host, "Review", 1, [binding("request", "draft")]), "committed");
  assert.equal(await effect(host, "Validate", 1, success("rework")), "committed");
  assert.deepEqual(await openTasks(host), ["Review#2"]);

  assert.equal(await complete(host, "Review", 1, [binding("request", "stale-draft")]), "rejected unknown-user-task");
  assert.deepEqual(await openTasks(host), ["Review#2"]);
  assert.deepEqual(await variable(host, rework, "request"), text("draft"), "the refused completion wrote nothing");

  assert.equal(await complete(host, "Review", 2, [binding("request", "INV-42")]), "committed");
  assert.equal(await effect(host, "Validate", 2, success("valid")), "committed");
  assert.equal(await complete(host, "Review", 2), "rejected unknown-user-task");
  assert.equal(await complete(host, "Finalize", 1), "committed");
  assert.equal(await openTasks(host), null);
});

test("after both business Error recoveries each earlier Review occurrence is refused beside the current one", async () => {
  const host = await started(businessError, [binding("request", "initial"), binding("result", "parent-result")]);
  assert.equal(await complete(host, "Review", 1, [binding("request", "missing-reference")]), "committed");
  assert.equal(await effect(host, "Validate", 1, reviewRequired), "committed");
  assert.equal(await complete(host, "CorrectData", 1, [binding("request", "policy-review")]), "committed");
  assert.equal(await complete(host, "Review", 1, [binding("request", "stale-draft")]), "rejected unknown-user-task");
  assert.equal(await complete(host, "Review", 2), "committed");
  assert.equal(await effect(host, "Validate", 2, success("valid")), "committed");
  assert.equal(await effect(host, "Authorize", 1, reviewRequired), "committed");
  assert.equal(await complete(host, "ReviewPolicy", 1, [binding("request", "INV-42")]), "committed");
  assert.deepEqual(await openTasks(host), ["Review#3"]);
  for (const activation of [1, 2]) {
    assert.equal(await complete(host, "Review", activation, [binding("request", "stale-policy")]), "rejected unknown-user-task");
  }
  assert.deepEqual(await variable(host, businessError, "request"), text("INV-42"));
  assert.deepEqual(await openTasks(host), ["Review#3"]);
});

test("a technical failure of Validate is an incident its business Error boundary never catches", async () => {
  const host = await started(businessError, [binding("request", "initial"), binding("result", "parent-result")]);
  assert.equal(await complete(host, "Review", 1, [binding("request", "missing-reference")]), "committed");
  assert.equal(await effect(host, "Validate", 1, { kind: "technicalFailure" }), "committed");

  const incidents = await observeEngineProcessIncidents({ host, locator, hostingProcessInstanceId: instance });
  assert.equal(incidents.status, EngineIncidentObservationStatus.Observed);
  assert.deepEqual(incidents.status === EngineIncidentObservationStatus.Observed ? incidents.incidents.map((wait) => wait.id) : [],
    [at("Validate", 1)]);
  assert.deepEqual(await openTasks(host), [], "no correction task: the boundary was not taken");
  assert.equal(await complete(host, "CorrectData", 1, [binding("request", "policy-review")]), "rejected unknown-user-task");
  assert.deepEqual(await variable(host, businessError, "result"), text("parent-result"), "no error-path output was written");

  const retried = await submitEngineIncidentOperation({
    host, locator, hostingProcessInstanceId: instance,
    operation: { kind: EngineIncidentOperationKind.RetryIncident, commandId: "retry-validate", incident: { occurrence: at("Validate", 1), generation: 1 } },
  });
  assert.deepEqual(retried.kind === "semantic" ? retried.outcome : retried.kind, "committed");
  // The business failure of the same, restored occurrence is the one the boundary catches.
  assert.equal(await effect(host, "Validate", 1, reviewRequired), "committed");
  assert.deepEqual(await openTasks(host), ["CorrectData#1"]);
});

test("a journey source whose bytes are not its recorded digest is refused before registration, and nothing starts", async () => {
  const host = testHost();
  const stale = { ...deployment(host, businessError), bytes: rework.bytes };
  const compiled = await compileBpmnDefinition({ ...stale, sourceId: businessError.sourceId });
  assert.deepEqual(compiled.status === EngineDefinitionCompilationStatus.Rejected ? compiled.diagnostics[0].code : compiled.status,
    "source.identityMismatch");
  const registered = await registerEngineDeployment(stale);
  assert.deepEqual(registered.status === EngineDeploymentStatus.IntegrityFailure ? registered.failure.code : registered.status,
    EngineDeploymentIntegrityCode.CompilationRejected);
  assert.deepEqual(await host.population.deployments(), []);
  const start = await startBpmnDefinitionVersion({ ...stale, processInstanceId: instance, initialVariables: [] });
  assert.equal(start.status, EngineDefinitionStartStatus.IntegrityFailure);
  assert.equal(await host.processes.describe(workflowId), null);
});

test("a deployed journey started from stale bytes is an integrity failure that starts no instance", async () => {
  const host = testHost();
  const request = await deployed(deployment(host, businessError));
  const start = await startBpmnDefinitionVersion({ ...request, bytes: rework.bytes, processInstanceId: instance, initialVariables: [] });
  assert.equal(start.status, EngineDefinitionStartStatus.IntegrityFailure);
  assert.equal(await host.processes.describe(workflowId), null);
});

test("another journey's overlay, a missing one or one under the wrong digest is refused with a stable code", async () => {
  const codeOf = async (selected: Journey, sourceOverlay: EngineSourceOverlaySelection | null) => {
    const compiled = await compileBpmnDefinition({
      bytes: selected.bytes, sourceId: selected.sourceId, expectedSha256: selected.sha256, profile, limits, sourceOverlay,
    });
    return compiled.status === EngineDefinitionCompilationStatus.Rejected
      ? `${compiled.diagnostics[0].code} ${String(compiled.diagnostics[0].element)}`
      : compiled.status;
  };
  // All three overlays carry the id `invoice-handlers`; only the digest tells them apart.
  assert.equal(await codeOf(businessError, { ...businessError.overlay, bytes: rework.overlay.bytes }), "source.overlay null");
  assert.equal(await codeOf(businessError, rework.overlay), "work.service.unboundImplementation Authorize");
  assert.equal(await codeOf(serial, businessError.overlay), "work.service.unboundImplementation Classify");
  assert.equal(await codeOf(businessError, null), "work.service.unboundImplementation Validate");
  for (const selected of [serial, rework, businessError]) {
    assert.equal(await codeOf(selected, selected.overlay), EngineDefinitionCompilationStatus.Accepted);
  }

  const host = testHost();
  const registered = await registerEngineDeployment({ ...deployment(host, businessError), sourceOverlay: rework.overlay });
  assert.equal(registered.status, EngineDeploymentStatus.IntegrityFailure);
  assert.deepEqual(await host.population.deployments(), []);
});
