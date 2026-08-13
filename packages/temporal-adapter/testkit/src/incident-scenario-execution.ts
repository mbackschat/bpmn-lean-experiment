/** Live Temporal execution for the single Service Task incident report/retry schedule. */
import type {
  CanonicalObservation,
  CommandOutcome,
  RetryIncidentStimulus,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  TestWorkflowEnvironment,
} from "@temporalio/testing";
import type {
  WorkflowHandle,
} from "@temporalio/client";
import {
  ApplicationFailure,
  WorkflowFailedError,
  WorkflowUpdateStage,
} from "@temporalio/client";

import {
  bpmnTraceQueryName,
  bpmnRetryEffectIncidentUpdateName,
  contentBoundUpdateId,
  requireCompletedProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import { submitIncidentRetryAtWorkflowId } from "@bpmn-lean/temporal-client";

import type {
  BpmnProcessWorkflow,
  TemporalHistory,
  TemporalIncidentRetryFailureExecution,
  TemporalIncidentRetryRaceExecution,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
} from "./contracts.js";
import {
  EffectProbeActivityRegistry,
  EffectProbeStore,
} from "./effect-probe.js";
import type {
  PreparedEffectExecution,
} from "./runner-support.js";
import {
  requireStartStimulus,
  scenarioResultFromTrace,
} from "./runner-support.js";
import { reconcileHarnessTraceEvidence } from "./harness-evidence.js";
import {
  startScenarioWorkflow,
} from "./runner-workflow-start.js";
import { withDeadline } from "./contracts.js";

const operationDeadlineMs = 5_000;
const workflowDeadlineMs = 10_000;

export async function runIncidentRetryRace(
  environment: TestWorkflowEnvironment,
  registry: EffectProbeActivityRegistry,
  effectExecution: PreparedEffectExecution,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForTrace: (
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ) => Promise<ReadonlyArray<CanonicalObservation>>,
): Promise<TemporalIncidentRetryRaceExecution> {
  const first = requireRetryStimulus(scenario);
  const second: RetryIncidentStimulus = {
    ...first,
    commandId: `${first.commandId}-concurrent`,
  };
  const store = new EffectProbeStore();
  store.requireEmpty();
  registry.register(
    effectExecution.request,
    (request) => store.execute(request, effectExecution.schedule),
  );
  try {
    const start = requireStartStimulus(scenario);
    const handle = await startScenarioWorkflow(
      environment.client.workflow,
      start,
      semanticProcess,
      workflowId,
      operationDeadlineMs,
    );
    await withDeadline(
      waitForTrace(handle, 5),
      workflowDeadlineMs,
      "incident retry race state observation",
    );
    const updateHandles = await Promise.all(
      [first, second].map((stimulus) =>
        handle.startUpdate<CommandOutcome, [RetryIncidentStimulus]>(
          bpmnRetryEffectIncidentUpdateName,
          {
            args: [stimulus],
            updateId: contentBoundUpdateId(stimulus),
            waitForStage: WorkflowUpdateStage.ACCEPTED,
          },
        )
      ),
    );
    const outcomes = await Promise.all(
      updateHandles.map((updateHandle) =>
        withDeadline(
          updateHandle.result(),
          operationDeadlineMs,
          `incident race Update ${updateHandle.updateId}`,
        )
      ),
    );
    const receipt = requireCompletedProcessReceipt(
      await withDeadline(
        handle.result(),
        workflowDeadlineMs,
        "incident retry race completion",
      ),
    );
    const trace = await withDeadline(
      handle.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
      operationDeadlineMs,
      "incident retry race trace",
    );
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "incident retry race history",
    );
    if (!Array.isArray(history.events)) {
      throw new TypeError("Incident retry race history has no events array");
    }
    reconcileHarnessTraceEvidence(trace, receipt, history as TemporalHistory);
    return { outcomes, trace, receipt, history: history as TemporalHistory };
  } finally {
    registry.unregister(effectExecution.request.idempotencyKey);
  }
}

