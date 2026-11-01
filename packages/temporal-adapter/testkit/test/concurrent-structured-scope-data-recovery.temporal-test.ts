/**
 * The concurrent structured scope data hosting witness of the proposal's Temporal preflight, on the order fulfilment model
 * with the registered `order-review-first` values.
 *
 * Starting arms *Pick items* with structured arguments beside the pending *Review route*. A lowered Event History limit
 * makes that Run roll over, so Continue-As-New carries the *Pick items* wait unscheduled with its arming snapshot. The
 * successor issues it, its first attempt detaches while the Worker is replaced, *Review route* completes with its sibling
 * write, and only then does the retried *Pick items* return its structured result. The request must still carry the
 * arming snapshot (CSSD-SNAPSHOT-01). Publications follow the core oracle after every command, every Run replays, and the
 * final Process variables equal the core's.
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
import type {
  CanonicalObservation, EffectExecutionResult, EffectOccurrenceId, StartProcessStimulus, Stimulus, VariableBinding,
} from "@bpmn-lean/semantic-core";
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

const directory = new URL("../../../../scenarios/concurrent-structured-scope-data/", import.meta.url);
const instanceId = "concurrent-structured-scope-data-recovery";
/** A gated handler waits well inside the two-second start-to-close timeout of the legacy Activity policy. */
const gateDeadlineMs = 1_500;

async function within(promise: Promise<void>, label: string): Promise<void> {
  await Promise.race([promise, delay(gateDeadlineMs).then(() => { throw new Error(`${label} gate expired`); })]);
}

/** The registered schedule's committed values: Start variables, the *Review route* submission and each effect result. */
async function registeredValues() {
  const scenario = JSON.parse(await readFile(new URL("order-review-first.scenario.json", directory), "utf8")) as
    { stimuli: Stimulus[] };
  const [start] = scenario.stimuli;
  assert.ok(start?.kind === StimulusKind.StartProcess);
  const review = scenario.stimuli.find(stimulus => stimulus.commandId === "complete-review-route");
  assert.ok(review?.kind === StimulusKind.CompleteUserTaskInstance);
  const results = new Map(scenario.stimuli.flatMap(stimulus =>
    stimulus.kind === StimulusKind.CompleteEffect ? [[stimulus.effectId.elementId, stimulus.result] as const] : []));
  return { initialVariables: start.initialVariables, submitted: review.submittedValues, results };
}

