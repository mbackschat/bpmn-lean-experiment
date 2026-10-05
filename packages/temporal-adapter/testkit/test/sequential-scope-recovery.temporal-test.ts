import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { ActivityNotFoundError, ApplicationFailure, WorkflowFailedError } from "@temporalio/client";
import { CompleteAsyncError, Context } from "@temporalio/activity";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CommandOutcome, EffectExecutionResultKind, ScenarioStepKind, StimulusKind, VariableValueKind, advanceScenario, observeStableState, projectEffectTransportMaterial, projectOpenEffects } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, VariableBinding } from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, EffectActivityResultKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue, bpmnTraceQueryName, bpmnWorkflowContinuationV1,
  createCachedLocalEnvironment, effectTransportKey, loadBpmnWorkflowBundle, processWorkflowId,
  readTestProcessTerminalResult, requireBpmnWorkflowContinuationStateV1,
  submitUserTaskCompletion, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { EffectRequest, TemporalHistory } from "@bpmn-lean/temporal-testkit";
import { profile, source, prepareSource, sourceOverlay, parallelBodySource } from "../../../bpmn-source/test/sequential-scope-source-fixture.ts";
import { createInvoiceEffectActivities } from "../../runner/examples/invoice-effect-activities.ts";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const scalar = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });

