import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type { SourceOverlaySelection } from "@bpmn-lean/bpmn-source";
import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionStartDescriptionStatus,
  EngineDefinitionStartIntegrityCode,
  EngineDefinitionStartStatus,
  compileBpmnDefinition,
  describeBpmnDefinitionVersionStart,
  prepareBpmnDefinitionVersionStart,
  startBpmnDefinitionVersion,
  startPreparedBpmnDefinitionVersion,
} from "@bpmn-lean/engine-api";
import type { EngineDefinitionStartRequest } from "@bpmn-lean/engine-api";
import { SemanticProfileId, StimulusKind } from "@bpmn-lean/semantic-core";
import type { Scenario, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { enrollmentFixture } from "../../temporal-adapter/client/test/worker-deployment-enrollment-fixture.ts";

const limits = { maxBytes: 1_048_576, parserDeadlineMs: 1_000 };
const taskQueue = "overlay-start-queue";
const businessCases = [
  ["serial-classification", "serial-invoice-classification.bpmn"],
  ["mixed-invoice-rework", "mixed-task-invoice-rework.bpmn"],
  ["business-error", "mixed-task-invoice-business-error.bpmn"],
] as const;

test("public compilation preserves the exact overlays accepted by private business compilation", async () => {
  for (const [fixture, source] of businessCases) {
    const request = await businessRequest(fixture, source, []);
    const direct = await compileBpmnToSemanticProcess(request);
    assert.equal(direct.status, BpmnCompilationStatus.Accepted, fixture);
    const result = await compileBpmnDefinition(request);
    assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted, fixture);
    assert.deepEqual(result.definition.sourceOverlay, identity(request.sourceOverlay));
    assert.equal("semanticProcess" in result, false);
    assert.equal("checkedProcess" in result, false);
  }
});

test("overlay-selected business starts preserve the admitted source identity through public dispatch", async () => {
  for (const [fixture, source] of businessCases) {
    const calls: CapturedStart[] = [];
    const request = await businessRequest(fixture, source, calls);
    const prepared = await prepareBpmnDefinitionVersionStart(request);
    assert.equal(prepared.status, EngineDefinitionStartStatus.Admitted, fixture);
    assert.deepEqual(prepared.definition.sourceOverlay, identity(request.sourceOverlay));
    assert.equal(calls.length, 0);
    const started = await startPreparedBpmnDefinitionVersion({ ...request, expectedIntent: prepared.intent });
    assert.equal(started.status, EngineDefinitionStartStatus.Started, fixture);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.options.args[1].identity.sourceOverlay, identity(request.sourceOverlay));
    assert.equal(calls[0]?.options.memo.bpmnLeanDirectStartIntentSha256, prepared.intent.intentSha256);
    const invalid = await startBpmnDefinitionVersion({ ...request, initialVariables: [] });
    assert.equal(invalid.status, EngineDefinitionStartStatus.Rejected);
    assert.equal(calls.length, 1, "missing required input must not reach Temporal");
  }
});

test("public compile and start reject overlay ID, digest and profile drift", async () => {
  const request = await mappedRequest([]);
  const mismatches = [
    [{ ...request.sourceOverlay, id: "wrong-overlay" }, "invalidSourceOverlay"],
    [{ ...request.sourceOverlay, sha256: "0".repeat(64) }, "invalidSourceOverlay"],
    [overlay(request.sourceOverlay.id, SemanticProfileId.MappedBoundaryErrorServiceTask), "unsupportedModel"],
  ] as const;
  for (const [sourceOverlay, diagnosticCode] of mismatches) {
    const calls: CapturedStart[] = [];
    const changed = { ...request, sourceOverlay, temporalClient: fakeClient(calls) };
    const compiled = await compileBpmnDefinition(changed);
    assert.equal(compiled.status, EngineDefinitionCompilationStatus.Rejected);
    assert.equal(compiled.diagnostics[0]?.code, diagnosticCode);
    const started = await startBpmnDefinitionVersion(changed);
    assert.equal(started.status, EngineDefinitionStartStatus.IntegrityFailure);
    assert.equal(started.failure.code, EngineDefinitionStartIntegrityCode.CompilationRejected);
    assert.equal(calls.length, 0);
  }
});

