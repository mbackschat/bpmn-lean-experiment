import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, ScenarioStepKind, StimulusKind,
  VariableValueKind, advanceScenario, observeStableState,
} from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, EffectExecutionResult, StateObservation, VariableBinding } from "@bpmn-lean/semantic-core";
import { createInvoiceEffectActivities } from "@bpmn-lean/temporal-runner";
import {
  BpmnProcessStartResultKind, bpmnSemanticTaskQueue, bpmnTraceQueryName,
  createCachedLocalEnvironment, durableUpdateOutcomes, getTestProcessHandle, historyEvents, integerToBigInt,
  loadBpmnWorkflowBundle, processWorkflowId, productionBpmnWorkflowInitialHostInput,
  readTestProcessTerminalResult, requireDurableEffectActivityHistory,
  startBpmnProcess, submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type { EffectRequest, TemporalHistory } from "@bpmn-lean/temporal-testkit";

import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { assertUpdatesCompleteBeforeWorkflow, decodeJsonPayload } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const metadata = {
  assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
  form: { fields: [{ key: "request", type: "string" }] },
};
const scalar = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const success = (value: string): EffectExecutionResult => ({ kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", value)] });

function assertHumanMetadata(state: StateObservation, elementId: string, activation: number): void {
  assert.equal(state.openUserTasks.length, 1);
  const [task] = state.openUserTasks;
  assert.ok(task !== undefined);
  assert.equal(task.id.elementId, elementId);
  assert.equal(task.id.activation, activation);
  assert.deepEqual(task.metadata, metadata);
}

test("public metadata-bearing invoice preserves fresh occurrences, mapped arguments and replay across Worker replacement", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../../../bpmn-source/test/fixtures/business-public-delivery/invoice-rework.bpmn", import.meta.url)));
  const overlayBytes = new Uint8Array(await readFile(new URL("../../../../scenarios/mixed-task-control-flow/source-overlay.json", import.meta.url)));
  const overlay = { id: "invoice-handlers", sha256: createHash("sha256").update(overlayBytes).digest("hex"), bytes: overlayBytes };
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const compiled = await compileBpmnToSemanticProcess({ bytes, sourceId: "invoice-rework-public-recovery", expectedSha256: sourceSha256,
    semanticProfile: "cibseven-2.2.0-mixed-task-control-flow-draft", sourceOverlay: overlay,
    limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 } });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
  if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected admitted metadata-bearing rework invoice");
  const program = compiled.semanticProcess;
  assert.equal(program.identity.sourceSha256, sourceSha256);
  assert.deepEqual(program.identity.sourceOverlay, { id: overlay.id, sha256: overlay.sha256 });
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId: "invoice-rework-public-recovery", initialVariables: [scalar("request", "")] } as const;
  const workflowId = processWorkflowId(start.instanceId);
  const requests: EffectRequest[] = [];
  const pending = Promise.withResolvers<void>();
  const invoiceActivities = createInvoiceEffectActivities();
  const activities = { executeBpmnEffect: async (request: EffectRequest) => {
    const callbackIndex = requests.length;
    requests.push(structuredClone(request));
    if (callbackIndex === 1) {
      pending.resolve();
      // SERVICE-TASK-EFFECT's Worker-loss schedule must outlive its unchanged 2 s attempt.
      await delay(2_500);
    }
    return invoiceActivities.executeBpmnEffect(request);
  } };
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: start.instanceId,
    downloadDirectory: temporalCacheDirectory }), 40_000, "public invoice environment startup");
  const oracle = createBusinessTaskHostOracle(environment, program, start);
  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "invoice-human-original", activities);
    assert.deepEqual(await startBpmnProcess(environment.client.workflow, start, program, { taskQueue: bpmnSemanticTaskQueue }), {
      kind: BpmnProcessStartResultKind.Started, processInstanceId: start.instanceId,
    });
    const handle = getTestProcessHandle(environment.client.workflow, start.instanceId);
    oracle.advance(start);
    const firstWait = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => state.openUserTasks.length === 1);
    assert.deepEqual(firstWait, observeStableState(program, oracle.state));
    assertHumanMetadata(firstWait, "Review", 1);
    await oracle.assertPublications();
    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, "invoice-human-replacement", activities);
    const recoveredWait = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => state.openUserTasks.length === 1);
    assert.deepEqual(recoveredWait, firstWait);
    assertHumanMetadata(recoveredWait, "Review", 1);
    const firstReview = await oracle.completeHuman("Review", "review-empty", [scalar("request", "")]);
    oracle.completeEffect(success("rework"));
    const rework = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => state.openUserTasks.length === 1);
    assert.deepEqual(rework, observeStableState(program, oracle.state));
    assertHumanMetadata(rework, "Review", 2);

    const stale = { ...firstReview, commandId: "stale-review", submittedValues: [scalar("request", "INV-999")] };
    const refused = advanceScenario(program, oracle.state, stale);
    assert.equal(refused.kind, ScenarioStepKind.Terminal);
    if (refused.kind !== ScenarioStepKind.Terminal) assert.fail("Stale completion must be refused by the independent core");
    assert.deepEqual(refused.outcome, { kind: "semantic", outcome: CommandOutcome.Rejected });
    assert.deepEqual(refused.state, oracle.state);
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stale), {
      kind: "semantic", commandId: stale.commandId, outcome: CommandOutcome.Rejected,
    });
    oracle.trace.push(...refused.observations);
    const afterRefusal = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => state.openUserTasks.length === 1);
    assert.deepEqual(afterRefusal, rework);
    assertHumanMetadata(afterRefusal, "Review", 2);
    await oracle.assertPublications();

    const secondReview = await oracle.completeHuman("Review", "review-valid", [scalar("request", "INV-42")]);
    await withDeadline(pending.promise, 20_000, "second invoice validation pending");
    const effectId = oracle.state.effectWaits[0]?.id;
    assert.ok(effectId !== undefined);
    assert.equal(effectId.elementId, "Validate");
    assert.equal(effectId.activation, 2);
    const effectWait = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => state.openEffects.some(wait => isDeepStrictEqual(wait.id, effectId)));
    assert.deepEqual(effectWait, observeStableState(program, oracle.state));
    assert.deepEqual(requests.map(request => request.arguments), [[scalar("payload", "")], [scalar("payload", "INV-42")]]);
    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, "invoice-effect-replacement", activities);
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, secondReview), {
      kind: "semantic", commandId: secondReview.commandId, outcome: CommandOutcome.Committed,
    });
    oracle.completeEffect(success("valid"));
    // MTCF-HOST-01: compare the first settled successor without filtering for the expected route.
    const successor = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => !state.openEffects.some(wait => isDeepStrictEqual(wait.id, effectId)));
    assert.deepEqual(successor, observeStableState(program, oracle.state), "Recovered validation must use its fresh mapped arguments");
    assertHumanMetadata(successor, "Finalize", 1);
    await oracle.completeHuman("Finalize", "finalize", [scalar("request", "INV-42")]);
    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "public invoice completion");
    assert.deepEqual(terminal.receipt.definition, program.identity);
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    assert.deepEqual(terminal.receipt.finalState.openUserTasks, []);
    await oracle.assertPublications();
    assert.equal(oracle.requests.length, 2);
    assert.notEqual(oracle.requests[0]!.idempotencyKey, oracle.requests[1]!.idempotencyKey);
    assert.deepEqual(requests, [oracle.requests[0], oracle.requests[1], oracle.requests[1]]);

    const actualTrace: CanonicalObservation[] = [];
    const runs = await workflowChainRuns(environment, workflowId);
    assert.equal(runs.length, 1);
    for (const run of runs) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      const recorded = await runHandle.fetchHistory();
      const history = recorded as TemporalHistory;
      actualTrace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      const started = historyEvents(history, "workflowExecutionStartedEventAttributes");
      assert.equal(started.length, 1);
      const input = started[0]!.attributes.input as { payloads: unknown[] };
      assert.deepEqual(input.payloads.map(decodeJsonPayload), [start, program, productionBpmnWorkflowInitialHostInput()]);
      assertUpdatesCompleteBeforeWorkflow(history, 4);
      assert.deepEqual(durableUpdateOutcomes(history), new Map([
        ["review-empty", CommandOutcome.Committed], ["stale-review", CommandOutcome.Rejected],
        ["review-valid", CommandOutcome.Committed], ["finalize", CommandOutcome.Committed],
      ]));
      const scheduled = historyEvents(history, "activityTaskScheduledEventAttributes");
      assert.equal(scheduled.length, 2);
      for (const field of ["activityTaskFailedEventAttributes", "activityTaskTimedOutEventAttributes",
        "activityTaskCancelRequestedEventAttributes", "activityTaskCanceledEventAttributes", "timerStartedEventAttributes",
        "workflowExecutionSignaledEventAttributes", "startChildWorkflowExecutionInitiatedEventAttributes",
        "workflowExecutionCanceledEventAttributes", "workflowExecutionTerminatedEventAttributes"]) {
        assert.equal(historyEvents(history, field).length, 0, field);
      }
      for (const [index, schedule] of scheduled.entries()) {
        const scheduledId = integerToBigInt(schedule.event.eventId);
        const related = (field: string) => historyEvents(history, field).filter(({ attributes }) =>
          integerToBigInt(attributes.scheduledEventId) === scheduledId);
        const activityStarted = related("activityTaskStartedEventAttributes");
        const completed = related("activityTaskCompletedEventAttributes");
        assert.equal(activityStarted.length, 1);
        assert.equal(completed.length, 1);
        requireDurableEffectActivityHistory({ events: [schedule.event, activityStarted[0]!.event, completed[0]!.event] },
          oracle.requests[index]!, index === 0 ? 1 : 2, oracle.results[index]!);
      }
      await replayBpmnHistory(bundle, recorded, workflowId);
    }
    assert.deepEqual(actualTrace, oracle.trace);
  } finally {
    try {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
    } finally {
      await environment.teardown();
    }
  }
});
