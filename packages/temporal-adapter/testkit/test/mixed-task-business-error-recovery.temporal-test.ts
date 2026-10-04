import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { ActivityNotFoundError, ApplicationFailure, WorkflowFailedError } from "@temporalio/client";
import { CompleteAsyncError, Context } from "@temporalio/activity";

import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, ScenarioStepKind, StimulusKind,
  VariableValueKind, advanceScenario, deployProcess, initialState,
  observeStableState, projectEffectTransportMaterial, projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation, EffectExecutionResult, RuntimeState, Stimulus, VariableBinding,
  SemanticFlowNodeOccurrenceAnchor,
} from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue, bpmnTraceQueryName, bpmnWorkflowContinuationV1,
  completeEffectStimulus, createCachedLocalEnvironment, effectTransportKey,
  loadBpmnWorkflowBundle, processWorkflowId, readTestProcessTerminalResult,
  requireBpmnWorkflowContinuationStateV1, submitUserTaskCompletion,
  workflowChainProductionLimit,
  ExecutionPublicationResultKind, FlowNodeOccurrencePublicationResultKind,
  observeTemporalExecutionPublication, observeTemporalFlowNodeOccurrences,
  requireDurableEffectActivityHistory,
  EffectActivityResultKind,
} from "@bpmn-lean/temporal-testkit";
import type {
  EffectRequest, TemporalHistory, FlowNodeOccurrenceStart,
  TemporalExecutionPublicationClient, TemporalFlowNodeOccurrencePublicationClient,
  EffectActivityImplementationResult,
} from "@bpmn-lean/temporal-testkit";

