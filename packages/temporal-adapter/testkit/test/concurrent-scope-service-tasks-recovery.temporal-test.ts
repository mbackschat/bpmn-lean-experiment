/**
 * The concurrent scope Service Task refinement witness of the capsule's hosting preflight, on the claim intake model.
 *
 * A lowered Event History limit makes the policy-lookup Run request rollover once the first Price damage wait opens
 * beside the in-flight lookup, so Continue-As-New carries both Price damage waits unscheduled. The successor issues both
 * Activities, whose first attempts detach while the Worker is replaced; the replacement completes Price damage 2 before
 * Price damage 1. Publications follow the core oracle after every command, and every Run replays. The interleaving of a
 * human Update between the two results is the registered `claim-price-two-first` pipeline schedule's evidence.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { CompleteAsyncError, Context } from "@temporalio/activity";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, ProcessStatus, SemanticProfileId, StimulusKind, observeStableState,
  projectEffectTransportMaterial, projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, EffectOccurrenceId, StartProcessStimulus } from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType, bpmnSemanticTaskQueue, bpmnTraceQueryName,
  bpmnWorkflowContinuationV1, completeEffectStimulus, createCachedLocalEnvironment, effectTransportKey,
  loadBpmnWorkflowBundle, processWorkflowId, readTestProcessTerminalResult, requireBpmnWorkflowContinuationStateV1,
  submitUserTaskCompletion, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { EffectRequest, TemporalHistory } from "@bpmn-lean/temporal-testkit";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const directory = new URL("../../../../scenarios/concurrent-scope-service-tasks/", import.meta.url);
const instanceId = "concurrent-scope-effects-recovery";
const success = { kind: EffectExecutionResultKind.Success, localPatch: [] } as const;
/** A gated handler waits well inside the two-second start-to-close timeout of the legacy Activity policy. */
const gateDeadlineMs = 1_500;

async function within(promise: Promise<void>, label: string): Promise<void> {
  await Promise.race([promise, delay(gateDeadlineMs).then(() => { throw new Error(`${label} gate expired`); })]);
}