test("public compilation snapshots overlay identity and bytes before asynchronous parsing", async () => {
  const request = await mappedRequest([]);
  const expected = identity(request.sourceOverlay);
  const pending = compileBpmnDefinition(request);
  mutateOverlay(request.sourceOverlay);
  const result = await pending;
  assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted);
  assert.deepEqual(result.definition.sourceOverlay, expected);
});

test("exact prepare and both start paths snapshot and transport the selected overlay", async () => {
  for (const operation of ["prepare", "start", "preparedStart"] as const) {
    const calls: CapturedStart[] = [];
    const request = await mappedRequest(calls);
    const expected = identity(request.sourceOverlay);
    const prepared = await prepareBpmnDefinitionVersionStart(request);
    assert.equal(prepared.status, EngineDefinitionStartStatus.Admitted);
    const pending = operation === "prepare"
      ? prepareBpmnDefinitionVersionStart(request)
      : operation === "start"
      ? startBpmnDefinitionVersion(request)
      : startPreparedBpmnDefinitionVersion({ ...request, expectedIntent: prepared.intent });
    mutateOverlay(request.sourceOverlay);
    const result = await pending;
    assert.equal(result.status, operation === "prepare"
      ? EngineDefinitionStartStatus.Admitted
      : EngineDefinitionStartStatus.Started);
    assert.deepEqual(result.definition.sourceOverlay, expected);
    assert.equal(calls.length, operation === "prepare" ? 0 : 1);
    if (operation !== "prepare") {
      assert.deepEqual(calls[0]?.options.args[1].identity.sourceOverlay, expected);
      assert.equal(calls[0]?.options.memo.bpmnLeanDirectStartIntentSha256, prepared.intent.intentSha256);
      assert.equal(calls[0]?.options.args.length, 3);
    }
  }
});

test("different admitted overlays change the complete intent and cannot reuse a prepared marker", async () => {
  const calls: CapturedStart[] = [];
  const original = await mappedRequest(calls);
  const first = await prepareBpmnDefinitionVersionStart(original);
  assert.equal(first.status, EngineDefinitionStartStatus.Admitted);
  const paddedBytes = new Uint8Array([...original.sourceOverlay.bytes, 0x0a]);
  for (const sourceOverlay of [
    overlay("other-admitted-overlay"),
    { ...original.sourceOverlay, bytes: paddedBytes, sha256: sha256(paddedBytes) },
  ]) {
    const changed = { ...original, sourceOverlay };
    const second = await prepareBpmnDefinitionVersionStart(changed);
    assert.equal(second.status, EngineDefinitionStartStatus.Admitted);
    assert.notEqual(first.intent.intentSha256, second.intent.intentSha256);
    const result = await startPreparedBpmnDefinitionVersion({
      ...changed,
      expectedIntent: first.intent,
    });
    assert.equal(result.status, EngineDefinitionStartStatus.IntegrityFailure);
    assert.equal(result.failure.code, EngineDefinitionStartIntegrityCode.ConstructorDrift);
  }
  assert.equal(calls.length, 0);
});

test("recovery classifies a retained intent for another admitted overlay as divergent without starting", async () => {
  const calls: CapturedStart[] = [];
  const original = await mappedRequest(calls);
  const changed = { ...original, sourceOverlay: overlay("other-retained-overlay") };
  const first = await prepareBpmnDefinitionVersionStart(original);
  const second = await prepareBpmnDefinitionVersionStart(changed);
  assert.equal(first.status, EngineDefinitionStartStatus.Admitted);
  assert.equal(second.status, EngineDefinitionStartStatus.Admitted);
  const temporalClient = {
    connection: { withDeadline: async (_deadline: number, invoke: () => Promise<unknown>) => invoke() },
    getHandle: (workflowId: string) => ({
      describe: async () => ({
        workflowId,
        type: "runBpmnProcess",
        taskQueue,
        memo: { bpmnLeanDirectStartIntentSha256: first.intent.intentSha256 },
      }),
    }),
  } as unknown as EngineDefinitionStartRequest["temporalClient"];
  for (const [expectedIntent, status] of [
    [first.intent, EngineDefinitionStartDescriptionStatus.Matching],
    [second.intent, EngineDefinitionStartDescriptionStatus.Divergent],
  ] as const) {
    assert.deepEqual(await describeBpmnDefinitionVersionStart({
      temporalClient,
      processInstanceId: original.processInstanceId,
      taskQueue,
      expectedIntent,
    }), { status });
  }
  assert.equal(calls.length, 0);
});