export async function runIncidentRetryFailure(
  environment: TestWorkflowEnvironment,
  registry: EffectProbeActivityRegistry,
  effectExecution: PreparedEffectExecution,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForTrace: (
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ) => Promise<ReadonlyArray<CanonicalObservation>>,
): Promise<TemporalIncidentRetryFailureExecution> {
  const retry = requireRetryStimulus(scenario);
  const store = new EffectProbeStore();
  store.requireEmpty();
  registry.register(
    effectExecution.request,
    (request) => store.execute(request, effectExecution.schedule),
  );
  try {
    const start = requireStartStimulus(scenario);
    const handle = await startScenarioWorkflow(
      environment.client.workflow,
      start,
      semanticProcess,
      workflowId,
      operationDeadlineMs,
    );
    await withDeadline(
      waitForTrace(handle, 5),
      workflowDeadlineMs,
      "incident failure state observation",
    );
    const retryResult = await submitIncidentRetryAtWorkflowId(
      environment.client.workflow,
      handle.workflowId,
      start.instanceId,
      retry,
    );
    if (retryResult.kind !== "semantic" || retryResult.outcome !== "committed") {
      throw new TypeError("Incident failure retry did not commit semantically");
    }
    const lastCommittedTrace = await withDeadline(
      waitForTrace(handle, 7),
      workflowDeadlineMs,
      "retried effect state observation",
    );
    const failureType = await requireRetryFailureType(handle);
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "incident retry failure history",
    );
    if (!Array.isArray(history.events)) {
      throw new TypeError("Incident retry failure history has no events array");
    }
    reconcileHarnessTraceEvidence(
      lastCommittedTrace,
      null,
      history as TemporalHistory,
    );
    return {
      failureType,
      lastCommittedTrace,
      history: history as TemporalHistory,
      effectProbeEvidence: store.evidence(),
    };
  } finally {
    registry.unregister(effectExecution.request.idempotencyKey);
  }
}

export async function runIncidentScenario(
  environment: TestWorkflowEnvironment,
  registry: EffectProbeActivityRegistry,
  effectExecution: PreparedEffectExecution,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  options: TemporalScenarioExecutionOptions,
  waitForTrace: (
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ) => Promise<ReadonlyArray<CanonicalObservation>>,
  restartAfterCommittedIncident: () => Promise<void>,
): Promise<TemporalScenarioExecution> {
  const retry = requireRetryStimulus(scenario);
  const store = new EffectProbeStore();
  store.requireEmpty();
  registry.register(
    effectExecution.request,
    (request) => store.execute(request, effectExecution.schedule),
  );
  try {
    const start = requireStartStimulus(scenario);
    const handle = await startScenarioWorkflow(
      environment.client.workflow,
      start,
      semanticProcess,
      options.workflowId,
      operationDeadlineMs,
    );
    const waitTrace = await withDeadline(
      waitForTrace(handle, 5),
      workflowDeadlineMs,
      "incident state observation",
    );
    await restartAfterCommittedIncident();
    const retryResult = await submitIncidentRetryAtWorkflowId(
      environment.client.workflow,
      handle.workflowId,
      start.instanceId,
      retry,
    );
    if (retryResult.kind !== "semantic" || retryResult.outcome !== "committed") {
      throw new TypeError("Incident retry did not commit semantically");
    }
    const receipt = requireCompletedProcessReceipt(
      await withDeadline(
        handle.result(),
        workflowDeadlineMs,
        "incident retry Workflow completion",
      ),
    );
    const retainedRetryResult = await submitIncidentRetryAtWorkflowId(
      environment.client.workflow,
      handle.workflowId,
      start.instanceId,
      retry,
    );
    if (
      retainedRetryResult.kind !== "semantic" ||
      retainedRetryResult.outcome !== "committed"
    ) {
      throw new TypeError("Exact incident retry did not retain its committed result");
    }
    const trace = await withDeadline(
      handle.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
      operationDeadlineMs,
      "incident final trace Query",
    );
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "incident history fetch",
    );
    if (!Array.isArray(history.events)) {
      throw new TypeError("Incident history did not contain an events array");
    }
    reconcileHarnessTraceEvidence(trace, receipt, history as TemporalHistory);
    return {
      waitTrace,
      interactionEvidence: {
        openUserTasksAtWait: [],
        openTimersAtWait: [],
        openEffectsAtWait: [],
        openUserTasksAfterCompletions: [],
        completionOutcomes: [],
        duplicateCompletionOutcome: null,
        postTerminalResult: null,
      },
      result: scenarioResultFromTrace(trace),
      receipt,
      history: history as TemporalHistory,
      effectProbeEvidence: store.evidence(),
    };
  } finally {
    registry.unregister(effectExecution.request.idempotencyKey);
  }
}

function requireRetryStimulus(scenario: Scenario): RetryIncidentStimulus {
  const retry = scenario.stimuli.find(
    (stimulus): stimulus is RetryIncidentStimulus =>
      stimulus.kind === StimulusKind.RetryIncident,
  );
  if (retry === undefined) {
    throw new TypeError("Incident schedule requires one retry stimulus");
  }
  return retry;
}

async function requireRetryFailureType(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<"BPMN_EFFECT_INCIDENT_RETRY_EXHAUSTED"> {
  try {
    await withDeadline(
      handle.result(),
      workflowDeadlineMs,
      "incident retry exhausted Workflow failure",
    );
    throw new Error("Incident retry failure Workflow unexpectedly completed");
  } catch (error: unknown) {
    if (
      error instanceof WorkflowFailedError &&
      error.cause instanceof ApplicationFailure &&
      error.cause.type === "BPMN_EFFECT_INCIDENT_RETRY_EXHAUSTED"
    ) {
      return error.cause.type;
    }
    throw error;
  }
}
