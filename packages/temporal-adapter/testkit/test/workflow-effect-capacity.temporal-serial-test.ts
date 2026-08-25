import assert from "node:assert/strict";
import test from "node:test";

import {
  EffectExecutionResultKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";
import {
  BpmnProcessStartResultKind,
  EffectProbeActivityRegistry,
  WorkflowChainBudgetKind,
  bpmnSemanticTaskQueue,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  startBpmnProcess,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  EffectActivityImplementationResult,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  serviceTaskEffectInput,
  serviceTaskEffectRequest,
} from "./service-task-effect-fixture.ts";
import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import { historyEvents } from "./temporal-history-facts.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const operationDeadlineMs = 20_000;
const resultLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.EffectActivityResultBytes,
);

test("an oversized Activity result fails before semantic exposure and replays", async () => {
  const input = serviceTaskEffectInput();
  const start = input.scenario.stimuli[0];
  if (start?.kind !== StimulusKind.StartProcess) {
    assert.fail("Service Task scenario has no Process start");
  }
  const oversized = resultAtBytes(resultLimit + 1);
  const registry = new EffectProbeActivityRegistry();
  const request = serviceTaskEffectRequest(input);
  let invocations = 0;
  registry.register(request, async () => {
    invocations += 1;
    return oversized;
  });
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-effect-capacity",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Workflow effect-capacity Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-effect-capacity",
      registry.activities,
    );
    const started = await startBpmnProcess(
      environment.client.workflow,
      start,
      input.semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    );
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      assert.fail(`effect-capacity start was rejected: ${started.failure.code}`);
    }
    const handle = getTestProcessHandle(
      environment.client.workflow,
      started.processInstanceId,
    );
    await assert.rejects(
      withDeadline(
        handle.result(),
        operationDeadlineMs,
        "oversized effect-result capacity failure",
      ),
      (error: unknown) => {
        const failure = applicationFailure(error);
        assert.equal(failure.type, bpmnWorkflowChainCapacityExhaustedFailureType);
        assert.equal(failure.nonRetryable, true);
        assert.deepEqual(failure.details, [{
          budget: WorkflowChainBudgetKind.EffectActivityResultBytes,
          configuredBound: resultLimit,
          observedValue: resultLimit + 1,
          processInstanceId: start.instanceId,
          publicRevision: 3,
          runOrdinal: 1,
        }]);
        return true;
      },
    );
    assert.equal(invocations, 1);

    const history = await handle.fetchHistory();
    assert.equal(
      historyEvents(
        history as TemporalHistory,
        "activityTaskCompletedEventAttributes",
      ).length,
      1,
    );
    assert.equal(
      historyEvents(
        history as TemporalHistory,
        "workflowExecutionFailedEventAttributes",
      ).length,
      1,
    );
    await replayBpmnHistory(
      bundle,
      history,
      processWorkflowId(start.instanceId),
    );
  } finally {
    registry.unregister(request.idempotencyKey);
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

function resultAtBytes(target: number): EffectActivityImplementationResult {
  const build = (value: string): EffectActivityImplementationResult => ({
    kind: EffectExecutionResultKind.Success,
    localPatch: [{
      name: "result",
      value: { kind: VariableValueKind.String, value },
    }],
  });
  const overhead = workflowChainCanonicalUtf8ByteLength(build(""));
  const result = build("x".repeat(target - overhead));
  assert.equal(workflowChainCanonicalUtf8ByteLength(result), target);
  return result;
}

function applicationFailure(error: unknown): ApplicationFailure {
  let current = error;
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof ApplicationFailure) {
      return current;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  throw new TypeError("Workflow failure has no ApplicationFailure cause");
}
