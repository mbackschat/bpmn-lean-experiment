import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  EffectExecutionResultKind, SemanticProfileId, StimulusKind, VariableValueKind, observeStableState,
} from "@bpmn-lean/semantic-core";
import type { BusinessValue, CanonicalObservation, EffectExecutionResult, VariableBinding } from "@bpmn-lean/semantic-core";
import type { EffectActivityImplementationResult } from "@bpmn-lean/temporal-protocol";
import { ApplicationFailure, WorkflowFailedError } from "@temporalio/client";
import {
  BpmnWorkflowHostInputKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue, bpmnTraceQueryName, bpmnWorkflowContinuationV1,
  createCachedLocalEnvironment, loadBpmnWorkflowBundle, processWorkflowId,
  readTestProcessTerminalResult, requireBpmnWorkflowContinuationStateV1,
  requireDurableEffectActivityHistory, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { EffectRequest, TemporalHistory } from "@bpmn-lean/temporal-testkit";
import { profile as serialProfile, source as serialSource } from "../../../bpmn-source/test/serial-business-task-fixture.ts";
import { profile as mixedProfile, source as mixedSource, sourceOverlay } from "../../../bpmn-source/test/mixed-task-control-flow-fixture.ts";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { createInvoiceEffectActivities } from "../../runner/examples/invoice-effect-activities.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const scalar = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const success = (value: string | null): EffectExecutionResult => ({ kind: EffectExecutionResultKind.Success,
  localPatch: [{ name: "result", value: value === null ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value } }] });
type Step = Readonly<{ kind: StimulusKind.CompleteUserTaskInstance; element: string; values: readonly VariableBinding[] }>
  | Readonly<{ kind: StimulusKind.CompleteEffect; element: string; result: EffectExecutionResult }>;
const human = (element: string, values: readonly VariableBinding[] = []): Step => ({ kind: StimulusKind.CompleteUserTaskInstance, element, values });
const effect = (element: string, result: EffectExecutionResult): Step => ({ kind: StimulusKind.CompleteEffect, element, result });

const serialXml = await readFile(serialSource, "utf8");
const chainXml = await readFile(new URL("../../../bpmn-source/test/fixtures/serial-invoice-classification.bpmn", import.meta.url), "utf8");
const assessmentXml = await readFile(new URL("../../../bpmn-source/test/fixtures/mixed-task-assessment-routing.bpmn", import.meta.url), "utf8");
const creditXml = await readFile(new URL("../../../../scenarios/portable-business-effect-data/credit-decision.bpmn", import.meta.url), "utf8");
const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });
// PBV-EFF witness: repeated equal checks, a negative scale-two Decimal, a nested Map and present Nulls.
const creditAssessment = map(
  ["amount", { kind: VariableValueKind.Decimal, coefficient: "-123455", scale: 2 }],
  ["approved", { kind: VariableValueKind.Boolean, value: true }],
  ["checks", { kind: VariableValueKind.List, value: [map(["code", text("ID")]), map(["code", text("ID")]), map(["code", text("INCOME")])] }],
  ["contact", map(["city", text("Berlin")], ["line2", { kind: VariableValueKind.Null }])],
  ["note", { kind: VariableValueKind.Null }],
);
const returns = (name: string, value: BusinessValue): EffectExecutionResult =>
  ({ kind: EffectExecutionResultKind.Success, localPatch: [{ name, value }] });
const cases = [
  { name: "serial-invoice", xml: serialXml, profile: serialProfile, handlers: ["invoiceValidator"], recoverEffect: 0,
    initial: [scalar("payload", "parent"), scalar("request", "draft")],
    steps: [human("Review", [scalar("request", "INV-42")]), effect("Validate", success("valid")), human("Finalize")] },
  { name: "serial-classification", xml: chainXml, profile: serialProfile, handlers: ["invoiceValidator", "invoiceClassifier"], recoverEffect: 1,
    initial: [scalar("payload", "parent"), scalar("request", "draft")],
    steps: [human("Review", [scalar("request", "INV-42")]), effect("Validate", success("valid")), effect("Classify", success("standard")), human("Finalize")] },
  { name: "mixed-invoice-rework", xml: await readFile(mixedSource, "utf8"), profile: mixedProfile, handlers: ["invoiceValidator"], recoverEffect: 1,
    initial: [scalar("request", "")],
    steps: [human("Review"), effect("Validate", success("rework")), human("Review", [scalar("request", "INV-42")]), effect("Validate", success("valid")), human("Finalize")] },
  ...["supplier", "internal"].map(route => ({ name: `mixed-assessment-${route}`, xml: assessmentXml, profile: mixedProfile,
    handlers: ["supplierAssessment", "recordAssessment"], recoverEffect: route === "supplier" ? 1 : 0,
    initial: [scalar("assessment", "approved"), scalar("route", route)],
    steps: [route === "supplier" ? effect("Supplier", success(null)) : human("Internal"),
      effect("Record", { kind: EffectExecutionResultKind.Success, localPatch: [] }), human("Approve")] })),
  // Worker loss during Notify carries the structured assessment in the open argument snapshot across rollover.
  { name: "effect-data-credit", xml: creditXml, profile: SemanticProfileId.PortableBusinessEffectData,
    handlers: ["assessCredit", "notifyApplicant"], recoverEffect: 1, initial: [scalar("applicantRef", "A-17")],
    steps: [effect("AssessCredit", returns("assessment", creditAssessment)), effect("NotifyApplicant", returns("receipt", text("sent")))] },
];