test("private sequential MI preserves parallel body progress through Worker loss, continuation and every-Run replay", async () => {
  const xml = parallelBodySource(prepareSource(await readFile(source, "utf8")), 3, true);
  const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "invoice-mi-hosting",
    expectedSha256: undefined, semanticProfile: profile, sourceOverlay: sourceOverlay(),
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 } });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected admitted parallel invoice body");
  const program = compiled.semanticProcess;
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId: "mi-recovery", initialVariables: [{ name: "items",
      value: { kind: VariableValueKind.StringList, value: ["INV-101", "INV-102"] } }] } as const;
  const workflowId = processWorkflowId(start.instanceId);
  const success = { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "valid")] } as const;
  const invoice = createInvoiceEffectActivities();
  const requests: EffectRequest[] = [];
  const pending = Promise.withResolvers<void>();
  let obsoleteTaskToken: Uint8Array | undefined;
  const activities = {
    executeBpmnEffect: async (request: EffectRequest) => {
      requests.push(structuredClone(request));
      if (requests.length === 1) {
        obsoleteTaskToken = Context.current().info.taskToken;
        pending.resolve();
        // The retained legacy Activity policy times out this attempt; replacement must retain its semantic key.
        throw new CompleteAsyncError();
      }
      return invoice.executeBpmnEffect(request);
    },
  };
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "sequential-mi-recovery", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "MI Temporal environment startup");
  let worker: WorkerLease | undefined;
  const oracle = createBusinessTaskHostOracle(environment, program, start);
  async function assertCurrent() {
    const expected = observeStableState(program, oracle.state);
    assert.deepEqual(await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => isDeepStrictEqual(state, expected)), expected);
    await oracle.assertPublications();
  }
  async function completeHuman(elementId: string, commandId: string, submittedValues: readonly VariableBinding[] = []) {
    await assertCurrent();
    const task = oracle.state.userTaskWaits.find(wait => wait.id.elementId === elementId);
    assert.ok(task);
    const command = { kind: StimulusKind.CompleteUserTaskInstance, commandId, taskId: task.id, submittedValues } as const;
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, command),
      { kind: "semantic", commandId, outcome: CommandOutcome.Committed });
    oracle.advance(command);
    return command;
  }
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "mi-original", activities);
    // Private direct start establishes refinement without enabling public profile admission.
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    await withDeadline(pending.promise, 20_000, "first body validation pending");
    const firstEffect = projectOpenEffects(oracle.state)[0]!;
    const firstHuman = await completeHuman("Branch0", "first-review", [scalar("reviewStatus", "reviewed")]);
    assert.deepEqual(projectOpenEffects(oracle.state)[0], firstEffect);
    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, "mi-replacement", activities);
    oracle.completeEffect(success);
    await assertCurrent();
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, firstHuman),
      { kind: "semantic", commandId: firstHuman.commandId, outcome: CommandOutcome.Committed });
    assert.ok(obsoleteTaskToken);
    await assert.rejects(environment.client.connection.withDeadline(Date.now() + 5_000,
      () => environment.client.activity.complete(obsoleteTaskToken!, { kind: "success", localPatch: [] })), ActivityNotFoundError);
    await completeHuman("Branch1", "first-check");
    await completeHuman("Confirm", "first-confirm");
    const nextEffect = projectOpenEffects(oracle.state)[0]!;
    assert.notDeepEqual(nextEffect.id, firstEffect.id);
    assert.deepEqual(nextEffect.arguments, [scalar("payload", "INV-102"), scalar("status", "pending")]);
    oracle.completeEffect(success);
    await assertCurrent();
    const stale = { ...firstHuman, commandId: "stale-first-review" };
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stale),
      { kind: "semantic", commandId: stale.commandId, outcome: CommandOutcome.Rejected });
    const refused = advanceScenario(program, oracle.state, stale);
    assert.equal(refused.kind, ScenarioStepKind.Terminal);
    if (refused.kind !== ScenarioStepKind.Terminal) assert.fail("Expected stale occurrence refusal");
    assert.deepEqual(refused.state, oracle.state);
    oracle.trace.push(...refused.observations);
    await completeHuman("Branch1", "second-check");
    await completeHuman("Branch0", "second-review");
    await completeHuman("Confirm", "second-confirm");
    await completeHuman("PublishBatch", "publish");
    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "MI terminal result");
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    await oracle.assertPublications();
    assert.deepEqual(requests, [oracle.requests[0], oracle.requests[0], oracle.requests[1]]);
    const runs = await workflowChainRuns(environment, workflowId);
    assert.ok(runs.length > 1);
    const actualTrace: CanonicalObservation[] = [];
    let carriedBody = 0;
    let carriedEffect = 0;
    for (const run of runs) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      const history = await runHandle.fetchHistory();
      actualTrace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
        const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
        const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, start.instanceId);
        if ((state.sequentialScopeControllers?.length ?? 0) > 0) carriedBody++;
        if (state.effectWaits.length > 0) carriedEffect++;
      }
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.ok(carriedBody > 0);
    assert.ok(carriedEffect > 0);
    assert.deepEqual(actualTrace, oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

test("MI live controls preserve zero-item, early-completion and host-failure boundaries", async t => {
  const base = prepareSource(await readFile(source, "utf8"));
  const invoice = createInvoiceEffectActivities();
  const requests: EffectRequest[] = [];
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "mi-live-controls", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "MI control environment startup");
  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "mi-controls", {
      executeBpmnEffect: async request => {
        requests.push(structuredClone(request));
        const payload = request.arguments.find(binding => binding.name === "payload")?.value;
        if (payload?.kind === VariableValueKind.String) {
          switch (payload.value) {
            case "typed-failure": return { kind: EffectActivityResultKind.TechnicalFailure };
            case "transport-failure": throw new Error("Invoice service unavailable");
          }
        }
        return invoice.executeBpmnEffect(request);
      },
    });
    for (const mode of ["zero", "early-true", "early-set", "typed-failure", "transport-failure"] as const) {
      await t.test(mode, async () => {
        requests.length = 0;
        const early = mode === "early-true" || mode === "early-set";
        const technical = mode === "typed-failure" || mode === "transport-failure";
        const xml = early ? base.replace('camunda:elementVariable="item" />',
          'camunda:elementVariable="item"><completionCondition>${stop}</completionCondition></multiInstanceLoopCharacteristics>') : base;
        const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: `mi-${mode}`,
          expectedSha256: undefined, semanticProfile: profile, sourceOverlay: sourceOverlay(),
          limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 } });
        assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
        if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected admitted control");
        const program = compiled.semanticProcess;
        const initialVariables: VariableBinding[] = [{ name: "items", value: { kind: VariableValueKind.StringList,
          value: mode === "zero" ? [] : technical ? [mode, "INV-102"] : ["INV-101", "INV-102"] } }];
        if (early) initialVariables.push({ name: "stop", value: { kind: VariableValueKind.Boolean, value: mode === "early-true" } });
        const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
          instanceId: `mi-${mode}`, initialVariables } as const;
        const workflowId = processWorkflowId(start.instanceId);
        const oracle = createBusinessTaskHostOracle(environment, program, start);
        const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
          args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
            eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
          taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
        });
        oracle.advance(start);
        if (mode !== "zero") {
          await oracle.completeHuman("Review", "review", early
            ? [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } }] : []);
          assert.equal(oracle.state.sequentialScopeControllers?.[0]?.completed, 0);
          assert.equal(oracle.state.effectWaits.length, 1);
        }
        if (technical) {
          await assert.rejects(withDeadline(handle.result(), 20_000, "MI typed host failure"), error => {
            assert.ok(error instanceof WorkflowFailedError);
            assert.ok(error.cause instanceof ApplicationFailure);
            assert.equal(error.cause.type, mode === "typed-failure"
              ? "BPMN_EFFECT_TECHNICAL_FAILURE_UNSUPPORTED" : "BPMN_EFFECT_EXECUTION_EXHAUSTED");
            assert.equal(error.cause.cause, undefined);
            return true;
          });
          assert.equal(requests.length, mode === "typed-failure" ? 1 : 2);
          const effect = projectOpenEffects(oracle.state)[0]!;
          const expected = { ...effect.descriptor, arguments: effect.arguments,
            idempotencyKey: effectTransportKey(projectEffectTransportMaterial(program, effect)) };
          assert.deepEqual(requests, Array.from({ length: mode === "typed-failure" ? 1 : 2 }, () => expected));
          assert.equal(oracle.state.sequentialScopeControllers?.[0]?.completed, 0);
        } else {
          if (early) {
            oracle.completeEffect({ kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "valid")] });
            await oracle.completeHuman("Confirm", "confirm");
          }
          await oracle.completeHuman("PublishBatch", "publish");
          const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "MI control completion");
          assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
          assert.equal(requests.length, mode === "zero" ? 0 : 1);
          assert.deepEqual(requests, oracle.requests);
          assert.equal(oracle.state.sequentialScopeControllers?.length ?? 0, 0);
          assert.equal(oracle.state.variables.scopes.length, 0);
        }
        await oracle.assertPublications();
        const trace: CanonicalObservation[] = [];
        let completedEffects = 0;
        let failedEffects = 0;
        for (const run of await workflowChainRuns(environment, workflowId)) {
          const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
          const history = await runHandle.fetchHistory();
          trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
          completedEffects += historyEvents(history as TemporalHistory, "activityTaskCompletedEventAttributes").length;
          failedEffects += historyEvents(history as TemporalHistory, "activityTaskFailedEventAttributes").length;
          await replayBpmnHistory(bundle, history, workflowId);
        }
        assert.deepEqual(trace, oracle.trace);
        assert.equal(failedEffects, mode === "transport-failure" ? 1 : 0);
        assert.equal(completedEffects, mode === "zero" || mode === "transport-failure" ? 0 : 1);
      });
    }
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});