import { compile, source } from "../../../bpmn-source/test/mixed-task-business-error-fixture.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

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
    let expected: RuntimeState = initialState;
    const expectedTrace: CanonicalObservation[] = [deployProcess(start, program).observation];
    const expectedRequests: EffectRequest[] = [];
    const expectedResults: EffectExecutionResult[] = [];
    const expectedExecution: unknown[] = [];
    const expectedOccurrences: unknown[] = [];
    const openOccurrences: Array<{ anchor: SemanticFlowNodeOccurrenceAnchor; start: FlowNodeOccurrenceStart }> = [];
    let revision = 0;
    let expectedCurrent: unknown;
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
        switch (request.operation) {
          case "invoiceValidator":
            if (payload.value.value === "missing-reference") {
              if (attempt === 1) {
                obsoleteTaskToken = Context.current().info.taskToken;
                // Retain a real task token to deliver its obsolete result after the accepted retry.
                throw new CompleteAsyncError();
              }
              return businessError;
            }
            if (payload.value.value === "policy-review" && attempt === 1) {
              repeatedRequest = request;
              pending.resolve();
              // SERVICE-TASK-EFFECT's retained Worker-loss schedule outlives the 2 s attempt.
              await delay(2_500);
            }
            return success;
          case "policyChecker":
            return payload.value.value === "policy-review" ? businessError : success;
          default:
            throw new TypeError(`Unknown invoice operation ${request.operation}`);
        }
      },
    };
    const environment = await withDeadline(createCachedLocalEnvironment({
      identity: "business-error-recovery", downloadDirectory: temporalCacheDirectory,
    }), 40_000, "business Error Temporal environment startup");
    let worker: WorkerLease | undefined;

    function advance(stimulus: Stimulus): void {
      const step = advanceScenario(program, expected, stimulus);
      assert.equal(step.kind, ScenarioStepKind.Committed);
      if (step.kind !== ScenarioStepKind.Committed) assert.fail("Expected committed oracle step");
      expected = step.state;
      expectedTrace.push(...step.observations);
      assert.ok(step.publication !== null && step.flowNodeOccurrenceLifecycles !== null);
      const fromRevision = revision;
      const transitions = step.publication.transitions.map(transition => ({ ...transition, revision: ++revision }));
      const occurrenceTransitions = step.flowNodeOccurrenceLifecycles.map((lifecycle, index) => {
        const currentRevision = fromRevision + index + 1;
        const started = lifecycle.started.map(({ anchor, ...fact }, startIndex) => {
          assert.ok(!openOccurrences.some(entry => isDeepStrictEqual(entry.anchor, anchor)));
          const startFact = { ...fact, id: { processInstanceId: start.instanceId, startRevision: currentRevision, startIndex } };
          openOccurrences.push({ anchor, start: startFact });
          return startFact;
        });
        const ended = lifecycle.ended.map(({ anchor, terminal }) => {
          const position = openOccurrences.findIndex(entry => isDeepStrictEqual(entry.anchor, anchor));
          assert.ok(position >= 0);
          return { id: openOccurrences.splice(position, 1)[0]!.start.id, terminal };
        });
        return { revision: currentRevision, lifecycle: { started, ended } };
      });
      const batch = { commandId: stimulus.commandId, fromRevision, throughRevision: revision };
      expectedExecution.push({ ...batch, transitions });
      expectedOccurrences.push({ ...batch, transitions: occurrenceTransitions });
      expectedCurrent = { ...step.publication.current, revision };
    }

    async function assertPublications(): Promise<void> {
      const identity = { definition: program.identity, processId: program.processId, processInstanceId: start.instanceId };
      const executionBatches: unknown[] = [];
      const occurrenceBatches: unknown[] = [];
      let afterRevision = 0;
      for (let pageIndex = 0; pageIndex <= expectedExecution.length; pageIndex += 1) {
        const [execution, occurrences] = await Promise.all([
          observeTemporalExecutionPublication(environment.client.workflow as unknown as TemporalExecutionPublicationClient,
            workflowId, identity, { afterRevision, limit: 2 }),
          observeTemporalFlowNodeOccurrences(environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient,
            workflowId, identity, { afterRevision, limit: 2 }),
        ]);
        assert.equal(execution.kind, ExecutionPublicationResultKind.Available);
        assert.equal(occurrences.kind, FlowNodeOccurrencePublicationResultKind.Available);
        if (execution.kind !== ExecutionPublicationResultKind.Available || occurrences.kind !== FlowNodeOccurrencePublicationResultKind.Available) {
          assert.fail("Both public histories must be available");
        }
        const { batches, current, ...executionPage } = execution.page;
        const { batches: occurrencePageBatches, currentOpen, ...occurrencePage } = occurrences.page;
        assert.deepEqual(executionPage, { ...identity, requestedAfterRevision: afterRevision,
          pageThroughRevision: execution.page.pageThroughRevision, headRevision: revision });
        assert.deepEqual(occurrencePage, executionPage);
        executionBatches.push(...batches);
        occurrenceBatches.push(...occurrencePageBatches.map(({ committedAtEpochMs, ...batch }) => {
          assert.ok(Number.isSafeInteger(committedAtEpochMs) && committedAtEpochMs > 0);
          return batch;
        }));
        if (execution.page.pageThroughRevision === revision) {
          assert.deepEqual(current, expectedCurrent);
          assert.ok(currentOpen !== null);
          assert.deepEqual(currentOpen.map(({ startedAtEpochMs, ...fact }) => {
            assert.ok(Number.isSafeInteger(startedAtEpochMs) && startedAtEpochMs > 0);
            return fact;
          }), openOccurrences.map(({ start: fact }) => fact));
          assert.deepEqual(executionBatches, expectedExecution);
          assert.deepEqual(occurrenceBatches, expectedOccurrences);
          return;
        }
        assert.equal(current, null);
        assert.equal(currentOpen, null);
        assert.ok(execution.page.pageThroughRevision > afterRevision);
        afterRevision = execution.page.pageThroughRevision;
      }
      assert.fail("Publication traversal exceeded the committed command count");
    }

    function completeExpectedEffect(result: EffectExecutionResult): void {
      const effect = projectOpenEffects(expected)[0]!;
      assert.ok(effect !== undefined);
      expectedRequests.push({ ...effect.descriptor, arguments: effect.arguments,
        idempotencyKey: effectTransportKey(projectEffectTransportMaterial(program, effect)) });
      expectedResults.push(result);
      advance(completeEffectStimulus(effect.id, result));
    }

    async function completeHuman(elementId: string, commandId: string, submittedValues: readonly VariableBinding[] = []) {
      const state = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
        state => state.openUserTasks.length === 1 && state.openUserTasks[0]!.id.elementId === elementId);
      assert.deepEqual(state, observeStableState(program, expected));
      await assertPublications();
      const stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId,
        taskId: state.openUserTasks[0]!.id, submittedValues } as const;
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stimulus), {
        kind: "semantic", commandId, outcome: CommandOutcome.Committed,
      });
      advance(stimulus);
      return stimulus;
    }

    try {
      const bundle = await loadBpmnWorkflowBundle();
      worker = await startBpmnTestWorker(environment, bundle, "business-error-original", activities);
      // The direct harness start qualifies the private profile without publishing production admission.
      const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
        args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
          eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
        taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
      });
      advance(start);
      await completeHuman("Review", "review-first");
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
        await assertPublications();
        const expectedEffect = projectOpenEffects(expected)[0]!;
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
        assert.deepEqual(actualTrace, expectedTrace);
        return;
      }
      completeExpectedEffect(businessError);
      await completeHuman("CorrectData", "correct-data", [scalar("request", "policy-review")]);
      const secondReview = await completeHuman("Review", "review-second");
      await withDeadline(pending.promise, 20_000, "repeated validation Activity pending");
      const pendingExpected = expected;
      const effect = projectOpenEffects(expected)[0]!;
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
      completeExpectedEffect(success);
      completeExpectedEffect(businessError);
      await completeHuman("ReviewPolicy", "correct-policy", [scalar("request", "approved")]);
      await completeHuman("Review", "review-third");
      completeExpectedEffect(success);
      completeExpectedEffect(success);
      await completeHuman("Finalize", "finalize");
      const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "business Error terminal result");
      assert.deepEqual(terminal.receipt.finalState, observeStableState(program, expected));
      await assertPublications();
      assert.equal(attempts.get(pendingRequest.idempotencyKey), 2);
      assert.deepEqual(requests.filter(({ idempotencyKey }) => idempotencyKey === expectedRequests[0]!.idempotencyKey),
        [expectedRequests[0], expectedRequests[0]]);
      assert.deepEqual(requests.filter(({ idempotencyKey }) => idempotencyKey === pendingRequest.idempotencyKey), [pendingRequest, pendingRequest]);
      assert.deepEqual([...new Map(requests.map(request => [request.idempotencyKey, request])).values()], expectedRequests);
      assert.equal(new Set(expectedRequests.map(({ idempotencyKey }) => idempotencyKey)).size, 5);

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
          const request = expectedRequests[scheduledEffects]!;
          requireDurableEffectActivityHistory(history, request, scheduledEffects <= 1 ? 2 : 1,
            expectedResults[scheduledEffects]!);
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
      assert.deepEqual(actualTrace, expectedTrace);
    } finally {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
      await environment.teardown();
    }
  });
}