// These named operations depend on business arguments, never on oracle state or expected answers.
const invoiceActivities = createInvoiceEffectActivities();
async function executeBusinessOperation(request: EffectRequest): Promise<EffectActivityImplementationResult> {
  assert.equal(request.protocol, "urn:bpmn-lean:effect-protocol:activity-v1");
  const payload = request.arguments.find(binding => binding.name === "payload")?.value;
  switch (request.operation) {
    case "invoiceValidator":
    case "invoiceClassifier":
      return invoiceActivities.executeBpmnEffect(request);
    case "supplierAssessment":
      assert.deepEqual(request.arguments, []);
      return success(null);
    case "recordAssessment":
      assert.ok(payload !== undefined);
      return { kind: EffectExecutionResultKind.Success, localPatch: [] };
    case "assessCredit":
      assert.deepEqual(request.arguments, [scalar("applicant", "A-17")]);
      return returns("assessment", creditAssessment);
    case "notifyApplicant":
      assert.deepEqual(request.arguments, [{ name: "assessment", value: creditAssessment }]);
      return returns("receipt", text("sent"));
    default: throw new TypeError(`Unknown business operation ${request.operation}`);
  }
}

for (const scenario of cases) {
  test(`business composition preserves mapped data through recovery and replay: ${scenario.name}`, async () => {
    const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(scenario.xml),
      sourceId: scenario.name, expectedSha256: undefined, semanticProfile: scenario.profile,
      sourceOverlay: sourceOverlay(scenario.handlers, scenario.profile), limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 } });
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected admitted business process");
    const program = compiled.semanticProcess;
    const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
      instanceId: scenario.name, initialVariables: scenario.initial } as const;
    const workflowId = processWorkflowId(start.instanceId);
    const requests: EffectRequest[] = [];
    // MTCF-HOST-01: an idempotent caller cache must distinguish a new occurrence from its retry.
    const completedResults = new Map<string, EffectActivityImplementationResult>();
    const pending = Promise.withResolvers<void>();
    const activities = { executeBpmnEffect: async (request: EffectRequest) => {
      const callbackIndex = requests.length;
      requests.push(structuredClone(request));
      // Select Worker loss independently of key uniqueness, so a reused key still reaches the discriminator.
      if (callbackIndex === scenario.recoverEffect) {
        pending.resolve();
        // SERVICE-TASK-EFFECT's approved Worker-loss witness outlives the 2 s Activity attempt.
        await delay(2_500);
      }
      const cached = completedResults.get(request.idempotencyKey);
      if (cached !== undefined) return structuredClone(cached);
      const result = await executeBusinessOperation(request);
      completedResults.set(request.idempotencyKey, structuredClone(result));
      return structuredClone(result);
    } };
    const environment = await withDeadline(createCachedLocalEnvironment({ identity: scenario.name,
      downloadDirectory: temporalCacheDirectory }), 40_000, "business composition environment startup");
    const oracle = createBusinessTaskHostOracle(environment, program, start);
    let worker: WorkerLease | undefined;
    let carriedExpected: typeof oracle.state | undefined;
    let effectIndex = 0;
    try {
      const bundle = await loadBpmnWorkflowBundle();
      worker = await startBpmnTestWorker(environment, bundle, "business-original", activities);
      // Private direct starts establish refinement evidence before public profile admission.
      const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
        args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
          eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
        taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
      });
      oracle.advance(start);
      for (const [stepIndex, step] of scenario.steps.entries()) {
        switch (step.kind) {
          case StimulusKind.CompleteUserTaskInstance:
            await oracle.completeHuman(step.element, `human-${stepIndex}`, step.values);
            break;
          case StimulusKind.CompleteEffect: {
            const effectId = oracle.state.effectWaits[0]?.id;
            assert.ok(effectId !== undefined);
            assert.equal(effectId.elementId, step.element);
            const recovering = effectIndex === scenario.recoverEffect;
            if (recovering) {
              await withDeadline(pending.promise, 20_000, "business Activity pending");
              const predecessor = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
                state => state.openEffects.some(wait => isDeepStrictEqual(wait.id, effectId)));
              assert.deepEqual(predecessor, observeStableState(program, oracle.state));
              carriedExpected = oracle.state;
              await stopBpmnTestWorker(worker);
              worker = undefined;
              worker = await startBpmnTestWorker(environment, bundle, "business-replacement", activities);
            }
            oracle.completeEffect(step.result);
            if (recovering) {
              // Each selected recovery ends at a human wait. Inspect the current head after the observed
              // predecessor retires, without filtering on the expected route (MTCF-HOST-01).
              const successor = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
                state => !state.openEffects.some(wait => isDeepStrictEqual(wait.id, effectId)));
              assert.deepEqual(successor, observeStableState(program, oracle.state), "Recovered effect must publish its current-input result");
              await oracle.assertPublications();
            }
            effectIndex++;
            break;
          }
        }
      }
      const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "business composition completion");
      assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
      await oracle.assertPublications();
      assert.deepEqual([...new Map(requests.map(request => [request.idempotencyKey, request])).values()], oracle.requests);
      assert.equal(new Set(oracle.requests.map(request => request.idempotencyKey)).size, effectIndex);
      for (const [index, expected] of oracle.requests.entries()) {
        assert.deepEqual(requests.filter(request => request.idempotencyKey === expected.idempotencyKey),
          Array.from({ length: index === scenario.recoverEffect ? 2 : 1 }, () => expected));
      }
      const trace: CanonicalObservation[] = [];
      let completedEffects = 0;
      let carriedCount = 0;
      for (const run of await workflowChainRuns(environment, workflowId)) {
        const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
        const recorded = await runHandle.fetchHistory();
        const history = recorded as TemporalHistory;
        trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
        const scheduled = historyEvents(history, "activityTaskScheduledEventAttributes");
        if (scheduled.length > 0) {
          assert.equal(scheduled.length, 1);
          requireDurableEffectActivityHistory(history, oracle.requests[completedEffects]!,
            completedEffects === scenario.recoverEffect ? 2 : 1, oracle.results[completedEffects]!);
          completedEffects++;
        }
        for (const event of historyEvents(history, "workflowExecutionContinuedAsNewEventAttributes")) {
          const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
          const carried = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, start.instanceId);
          if (carried.effectWaits.some(wait => wait.id.elementId === carriedExpected?.effectWaits[0]?.id.elementId
            && wait.id.activation === carriedExpected?.effectWaits[0]?.id.activation)) {
            assert.deepEqual(carried, carriedExpected);
            carriedCount++;
          }
        }
        await replayBpmnHistory(bundle, recorded, workflowId);
      }
      assert.equal(carriedCount, 1);
      assert.equal(completedEffects, effectIndex);
      assert.deepEqual(trace, oracle.trace);
    } finally {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
      await environment.teardown();
    }
  });
}