test("concurrent structured scope data survives forced Continue-As-New, Worker replacement and every-Run replay",
  { timeout: 90_000 }, async () => {
    const overlay = await readFile(new URL("order-fulfilment-overlay.json", directory));
    const compiled = await compileBpmnToSemanticProcess({
      bytes: await readFile(new URL("order-fulfilment.bpmn", directory)), sourceId: "order-fulfilment", expectedSha256: undefined,
      semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
      sourceOverlay: { id: "order-fulfilment-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
      limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
    });
    assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
    const program = compiled.semanticProcess;
    const { initialVariables, submitted, results } = await registeredValues();
    const resultOf = (elementId: string): EffectExecutionResult => {
      const result = results.get(elementId);
      assert.ok(result !== undefined && result.kind === EffectExecutionResultKind.Success, elementId);
      return result;
    };
    const start: StartProcessStimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
      instanceId, initialVariables };
    const workflowId = processWorkflowId(instanceId);
    const environment = await withDeadline(createCachedLocalEnvironment({
      identity: "concurrent-structured-scope-data-recovery", downloadDirectory: temporalCacheDirectory,
    }), 40_000, "concurrent structured scope data Temporal environment startup");
    const oracle = createBusinessTaskHostOracle(environment, program, start);
    const effectId = (elementId: string): EffectOccurrenceId => ({ processInstanceId: instanceId, elementId, activation: 1 });
    const keyOf = (elementId: string): string => {
      const effect = projectOpenEffects(oracle.state).find(({ id }) => id.elementId === elementId);
      assert.ok(effect !== undefined, `${elementId} must be open`);
      return effectTransportKey(projectEffectTransportMaterial(program, effect));
    };

    const pickFirstAttempt = Promise.withResolvers<void>();
    const reviewed = Promise.withResolvers<void>();
    const picked = Promise.withResolvers<void>();
    const requests: EffectRequest[] = [];
    const activities = {
      executeBpmnEffect: async (request: EffectRequest) => {
        requests.push(structuredClone(request));
        if (request.operation === "rateShipment") {
          // The oracle commits Pick items' result first, so Rate shipment returns only after it.
          await within(picked.promise, "Pick items result");
          await delay(250);
          return resultOf("RateShipment");
        }
        if (request.operation !== "pickItems") return resultOf("NotifyCustomer");
        if (Context.current().info.attempt === 1) {
          pickFirstAttempt.resolve();
          // The detached first attempt times out under the legacy policy and retries on the replacement Worker.
          throw new CompleteAsyncError();
        }
        await within(reviewed.promise, "Review route");
        picked.resolve();
        return resultOf("PickItems");
      },
    };

    async function published(): Promise<void> {
      const expected = observeStableState(program, oracle.state);
      assert.deepEqual(await waitForPublishedWorkflowChainState(environment, workflowId, program, instanceId,
        state => isDeepStrictEqual(state, expected)), expected);
      await oracle.assertPublications();
    }
    async function completeHuman(elementId: string, submittedValues: readonly VariableBinding[]): Promise<void> {
      await published();
      const command = { kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
        taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues } as const;
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, instanceId, command),
        { kind: "semantic", commandId: command.commandId, outcome: CommandOutcome.Committed });
      oracle.advance(command);
    }

    let worker: WorkerLease | undefined;
    try {
      const bundle = await loadBpmnWorkflowBundle();
      worker = await startBpmnTestWorker(environment, bundle, "concurrent-structured-scope-data-original", activities);
      const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
        args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
          eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
        taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
      });
      oracle.advance(start);
      const pickKey = keyOf("PickItems");
      const armed = projectEffectTransportMaterial(program,
        projectOpenEffects(oracle.state).find(({ id }) => id.elementId === "PickItems")!).arguments;
      await published();

      // Pick items is in flight on the original Worker, Review route still pending, when the Worker is replaced.
      await withDeadline(pickFirstAttempt.promise, 20_000, "Pick items first attempt");
      await stopBpmnTestWorker(worker);
      worker = undefined;
      worker = await startBpmnTestWorker(environment, bundle, "concurrent-structured-scope-data-replacement", activities);

      await completeHuman("ReviewRoute", submitted);
      reviewed.resolve();
      oracle.advance(completeEffectStimulus(effectId("PickItems"), resultOf("PickItems")));
      oracle.advance(completeEffectStimulus(effectId("RateShipment"), resultOf("RateShipment")));
      oracle.advance(completeEffectStimulus(effectId("NotifyCustomer"), resultOf("NotifyCustomer")));
      await completeHuman("ConfirmFulfilment", []);
      await completeHuman("CloseOrder", []);

      const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "order fulfilment terminal result");
      assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
      assert.equal(terminal.receipt.finalState.status, ProcessStatus.Completed);
      await oracle.assertPublications();
      // Both Pick items attempts carry the arming snapshot, never Review route's later sibling write.
      const picks = requests.filter(({ idempotencyKey }) => idempotencyKey === pickKey);
      assert.equal(picks.length, 2);
      for (const pick of picks) assert.deepEqual(pick.arguments, armed);

      const runs = await workflowChainRuns(environment, workflowId);
      const trace: CanonicalObservation[] = [];
      let carriedPickWaits = 0;
      for (const run of runs) {
        const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
        const history = await runHandle.fetchHistory();
        trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
        for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
          const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
          const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, instanceId);
          if (state.effectWaits.some(({ id }) => id.elementId === "PickItems")) carriedPickWaits++;
        }
        await replayBpmnHistory(bundle, history, workflowId);
      }
      assert.ok(runs.length > 1);
      assert.ok(carriedPickWaits > 0, "Continue-As-New must carry the Pick items wait with its arming snapshot");
      assert.deepEqual(trace, oracle.trace);
    } finally {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
      await environment.teardown();
    }
  });
