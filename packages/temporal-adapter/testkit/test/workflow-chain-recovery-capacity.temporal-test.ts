import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
} from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";
import {
  BpmnProcessStartResultKind,
  BpmnWorkflowChainCapacityExhausted,
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnSemanticTaskQueue,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  bpmnWorkflowChainCommandRecoveryQueryName,
  bpmnWorkflowChainProtocolV1,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  startBpmnProcess,
  submitUserTaskCompletion,
  workflowChainProductionLimit,
  workflowCommandStimulusSha256,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalHistory,
  WorkflowChainCapacityFailureDetails,
} from "@bpmn-lean/temporal-testkit";

import {
  compileExecutionInput,
  loadJson,
  requiredAt,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import { historyEvents } from "./temporal-history-facts.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/user-task-cycle/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/user-task-cycle/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 20_000;
const recoveryEntryLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
);

test("a ledger-filling command resolves before the retained Run reports capacity", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const start = requiredStart(scenario);
  const workflowId = processWorkflowId(start.instanceId);
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-recovery-capacity",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Workflow recovery-capacity Temporal environment startup",
  );
  let worker: WorkerLease | undefined;

  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "workflow-recovery-capacity",
    );
    const started = await startBpmnProcess(
      environment.client.workflow,
      start,
      semanticProcess,
      { taskQueue: bpmnSemanticTaskQueue },
    );
    if (started.kind !== BpmnProcessStartResultKind.Started) {
      assert.fail(`capacity Workflow start was rejected: ${started.failure.code}`);
    }
    const handle = getTestProcessHandle(
      environment.client.workflow,
      started.processInstanceId,
    );
    await waitForOpenUserTaskIds(handle, ["Review"]);

    let fillingCommand = completion(start.instanceId, recoveryEntryLimit);
    for (let activation = 1; activation <= recoveryEntryLimit; activation += 1) {
      const stimulus = completion(start.instanceId, activation);
      const result = await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        stimulus,
      );
      assert.deepEqual(result, {
        kind: "semantic",
        commandId: stimulus.commandId,
        outcome: CommandOutcome.Committed,
      });
      fillingCommand = stimulus;
    }

    const expectedFailure = {
      budget: WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
      configuredBound: recoveryEntryLimit,
      observedValue: recoveryEntryLimit,
      processInstanceId: start.instanceId,
      publicRevision: 4 + 4 * recoveryEntryLimit,
      runOrdinal: 1,
    } as const;
    await assert.rejects(
      withDeadline(
        handle.result(),
        operationDeadlineMs,
        "Workflow recovery-capacity failure",
      ),
      (error: unknown) => {
        const failure = applicationFailure(error);
        assert.equal(failure.type, bpmnWorkflowChainCapacityExhaustedFailureType);
        assert.equal(failure.nonRetryable, true);
        assert.deepEqual(failure.details, [expectedFailure]);
        assertNoPrivateCapacityData(failure.details);
        return true;
      },
    );

    assert.deepEqual(
      await queryRecovery(handle, start.instanceId, fillingCommand),
      {
        ...recoveryRequest(start.instanceId, fillingCommand),
        kind: WorkflowChainCommandRecoveryResponseKind.Resolved,
        outcome: CommandOutcome.Committed,
      },
    );
    const conflicting = {
      ...fillingCommand,
      submittedValues: [{
        name: "route",
        value: { kind: VariableValueKind.String, value: "rework" },
      }],
    } as const;
    assert.deepEqual(
      await queryRecovery(handle, start.instanceId, conflicting),
      {
        ...recoveryRequest(start.instanceId, conflicting),
        kind: WorkflowChainCommandRecoveryResponseKind.IdentityConflict,
      },
    );
    const unseen = completion(start.instanceId, recoveryEntryLimit + 1);
    const capacityResponse = await queryRecovery(handle, start.instanceId, unseen);
    assert.deepEqual(capacityResponse, {
      ...recoveryRequest(start.instanceId, unseen),
      kind: WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry,
      failure: expectedFailure,
    });
    assertNoPrivateCapacityData(capacityResponse);
    await assert.rejects(
      submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        unseen,
      ),
      (error: unknown) => {
        assert.equal(error instanceof BpmnWorkflowChainCapacityExhausted, true);
        assert.deepEqual(
          (error as BpmnWorkflowChainCapacityExhausted).details,
          expectedFailure,
        );
        return true;
      },
    );

    const executions = [];
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId === workflowId) {
        executions.push(execution);
      }
    }
    assert.equal(executions.length, 1);
    const history = await handle.fetchHistory();
    const typedHistory = history as TemporalHistory;
    assert.equal(
      historyEvents(typedHistory, "workflowExecutionFailedEventAttributes").length,
      1,
    );
    assert.equal(
      historyEvents(
        typedHistory,
        "workflowExecutionContinuedAsNewEventAttributes",
      ).length,
      0,
    );
    await replayBpmnHistory(bundle, history, workflowId);
  } finally {
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
});

function requiredStart(scenario: Scenario) {
  const stimulus = requiredAt(scenario.stimuli, 0, "cycle stimuli");
  if (stimulus.kind !== StimulusKind.StartProcess) {
    throw new TypeError("cycle scenario has no Process start");
  }
  return stimulus;
}

function completion(
  processInstanceId: string,
  activation: number,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `capacity-${activation}`,
    taskId: {
      processInstanceId,
      elementId: "Review",
      activation,
    },
    submittedValues: [{
      name: "route",
      value: { kind: VariableValueKind.String, value: "repeat" },
    }],
  };
}

function recoveryRequest(
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
) {
  return {
    protocol: bpmnWorkflowChainProtocolV1,
    processInstanceId,
    commandId: stimulus.commandId,
    stimulusSha256: workflowCommandStimulusSha256(stimulus),
  } as const;
}

async function queryRecovery(
  handle: ReturnType<typeof getTestProcessHandle>,
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
) {
  return handle.query(
    bpmnWorkflowChainCommandRecoveryQueryName,
    recoveryRequest(processInstanceId, stimulus),
  );
}

function applicationFailure(error: unknown): ApplicationFailure {
  let current = error;
  while (current instanceof Error) {
    if (current instanceof ApplicationFailure) {
      return current;
    }
    current = current.cause;
  }
  throw new TypeError("Workflow failure has no ApplicationFailure cause");
}

function assertNoPrivateCapacityData(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoPrivateCapacityData(item);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    assert.equal(
      ["runId", "firstExecutionRunId", "program", "state", "command"].includes(key),
      false,
      `capacity data exposed ${key}`,
    );
    assertNoPrivateCapacityData(item);
  }
}