// PBV-EFF-01: an existing profile keeps its scalar port domain, so a structured handler result is refused by the
// committed semantic intent rather than written or invalidated by transport.
test("an existing serial profile refuses a structured handler result as a typed host failure with no committed change", async () => {
  const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(serialXml),
    sourceId: "serial-structured-refusal", expectedSha256: undefined, semanticProfile: serialProfile,
    sourceOverlay: sourceOverlay(["invoiceValidator"], serialProfile), limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 } });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted);
  const program = compiled.semanticProcess;
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId: "serial-structured-refusal", initialVariables: [scalar("payload", "parent"), scalar("request", "draft")] } as const;
  const activities = { executeBpmnEffect: async (request: EffectRequest): Promise<EffectActivityImplementationResult> => {
    assert.equal(request.operation, "invoiceValidator");
    return returns("result", creditAssessment);
  } };
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: start.instanceId,
    downloadDirectory: temporalCacheDirectory }), 40_000, "structured refusal environment startup");
  const oracle = createBusinessTaskHostOracle(environment, program, start);
  let worker: WorkerLease | undefined;
  try {
    worker = await startBpmnTestWorker(environment, await loadBpmnWorkflowBundle(), "structured-refusal", activities);
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryEvents),
        eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      taskQueue: bpmnSemanticTaskQueue, workflowId: processWorkflowId(start.instanceId), workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    await oracle.completeHuman("Review", "human-0", [scalar("request", "INV-42")]);
    const failure = await withDeadline(readTestProcessTerminalResult(handle).then(
      () => assert.fail("The structured result must not complete the Process"), (error: unknown) => error), 20_000, "structured refusal");
    assert.ok(failure instanceof WorkflowFailedError && failure.cause instanceof ApplicationFailure);
    assert.equal(failure.cause.type, "BpmnEffectExecutionResultRejected");
    // The oracle never completed Validate, so equal publications and trace show nothing was committed.
    await oracle.assertPublications();
    assert.deepEqual(await handle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName), oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});
