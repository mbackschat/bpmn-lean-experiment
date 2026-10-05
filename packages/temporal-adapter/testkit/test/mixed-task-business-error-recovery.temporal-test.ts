import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { ActivityNotFoundError, ApplicationFailure, WorkflowFailedError } from "@temporalio/client";
import { CompleteAsyncError, Context } from "@temporalio/activity";

import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, StimulusKind,
  VariableValueKind,
  observeStableState, projectEffectTransportMaterial, projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation, EffectExecutionResult, VariableBinding,
} from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue, bpmnTraceQueryName, bpmnWorkflowContinuationV1,
  createCachedLocalEnvironment, effectTransportKey,
  loadBpmnWorkflowBundle, processWorkflowId, readTestProcessTerminalResult,
  requireBpmnWorkflowContinuationStateV1, submitUserTaskCompletion,
  workflowChainProductionLimit,
  requireDurableEffectActivityHistory,
  EffectActivityResultKind,
} from "@bpmn-lean/temporal-testkit";
import type {
  EffectRequest, TemporalHistory,
  EffectActivityImplementationResult,
} from "@bpmn-lean/temporal-testkit";

import { compile, source } from "../../../bpmn-source/test/mixed-task-business-error-fixture.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { workflowChainRuns } from "./workflow-chain-test-support.ts";

import { createInvoiceRecoveryEffectActivities } from "../../runner/examples/invoice-effect-activities.ts";

import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";

const invoiceActivities = createInvoiceRecoveryEffectActivities();

const scalar = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const success: EffectExecutionResult = { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "valid")] };
const businessError: EffectExecutionResult = { kind: EffectExecutionResultKind.BpmnError,
  code: "REVIEW_REQUIRED", message: "Invoice requires correction", localPatch: [scalar("result", "correct")] };

