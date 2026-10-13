import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { CommandOutcome, EffectExecutionResultKind, StimulusKind, VariableValueKind,
  observeStableState, supportsSemanticProcessExecution } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, RuntimeState } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostCapabilityResultKind } from "@bpmn-lean/temporal-protocol";
import {
  BpmnWorkflowHostInputKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType, bpmnSemanticTaskQueue,
  bpmnTraceQueryName, bpmnWorkflowContinuationV1, createCachedLocalEnvironment, loadBpmnWorkflowBundle,
  processWorkflowId, readTestProcessTerminalResult, requireBpmnWorkflowContinuationStateV1,
  requireDurableEffectActivityHistory, submitUserTaskCompletion, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { EffectRequest, TemporalHistory } from "@bpmn-lean/temporal-testkit";
import { parallelCommandInputs } from "../../../bpmn-source/test/parallel-scope-command-fixture.ts";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

// Runs and reports, but cannot fail the gate until PC-MI-05 opens legitimate production PMIS admission
// (docs/PRACTICAL-CIB7-COVERAGE-TARGET.md); remove the marker in that change.
test("PMIS two-body work survives Worker replacement, forced rollover and every-Run replay", {
  todo: "PC-MI-05: production PMIS admission is not yet open",
}, async () => {
  const input = (await parallelCommandInputs()).find(({ count }) => count === 2)!;
  const { program, start } = input;
  // Both production admission boundaries must open legitimately before this witness starts any service.
  assert.equal(supportsSemanticProcessExecution(start, program), true, "PMIS real recovery requires admitted execution input");
  assert.equal(assessTemporalHostCapability(program).kind, TemporalHostCapabilityResultKind.Admitted,
    "PMIS real recovery requires admitted host capability");
  const requests: EffectRequest[] = [];
  const attempts = new Map<string, number>();
  const pending = Promise.withResolvers<void>();
  const result = { kind: EffectExecutionResultKind.Success,
    localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "accepted" } }] } as const;
  const activities = { executeBpmnEffect: async (request: EffectRequest) => {
    assert.equal(request.protocol, "urn:bpmn-lean:effect-protocol:activity-v1");
    assert.equal(request.operation, "invoiceValidator");
    requests.push(structuredClone(request));
    const attempt = (attempts.get(request.idempotencyKey) ?? 0) + 1;
    attempts.set(request.idempotencyKey, attempt);
    if (attempts.size === 1 && attempt === 1) {
      pending.resolve();
      // Reuse SERVICE-TASK-EFFECT's Worker-loss witness: the first attempt outlives its 2 s deadline.
      await delay(2_500);
    }
    return result;
  } };
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: "pmis-recovery",
    downloadDirectory: temporalCacheDirectory }), 40_000, "PMIS recovery environment startup");
  let worker: WorkerLease | undefined;
  try {
    const oracle = createBusinessTaskHostOracle(environment, program, start);
    const workflowId = processWorkflowId(start.instanceId);
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "pmis-original", activities);
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    const completeHuman = async (elementId: string, activation: number) => {
      const wait = oracle.state.userTaskWaits.find(wait => wait.id.elementId === elementId && wait.id.activation === activation);
      assert.ok(wait, "exact oracle occurrence is enabled");
      const published = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
        state => state.openUserTasks.some(task => task.id.elementId === elementId && task.id.activation === activation));
      assert.deepEqual(published, observeStableState(program, oracle.state));
      await oracle.assertPublications();
      const command = { kind: StimulusKind.CompleteUserTaskInstance, commandId: `${elementId}-${activation}`,
        taskId: wait.id, submittedValues: [] } as const;
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, command),
        { kind: "semantic", commandId: command.commandId, outcome: CommandOutcome.Committed });
      oracle.advance(command);
      return command;
    };
    await completeHuman("Review", 1);
    const carriedExpected: RuntimeState = oracle.state;
    assert.equal(carriedExpected.effectWaits.length, 1);
    assert.equal(carriedExpected.userTaskWaits[0]?.id.elementId, "Review");
    assert.equal(carriedExpected.variables.scopes.length, 2);
    await withDeadline(pending.promise, 20_000, "PMIS first Activity pending");
    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, "pmis-replacement", activities);
    oracle.completeEffect(result);
    await completeHuman("Confirm", 1);
    assert.equal(oracle.state.variables.scopes.length, 1);
    await completeHuman("Review", 2);
    oracle.completeEffect(result);
    await completeHuman("Confirm", 2);
    const finalCommand = await completeHuman("PublishBatch", 1);
    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "PMIS recovery completion");
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, finalCommand),
      { kind: "semantic", commandId: finalCommand.commandId, outcome: CommandOutcome.Committed });
    await oracle.assertPublications();
    assert.equal(oracle.requests.length, 2);
    for (const [index, expected] of oracle.requests.entries())
      assert.deepEqual(requests.filter(request => request.idempotencyKey === expected.idempotencyKey),
        Array.from({ length: index === 0 ? 2 : 1 }, () => expected));
    assert.equal(new Set(requests.map(request => request.idempotencyKey)).size, 2);
    const trace: CanonicalObservation[] = [];
    let carriedCount = 0, completedEffects = 0;
    const runs = await workflowChainRuns(environment, workflowId);
    assert.ok(runs.length > 1, "forced rollover creates a successor Run");
    for (const run of runs) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      const recorded = await runHandle.fetchHistory();
      const history = recorded as TemporalHistory;
      trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      if (historyEvents(history, "activityTaskScheduledEventAttributes").length > 0) {
        assert.equal(historyEvents(history, "activityTaskScheduledEventAttributes").length, 1);
        requireDurableEffectActivityHistory(history, oracle.requests[completedEffects]!, completedEffects === 0 ? 2 : 1, result);
        completedEffects++;
      }
      for (const event of historyEvents(history, "workflowExecutionContinuedAsNewEventAttributes")) {
        const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
        const carried = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, start.instanceId);
        if (carried.effectWaits.some(wait => wait.id.elementId === carriedExpected.effectWaits[0]!.id.elementId &&
            wait.id.activation === carriedExpected.effectWaits[0]!.id.activation)) {
          assert.deepEqual(carried, carriedExpected);
          carriedCount++;
        }
      }
      await replayBpmnHistory(bundle, recorded, workflowId);
    }
    assert.equal(carriedCount, 1);
    assert.equal(completedEffects, 2);
    assert.deepEqual(trace, oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});