type OverlayStartRequest = EngineDefinitionStartRequest & Readonly<{
  sourceOverlay: SourceOverlaySelection;
}>;
type CapturedStart = Readonly<{
  options: Readonly<{
    args: readonly [unknown, SemanticProcessProgram, unknown];
    memo: Readonly<{ bpmnLeanDirectStartIntentSha256: string }>;
  }>;
}>;

async function mappedRequest(calls: CapturedStart[]): Promise<OverlayStartRequest> {
  const source = await readFile(new URL(
    "../../../scenarios/mapped-success-service-task/process.bpmn",
    import.meta.url,
  ), "utf8");
  const bytes = new TextEncoder().encode(source.replace(
    "${mappedSuccessHandler}", "${alternateMappedSuccessHandler}",
  ));
  return {
    bytes,
    sourceId: "mapped-overlay-source",
    expectedSha256: sha256(bytes),
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
    sourceOverlay: overlay("mapped-api-overlay"),
    expectedProcessId: "Process_MappedSuccess",
    processInstanceId: "mapped-overlay-instance",
    initialVariables: [],
    limits,
    taskQueue,
    temporalClient: fakeClient(calls),
  };
}

async function businessRequest(
  fixture: string,
  source: string,
  calls: CapturedStart[],
): Promise<OverlayStartRequest> {
  const scenario = JSON.parse(await readFile(new URL(
    `../../differential/test/fixtures/${fixture}.scenario.json`, import.meta.url,
  ), "utf8")) as Scenario;
  const start = scenario.stimuli[0];
  assert.ok(start?.kind === StimulusKind.StartProcess);
  assert.ok(scenario.bpmn.sourceOverlay !== null);
  return {
    bytes: await readFile(new URL(`../../bpmn-source/test/fixtures/${source}`, import.meta.url)),
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    semanticProfile: scenario.profile,
    sourceOverlay: {
      ...scenario.bpmn.sourceOverlay,
      bytes: await readFile(new URL(`../../differential/test/fixtures/${fixture}.overlay.json`, import.meta.url)),
    },
    expectedProcessId: start.processId,
    processInstanceId: start.instanceId,
    initialVariables: start.initialVariables,
    limits,
    taskQueue,
    temporalClient: fakeClient(calls),
  };
}

function overlay(
  id: string,
  semanticProfile: string = SemanticProfileId.MappedSuccessServiceTask,
): SourceOverlaySelection {
  const bytes = new TextEncoder().encode(JSON.stringify({
    kind: "bpmnSourceOverlay",
    id,
    semanticProfile,
    effectBindings: [{
      source: { implementation: null, delegateExpression: "${alternateMappedSuccessHandler}" },
      descriptor: {
        protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
      },
    }],
    inertAttributes: [],
  }));
  return { id, sha256: sha256(bytes), bytes };
}

function identity(selection: SourceOverlaySelection) {
  return { id: selection.id, sha256: selection.sha256 };
}

function mutateOverlay(selection: SourceOverlaySelection): void {
  const mutable = selection as { id: string; sha256: string; bytes: Uint8Array };
  mutable.id = "mutated-overlay";
  mutable.sha256 = "0".repeat(64);
  mutable.bytes.fill(0);
}

function fakeClient(calls: CapturedStart[]): EngineDefinitionStartRequest["temporalClient"] {
  return {
    ...enrollmentFixture(taskQueue),
    start: async (_workflowType: unknown, options: CapturedStart["options"]) => {
      calls.push({ options });
      return {};
    },
  } as unknown as EngineDefinitionStartRequest["temporalClient"];
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