for (const mode of ["business-recovery", "transport-failure", "typed-technical-failure"] as const) {
  test(`business Error hosting preserves semantic publications and replay: ${mode}`, async () => {
    const compiled = await compile(await readFile(source, "utf8"));
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected admitted business Error invoice");
    const program = compiled.semanticProcess;
    const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
      instanceId: `business-error-${mode}`, initialVariables: [scalar("request", "missing-reference")] } as const;
    const workflowId = processWorkflowId(start.instanceId);
    const requests: EffectRequest[] = [];
    const attempts = new Map<string, number>();
    const pending = Promise.withResolvers<void>();
    let obsoleteTaskToken: Uint8Array | undefined;
    let repeatedRequest: EffectRequest | undefined;
    const activities = {
      executeBpmnEffect: async (request: EffectRequest): Promise<EffectActivityImplementationResult> => {
        requests.push(structuredClone(request));
        const attempt = (attempts.get(request.idempotencyKey) ?? 0) + 1;
        attempts.set(request.idempotencyKey, attempt);
        assert.equal(request.protocol, "urn:bpmn-lean:effect-protocol:activity-v1");
        assert.equal(request.arguments.length, 1);
        const payload = request.arguments[0]!;
        assert.equal(payload.name, "payload");
        assert.equal(payload.value.kind, VariableValueKind.String);
        if (payload.value.kind !== VariableValueKind.String) throw new TypeError("Expected scalar invoice");
        switch (mode) {
          case "transport-failure": throw new Error("Invoice service unavailable");
          case "typed-technical-failure": return { kind: EffectActivityResultKind.TechnicalFailure };
          case "business-recovery": break;
        }
        if (request.operation === "invoiceValidator" && attempt === 1) {
          if (payload.value.value === "missing-reference") {
            obsoleteTaskToken = Context.current().info.taskToken;
            // Retain a real task token to deliver its obsolete result after the accepted retry.
            throw new CompleteAsyncError();
          }
          if (payload.value.value === "policy-review") {
            repeatedRequest = request;
            pending.resolve();
            // SERVICE-TASK-EFFECT's retained Worker-loss schedule outlives the 2 s attempt.
            await delay(2_500);
          }
        }
        return invoiceActivities.executeBpmnEffect(request);
      },
    };
    const environment = await withDeadline(createCachedLocalEnvironment({
      identity: "business-error-recovery", downloadDirectory: temporalCacheDirectory,
    }), 40_000, "business Error Temporal environment startup");
    let worker: WorkerLease | undefined;
    const oracle = createBusinessTaskHostOracle(environment, program, start);

    try {
      const bundle = await loadBpmnWorkflowBundle();
      worker = await startBpmnTestWorker(environment, bundle, "business-error-original", activities);
      // The direct harness start qualifies the private profile without publishing production admission.
      const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
        args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
          eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
        taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
      });
      oracle.advance(start);
      await oracle.completeHuman("Review", "review-first");
      if (mode !== "business-recovery") {
        await assert.rejects(withDeadline(handle.result(), 20_000, "technical failure termination"), error => {
          assert.ok(error instanceof WorkflowFailedError);
          assert.ok(error.cause instanceof ApplicationFailure);
          if (mode === "transport-failure") {
            assert.equal(error.cause.type, "BPMN_EFFECT_EXECUTION_EXHAUSTED");
            assert.equal(error.cause.cause, undefined);
            assert.deepEqual(error.cause.details, [{ failureType: "BPMN_EFFECT_EXECUTION_EXHAUSTED",
              message: "Effect Activity exhausted its bounded execution policy" }]);
          } else {
            assert.equal(error.cause.type, "BPMN_EFFECT_TECHNICAL_FAILURE_UNSUPPORTED");
          }
          return true;
        });
        await oracle.assertPublications();
        const expectedEffect = projectOpenEffects(oracle.state)[0]!;
        assert.equal(expectedEffect.id.elementId, "Validate");
        const request = { ...expectedEffect.descriptor, arguments: expectedEffect.arguments,
          idempotencyKey: effectTransportKey(projectEffectTransportMaterial(program, expectedEffect)) };
        assert.deepEqual(requests, Array.from({ length: mode === "transport-failure" ? 2 : 1 }, () => request));
        const actualTrace: CanonicalObservation[] = [];
        let failedActivities = 0;
        let completedActivities = 0;
        let failedWorkflows = 0;
        for (const run of await workflowChainRuns(environment, workflowId)) {
          const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
          const history = await runHandle.fetchHistory();
          actualTrace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
          failedActivities += historyEvents(history as TemporalHistory, "activityTaskFailedEventAttributes").length;
          completedActivities += historyEvents(history as TemporalHistory, "activityTaskCompletedEventAttributes").length;
          failedWorkflows += historyEvents(history as TemporalHistory, "workflowExecutionFailedEventAttributes").length;
          await replayBpmnHistory(bundle, history, workflowId);
        }
        assert.equal(failedActivities, mode === "transport-failure" ? 1 : 0);
        assert.equal(completedActivities, mode === "transport-failure" ? 0 : 1);
        assert.equal(failedWorkflows, 1);
        assert.deepEqual(actualTrace, oracle.trace);
        return;
      }
      oracle.completeEffect(businessError);
      await oracle.completeHuman("CorrectData", "correct-data", [scalar("request", "policy-review")]);
      const secondReview = await oracle.completeHuman("Review", "review-second");
      await withDeadline(pending.promise, 20_000, "repeated validation Activity pending");
      const pendingExpected = oracle.state;
      const effect = projectOpenEffects(oracle.state)[0]!;
      assert.equal(effect.id.elementId, "Validate");
      assert.equal(effect.id.activation, 2);
      const pendingRequest = { ...effect.descriptor, arguments: effect.arguments,
        idempotencyKey: effectTransportKey(projectEffectTransportMaterial(program, effect)) };
      assert.deepEqual(repeatedRequest, pendingRequest);
      await stopBpmnTestWorker(worker);
      worker = undefined;
      assert.ok(obsoleteTaskToken !== undefined);
      const obsoleteResult: EffectExecutionResult = { kind: EffectExecutionResultKind.Success,
        localPatch: [scalar("result", "obsolete-first-occurrence")] };
      await assert.rejects(environment.client.connection.withDeadline(Date.now() + 5_000,
        () => environment.client.activity.complete(obsoleteTaskToken!, obsoleteResult)), ActivityNotFoundError);
      worker = await startBpmnTestWorker(environment, bundle, "business-error-replacement", activities);
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, secondReview), {
        kind: "semantic", commandId: secondReview.commandId, outcome: CommandOutcome.Committed,
      });
      oracle.completeEffect(success);
      oracle.completeEffect(businessError);
      await oracle.completeHuman("ReviewPolicy", "correct-policy", [scalar("request", "approved")]);
      await oracle.completeHuman("Review", "review-third");
      oracle.completeEffect(success);
      oracle.completeEffect(success);
      await oracle.completeHuman("Finalize", "finalize");
      const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "business Error terminal result");
      assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
      await oracle.assertPublications();
      assert.equal(attempts.get(pendingRequest.idempotencyKey), 2);
      assert.deepEqual(requests.filter(({ idempotencyKey }) => idempotencyKey === oracle.requests[0]!.idempotencyKey),
        [oracle.requests[0], oracle.requests[0]]);
      assert.deepEqual(requests.filter(({ idempotencyKey }) => idempotencyKey === pendingRequest.idempotencyKey), [pendingRequest, pendingRequest]);
      assert.deepEqual([...new Map(requests.map(request => [request.idempotencyKey, request])).values()], oracle.requests);
      assert.equal(new Set(oracle.requests.map(({ idempotencyKey }) => idempotencyKey)).size, 5);

      const runs = await workflowChainRuns(environment, workflowId);
      assert.ok(runs.length > 1);
      const actualTrace: CanonicalObservation[] = [];
      let carriedRepeatedEffect = 0;
      let scheduledEffects = 0;
      for (const run of runs) {
        const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
        const recordedHistory = await runHandle.fetchHistory();
        const history = recordedHistory as TemporalHistory;
        actualTrace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
        const scheduled = historyEvents(history, "activityTaskScheduledEventAttributes");
        if (scheduled.length > 0) {
          const request = oracle.requests[scheduledEffects]!;
          requireDurableEffectActivityHistory(history, request, scheduledEffects <= 1 ? 2 : 1,
            oracle.results[scheduledEffects]!);
          scheduledEffects += scheduled.length;
        }
        for (const event of historyEvents(history, "workflowExecutionContinuedAsNewEventAttributes")) {
          const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
          const carried = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, start.instanceId);
          if (carried.effectWaits.some(({ id }) => id.elementId === "Validate" && id.activation === 2)) {
            assert.deepEqual(carried, pendingExpected);
            carriedRepeatedEffect += 1;
          }
        }
        await replayBpmnHistory(bundle, recordedHistory, workflowId);
      }
      assert.equal(carriedRepeatedEffect, 1);
      assert.equal(scheduledEffects, 5);
      assert.deepEqual(actualTrace, oracle.trace);
    } finally {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
      await environment.teardown();
    }
  });
}