test("concurrent scope effects survive forced Continue-As-New, Worker replacement and every-Run replay", { timeout: 90_000 }, async () => {
  const overlay = await readFile(new URL("claim-intake-handlers.json", directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("claim-intake.bpmn", directory)), sourceId: "claim-intake", expectedSha256: undefined,
    semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion,
    sourceOverlay: { id: "claim-intake-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
  const program = compiled.semanticProcess;
  const start: StartProcessStimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId, initialVariables: [] };
  const workflowId = processWorkflowId(instanceId);
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "concurrent-scope-effects-recovery", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "concurrent scope effects Temporal environment startup");
  const oracle = createBusinessTaskHostOracle(environment, program, start);
  const keyOf = (element: string, activation: number): string => {
    const effect = projectOpenEffects(oracle.state).find(({ id }) => id.elementId === element && id.activation === activation);
    assert.ok(effect !== undefined, `${element} activation ${activation} must be open`);
    return effectTransportKey(projectEffectTransportMaterial(program, effect));
  };
  const effectId = (elementId: string, activation: number): EffectOccurrenceId => ({ processInstanceId: instanceId, elementId, activation });

  const collected = Promise.withResolvers<void>();
  const firstAttempts = new Map<string, PromiseWithResolvers<void>>();
  const secondPriceReturned = Promise.withResolvers<void>();
  const requests: EffectRequest[] = [];
  let priceKeys: Readonly<{ first: string; second: string }> | undefined;
  const activities = {
    executeBpmnEffect: async (request: EffectRequest) => {
      requests.push(structuredClone(request));
      if (request.operation === "policyLookup") {
        await within(collected.promise, "police report");
        return success;
      }
      assert.ok(priceKeys !== undefined && request.operation === "damagePricing");
      if (Context.current().info.attempt === 1) {
        firstAttempts.get(request.idempotencyKey)?.resolve();
        // Detached first attempts time out under the legacy policy and retry on the replacement Worker.
        throw new CompleteAsyncError();
      }
      if (request.idempotencyKey === priceKeys.second) {
        secondPriceReturned.resolve();
        return success;
      }
      await within(secondPriceReturned.promise, "Price damage 2");
      await delay(250);
      return success;
    },
  };

  async function published(): Promise<void> {
    const expected = observeStableState(program, oracle.state);
    assert.deepEqual(await waitForPublishedWorkflowChainState(environment, workflowId, program, instanceId,
      state => isDeepStrictEqual(state, expected)), expected);
    await oracle.assertPublications();
  }
  async function completeHuman(elementId: string, activation: number): Promise<void> {
    await published();
    const command = { kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}-${activation}`,
      taskId: { processInstanceId: instanceId, elementId, activation }, submittedValues: [] } as const;
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, instanceId, command),
      { kind: "semantic", commandId: command.commandId, outcome: CommandOutcome.Committed });
    oracle.advance(command);
  }

  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "concurrent-scope-effects-original", activities);
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    const policyKey = keyOf("ServiceTask_FetchPolicy", 1);

    await completeHuman("UserTask_CollectPoliceReport", 1);
    collected.resolve();
    oracle.advance(completeEffectStimulus(effectId("ServiceTask_FetchPolicy", 1), success));
    priceKeys = { first: keyOf("ServiceTask_PriceDamage", 1), second: keyOf("ServiceTask_PriceDamage", 2) };
    for (const key of [priceKeys.first, priceKeys.second]) firstAttempts.set(key, Promise.withResolvers<void>());
    await published();

    // Both Price damage Activities are in flight on the original Worker when it is replaced.
    await withDeadline(Promise.all([...firstAttempts.values()].map(({ promise }) => promise)), 20_000,
      "both Price damage first attempts");
    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, "concurrent-scope-effects-replacement", activities);

    oracle.advance(completeEffectStimulus(effectId("ServiceTask_PriceDamage", 2), success));
    oracle.advance(completeEffectStimulus(effectId("ServiceTask_PriceDamage", 1), success));
    await completeHuman("UserTask_ConfirmAssessment", 1);
    await completeHuman("UserTask_ConfirmAssessment", 2);
    await completeHuman("UserTask_SettleClaim", 1);

    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "concurrent scope effects terminal result");
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    assert.equal(terminal.receipt.finalState.status, ProcessStatus.Completed);
    await oracle.assertPublications();
    // Every request is keyed by its committed occurrence; each Price damage ran its detached attempt and its retry.
    // The policy lookup may retry once if its gate outlives an attempt, so only its key is fixed.
    const keys = requests.map(({ idempotencyKey }) => idempotencyKey);
    assert.ok(keys.filter(key => key !== priceKeys!.first && key !== priceKeys!.second).every(key => key === policyKey));
    assert.deepEqual(keys.filter(key => key !== policyKey).toSorted(),
      [priceKeys.first, priceKeys.first, priceKeys.second, priceKeys.second].toSorted());

    const runs = await workflowChainRuns(environment, workflowId);
    const trace: CanonicalObservation[] = [];
    let carriedUnscheduledEffects = 0;
    let completedActivities = 0;
    for (const run of runs) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      const history = await runHandle.fetchHistory();
      trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      completedActivities += historyEvents(history as TemporalHistory, "activityTaskCompletedEventAttributes").length;
      for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
        const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
        const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, instanceId);
        // Rollover waits for every issued Activity to settle, so a carried effect wait has no Activity behind it.
        if (state.effectWaits.length === 2) carriedUnscheduledEffects++;
      }
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.ok(runs.length > 1);
    assert.ok(carriedUnscheduledEffects > 0, "Continue-As-New must carry both unscheduled Price damage waits");
    assert.equal(completedActivities, 3);
    assert.deepEqual(trace, oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});
