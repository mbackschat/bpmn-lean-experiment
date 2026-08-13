/** Live Temporal evidence for incident-root Process cancellation and its host discriminator. */
import { isDeepStrictEqual } from "node:util";

import type {
  CancelIncidentProcessInteraction,
  CancelIncidentProcessStimulus,
  CanonicalObservation,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  initialState,
  projectEffectTransportMaterial,
  projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

import {
  bpmnCancelIncidentProcessUpdateName,
  bpmnTraceQueryName,
  isCancelledProcessReceipt,
  requireTerminalProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  CancelledProcessReceipt,
  ProcessCommandResult,
} from "@bpmn-lean/temporal-protocol";
import { ProcessCommandResultKind } from "@bpmn-lean/temporal-protocol";
import {
  submitIncidentProcessCancellationAtWorkflowId,
} from "@bpmn-lean/temporal-client";

import type {
  EffectProbeActivityRegistry,
  EffectProbeEvidence,
  EffectRequest,
  TemporalHistory,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
} from "./contracts.js";
import {
  EffectExecutionSchedule,
  EffectProbeStore,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "./contracts.js";
import {
  asArray,
  asRecord,
  decodeJsonPayload,
  durableUpdateOutcomes,
  historyEvents,
  integerToBigInt,
} from "./history-evidence-decoding.js";
import {
  effectTransportKey,
} from "./contracts.js";
import {
  requireStartStimulus,
  scenarioResultFromTrace,
} from "./runner-support.js";
import { startScenarioWorkflow } from "./runner-workflow-start.js";
import { withDeadline } from "./contracts.js";

const operationDeadlineMs = 5_000;
const workflowDeadlineMs = 10_000;

export type TemporalIncidentCancellationExecution = Readonly<{
  waitTrace: ReadonlyArray<CanonicalObservation>;
  publishedInteraction: CancelIncidentProcessInteraction;
  cancellationResult: ProcessCommandResult;
  retainedCancellationResult: ProcessCommandResult;
  postClosureResult: ProcessCommandResult;
  result: ScenarioResult;
  receipt: CancelledProcessReceipt;
  history: TemporalHistory;
  effectRequest: EffectRequest;
  effectProbeEvidence: EffectProbeEvidence;
}>;

type WorkerReplacement = Readonly<{
  stop: () => Promise<void>;
  start: () => Promise<void>;
}>;

export async function runIncidentCancellationAsTemporalScenario(
  environment: TestWorkflowEnvironment,
  registry: EffectProbeActivityRegistry,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  options: TemporalScenarioExecutionOptions,
  waitForTrace: (
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ) => Promise<ReadonlyArray<CanonicalObservation>>,
  replacement: WorkerReplacement,
): Promise<TemporalScenarioExecution> {
  if (
    options.completionDelivery !== TemporalCompletionDelivery.Ordered ||
    options.executionSchedule !== TemporalExecutionSchedule.Normal
  ) {
    throw new TypeError(
      "Incident cancellation uses one internally derived Worker-replacement schedule",
    );
  }
  const execution = await runIncidentCancellationScenario(
    environment,
    registry,
    scenario,
    semanticProcess,
    options.workflowId,
    waitForTrace,
    replacement,
  );
  return {
    waitTrace: execution.waitTrace,
    interactionEvidence: {
      openUserTasksAtWait: [],
      openTimersAtWait: [],
      openEffectsAtWait: [],
      openUserTasksAfterCompletions: [],
      completionOutcomes: [],
      completionClosureResults: [],
      duplicateCompletionOutcome: null,
      postTerminalResult: execution.postClosureResult,
    },
    result: execution.result,
    receipt: execution.receipt,
    history: execution.history,
    effectProbeEvidence: execution.effectProbeEvidence,
  };
}

export async function runIncidentCancellationScenario(
  environment: TestWorkflowEnvironment,
  registry: EffectProbeActivityRegistry,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForTrace: (
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ) => Promise<ReadonlyArray<CanonicalObservation>>,
  replacement: WorkerReplacement,
): Promise<TemporalIncidentCancellationExecution> {
  const cancellation = requireCancellationStimulus(scenario);
  const effectRequest = cancellationEffectRequest(scenario, semanticProcess);
  const store = new EffectProbeStore();
  store.requireEmpty();
  registry.register(
    effectRequest,
    (request) => store.execute(
      request,
      EffectExecutionSchedule.IncidentReportCancel,
    ),
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
    const waitTrace = await withDeadline(
      waitForTrace(handle, 5),
      workflowDeadlineMs,
      "incident cancellation state observation",
    );
    const publishedInteraction = requirePublishedCancellation(waitTrace);
    const publishedStimulus: CancelIncidentProcessStimulus = {
      kind: StimulusKind.CancelIncidentProcess,
      commandId: cancellation.commandId,
      processInstanceId: publishedInteraction.processInstanceId,
      incidentId: publishedInteraction.incidentId,
    };
    if (!isDeepStrictEqual(cancellation, publishedStimulus)) {
      throw new TypeError(
        "Cancellation scenario identity differs from the published interaction",
      );
    }

    await replacement.stop();
    const submitted = submitIncidentProcessCancellationAtWorkflowId(
      environment.client.workflow,
      handle.workflowId,
      start.instanceId,
      publishedStimulus,
    );
    await replacement.start();
    const cancellationResult = await submitted;
    requireCommittedCancellation(cancellationResult, cancellation.commandId);

    const receiptValue = requireTerminalProcessReceipt(await withDeadline(
      handle.result(),
      workflowDeadlineMs,
      "incident cancellation Workflow completion",
    ));
    if (!isCancelledProcessReceipt(receiptValue)) {
      throw new TypeError(
        "Incident cancellation completed without a cancelled Process receipt",
      );
    }
    const receipt = receiptValue;
    const retainedCancellationResult =
      await submitIncidentProcessCancellationAtWorkflowId(
        environment.client.workflow,
        handle.workflowId,
        start.instanceId,
        publishedStimulus,
      );
    const laterCancellation: CancelIncidentProcessStimulus = {
      ...publishedStimulus,
      commandId: `${publishedStimulus.commandId}-after-close`,
    };
    const postClosureResult = await submitIncidentProcessCancellationAtWorkflowId(
      environment.client.workflow,
      handle.workflowId,
      start.instanceId,
      laterCancellation,
    );
    const trace = await withDeadline(
      handle.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
      operationDeadlineMs,
      "incident cancellation final trace Query",
    );
    const historyValue = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "incident cancellation history fetch",
    );
    if (!Array.isArray(historyValue.events)) {
      throw new TypeError("Incident cancellation history has no events array");
    }
    const history = historyValue as TemporalHistory;
    requireIncidentCancellationEvidence({
      scenario,
      trace,
      receipt,
      cancellationResult,
      retainedCancellationResult,
      postClosureResult,
      history,
      effectRequest,
    });
    return {
      waitTrace,
      publishedInteraction,
      cancellationResult,
      retainedCancellationResult,
      postClosureResult,
      result: scenarioResultFromTrace(trace),
      receipt,
      history,
      effectRequest,
      effectProbeEvidence: store.evidence(),
    };
  } finally {
    registry.unregister(effectRequest.idempotencyKey);
  }
}

type CancellationEvidence = Readonly<{
  scenario: Scenario;
  trace: ReadonlyArray<CanonicalObservation>;
  receipt: CancelledProcessReceipt;
  cancellationResult: ProcessCommandResult;
  retainedCancellationResult: ProcessCommandResult;
  postClosureResult: ProcessCommandResult;
  history: TemporalHistory;
  effectRequest: EffectRequest;
}>;

export function requireIncidentCancellationEvidence(
  evidence: CancellationEvidence,
): void {
  const cancellation = requireCancellationStimulus(evidence.scenario);
  if (!isCancelledProcessReceipt(evidence.receipt)) {
    throw new TypeError("Cancellation evidence has no strict cancelled receipt");
  }
  requireCommittedCancellation(evidence.cancellationResult, cancellation.commandId);
  if (!isDeepStrictEqual(
    evidence.retainedCancellationResult,
    evidence.cancellationResult,
  )) {
    throw new TypeError("Cancellation did not retain the first committed Update result");
  }
  if (
    evidence.postClosureResult.kind !== ProcessCommandResultKind.ProcessClosed ||
    evidence.postClosureResult.commandId !== `${cancellation.commandId}-after-close` ||
    !isDeepStrictEqual(evidence.postClosureResult.receipt, evidence.receipt)
  ) {
    throw new TypeError("A later cancellation did not return the same closed Process receipt");
  }
  const finalState = evidence.trace.at(-1);
  if (
    finalState?.kind !== CanonicalObservationKind.State ||
    finalState.status !== ProcessStatus.Cancelled ||
    !isDeepStrictEqual(finalState, evidence.receipt.finalState)
  ) {
    throw new TypeError("Cancelled Query state and terminal receipt disagree");
  }
  const start = requireStartStimulus(evidence.scenario);
  if (
    start.kind !== StimulusKind.StartProcess ||
    !isDeepStrictEqual(finalState.variables, start.initialVariables)
  ) {
    throw new TypeError("Incident cancellation did not preserve Process variables exactly");
  }
  const durable = durableUpdateOutcomes(evidence.history);
  if (
    durable.size !== 1 ||
    durable.get(cancellation.commandId) !== CommandOutcome.Committed
  ) {
    throw new TypeError("Cancellation has no exact committed durable Update result");
  }
  requireCancellationUpdate(evidence.history, cancellation);
  requireTechnicalFailureActivity(evidence.history, evidence.effectRequest);
  for (const [attributesName, expected] of [
    ["workflowExecutionCompletedEventAttributes", 1],
    ["workflowExecutionCancelRequestedEventAttributes", 0],
    ["workflowExecutionCanceledEventAttributes", 0],
    ["workflowExecutionTerminatedEventAttributes", 0],
    ["workflowExecutionFailedEventAttributes", 0],
    ["requestCancelExternalWorkflowExecutionInitiatedEventAttributes", 0],
    ["externalWorkflowExecutionCancelRequestedEventAttributes", 0],
    ["childWorkflowExecutionCanceledEventAttributes", 0],
  ] as const) {
    if (historyEvents(evidence.history, attributesName).length !== expected) {
      throw new TypeError(
        `Incident cancellation history has the wrong ${attributesName} count`,
      );
    }
  }
  const workflowCompleted = historyEvents(
    evidence.history,
    "workflowExecutionCompletedEventAttributes",
  )[0];
  const result = asRecord(
    workflowCompleted?.attributes.result,
    "Workflow completed result",
  );
  const payloads = asArray(result.payloads, "Workflow completed result payloads");
  if (
    payloads.length !== 1 ||
    !isDeepStrictEqual(
      decodeJsonPayload(payloads[0], "Workflow completed receipt"),
      evidence.receipt,
    )
  ) {
    throw new TypeError("Workflow completion did not retain the cancelled receipt");
  }
}

function requireCancellationStimulus(
  scenario: Scenario,
): CancelIncidentProcessStimulus {
  const cancellations = scenario.stimuli.filter(
    (stimulus): stimulus is CancelIncidentProcessStimulus =>
      stimulus.kind === StimulusKind.CancelIncidentProcess,
  );
  if (cancellations.length !== 1 || cancellations[0] === undefined) {
    throw new TypeError("Cancellation execution requires one cancellation stimulus");
  }
  return cancellations[0];
}

export function requirePublishedCancellation(
  trace: ReadonlyArray<CanonicalObservation>,
): CancelIncidentProcessInteraction {
  const state = trace.at(-1);
  if (state?.kind !== CanonicalObservationKind.State) {
    throw new TypeError("Incident trace has no committed state");
  }
  const cancellations = state.enabledInteractions.filter(
    (interaction): interaction is CancelIncidentProcessInteraction =>
      interaction.kind === StimulusKind.CancelIncidentProcess,
  );
  if (cancellations.length !== 1 || cancellations[0] === undefined) {
    throw new TypeError("Incident state does not publish one cancellation interaction");
  }
  return cancellations[0];
}

export function cancellationEffectRequest(
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
): EffectRequest {
  const started = advanceScenario(
    semanticProcess,
    initialState,
    requireStartStimulus(scenario),
  );
  if (started.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("Cancellation harness start did not commit");
  }
  const [openEffect] = projectOpenEffects(started.state);
  if (openEffect === undefined || projectOpenEffects(started.state).length !== 1) {
    throw new TypeError("Cancellation harness requires one effect intent");
  }
  const material = projectEffectTransportMaterial(semanticProcess, openEffect);
  return {
    ...material.descriptor,
    idempotencyKey: effectTransportKey(material),
    arguments: material.arguments,
  };
}

function requireCommittedCancellation(
  result: ProcessCommandResult,
  commandId: string,
): void {
  if (
    result.kind !== ProcessCommandResultKind.Semantic ||
    result.commandId !== commandId ||
    result.outcome !== CommandOutcome.Committed
  ) {
    throw new TypeError("Incident cancellation did not commit semantically");
  }
}

function requireCancellationUpdate(
  history: TemporalHistory,
  cancellation: CancelIncidentProcessStimulus,
): void {
  const accepted = historyEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  const completed = historyEvents(
    history,
    "workflowExecutionUpdateCompletedEventAttributes",
  );
  if (accepted.length !== 1 || completed.length !== 1) {
    throw new TypeError("Incident cancellation must accept and complete one Update");
  }
  const request = asRecord(
    accepted[0]?.attributes.acceptedRequest,
    "Accepted cancellation Update request",
  );
  const input = asRecord(request.input, "Accepted cancellation Update input");
  if (input.name !== bpmnCancelIncidentProcessUpdateName) {
    throw new TypeError("History accepted a non-cancellation Update name");
  }
  const args = asRecord(input.args, "Accepted cancellation Update arguments");
  const payloads = asArray(
    args.payloads,
    "Accepted cancellation Update argument payloads",
  );
  if (
    payloads.length !== 1 ||
    !isDeepStrictEqual(
      decodeJsonPayload(payloads[0], "Accepted cancellation Update stimulus"),
      cancellation,
    )
  ) {
    throw new TypeError("History accepted a different cancellation stimulus");
  }
  const workflowCompleted = historyEvents(
    history,
    "workflowExecutionCompletedEventAttributes",
  );
  if (
    workflowCompleted.length !== 1 ||
    completed[0] === undefined ||
    workflowCompleted[0] === undefined ||
    integerToBigInt(completed[0].event.eventId) >=
      integerToBigInt(workflowCompleted[0].event.eventId)
  ) {
    throw new TypeError("Cancellation Update did not complete before the Workflow");
  }
}

function requireTechnicalFailureActivity(
  history: TemporalHistory,
  expectedRequest: EffectRequest,
): void {
  const scheduled = historyEvents(history, "activityTaskScheduledEventAttributes");
  const started = historyEvents(history, "activityTaskStartedEventAttributes");
  const completed = historyEvents(history, "activityTaskCompletedEventAttributes");
  const failed = historyEvents(history, "activityTaskFailedEventAttributes");
  if (
    scheduled.length !== 1 ||
    started.length !== 1 ||
    completed.length !== 1 ||
    failed.length !== 0
  ) {
    throw new TypeError("Cancellation history has no exact first technical-failure Activity");
  }
  const activityType = asRecord(
    scheduled[0]?.attributes.activityType,
    "Cancellation Activity type",
  );
  const retryPolicy = asRecord(
    scheduled[0]?.attributes.retryPolicy,
    "Cancellation Activity retry policy",
  );
  if (
    activityType.name !== "executeBpmnEffect" ||
    integerToBigInt(retryPolicy.maximumAttempts) !== 1n
  ) {
    throw new TypeError("Cancellation did not use the one-attempt incident Activity policy");
  }
  const input = asRecord(
    scheduled[0]?.attributes.input,
    "Cancellation Activity input",
  );
  const inputPayloads = asArray(input.payloads, "Cancellation Activity input payloads");
  const result = asRecord(
    completed[0]?.attributes.result,
    "Cancellation Activity result",
  );
  const resultPayloads = asArray(
    result.payloads,
    "Cancellation Activity result payloads",
  );
  if (
    inputPayloads.length !== 1 ||
    !isDeepStrictEqual(
      decodeJsonPayload(inputPayloads[0], "Cancellation Activity request"),
      expectedRequest,
    ) ||
    resultPayloads.length !== 1 ||
    !isDeepStrictEqual(
      decodeJsonPayload(resultPayloads[0], "Cancellation Activity result"),
      { kind: "technicalFailure" },
    )
  ) {
    throw new TypeError("Cancellation Activity history differs from the exact incident seam");
  }
}
