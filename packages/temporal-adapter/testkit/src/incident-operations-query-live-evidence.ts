/** Live Temporal evidence that incident operations observe current committed state, never trace history. */
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  OpenEffectIncident,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowHandle } from "@temporalio/client";

import {
  ProcessCommandResultKind,
  bpmnIncidentOperationsQueryName,
  bpmnTraceQueryName,
  isCancelledProcessReceipt,
  requireCompletedProcessReceipt,
  requireTemporalIncidentOperationsSnapshot,
  requireTerminalProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  ProcessCommandResult,
  TemporalIncidentOperationsSnapshot,
  TerminalProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import {
  TemporalProcessOperationsObservationStatus,
  observeTemporalProcessIncidents,
  submitTemporalIncidentOperation,
} from "@bpmn-lean/temporal-client";
import type {
  TemporalProcessOperationsClient,
  TemporalProcessOperationsObservationResult,
} from "@bpmn-lean/temporal-client";
import { loadBpmnWorkflowBundle } from "@bpmn-lean/temporal-worker";

import {
  EffectExecutionSchedule,
  EffectProbeActivityRegistry,
  EffectProbeStore,
} from "./effect-probe.js";
import type { TemporalHistory } from "./contracts.js";
import { withDeadline } from "./contracts.js";
import { createCachedLocalEnvironment } from "./ephemeral-server.js";
import { cancellationEffectRequest } from "./incident-cancellation-live-evidence.js";
import { readTestProcessTerminalResult } from "./private-process-handle.js";
import { requireStartStimulus } from "./runner-support.js";
import { startScenarioWorkflow } from "./runner-workflow-start.js";
import { TemporalWorkerHost } from "./temporal-worker-host.js";

const operationDeadlineMs = 5_000;
const environmentDeadlineMs = 40_000;
const workflowDeadlineMs = 10_000;

export type IncidentOperationsQueryEvidenceInput = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
}>;

export type IncidentOperationsQueryLiveEvidence = Readonly<{
  openSnapshot: Exclude<TemporalIncidentOperationsSnapshot, null>;
  openClassification: TemporalProcessOperationsObservationResult;
  actionResult: ProcessCommandResult;
  currentSnapshot: Exclude<TemporalIncidentOperationsSnapshot, null>;
  currentClassification: TemporalProcessOperationsObservationResult;
  terminalSnapshot: Exclude<TemporalIncidentOperationsSnapshot, null>;
  terminalClassification: TemporalProcessOperationsObservationResult;
  terminalReceipt: TerminalProcessReceipt;
  retainedTrace: ReadonlyArray<CanonicalObservation>;
  traceDerivedCurrentIncidentMutation: ReadonlyArray<OpenEffectIncident>;
  queryHistoryEventCounts: readonly [before: number, after: number];
  history: TemporalHistory;
}>;

export type IncidentOperationsQueryLiveSuiteEvidence = Readonly<{
  retry: IncidentOperationsQueryLiveEvidence;
  cancellation: IncidentOperationsQueryLiveEvidence;
}>;

/** Runs both graduated M4 profiles through the production Workflow bundle and replays both histories. */
export async function runIncidentOperationsQueryLiveSuite(
  downloadDirectory: string,
  retryInput: IncidentOperationsQueryEvidenceInput,
  cancellationInput: IncidentOperationsQueryEvidenceInput,
): Promise<IncidentOperationsQueryLiveSuiteEvidence> {
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-incident-operations-query-evidence",
      downloadDirectory,
    }),
    environmentDeadlineMs,
    "incident operations Temporal environment startup",
  );
  const registry = new EffectProbeActivityRegistry();
  let workerHost: TemporalWorkerHost | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    workerHost = await TemporalWorkerHost.create(environment, registry, bundle);
    const retry = await runRetryEvidence(
      environment,
      registry,
      retryInput,
      "incident-operations-query-retry",
    );
    const cancellation = await runCancellationEvidence(
      environment,
      registry,
      cancellationInput,
      "incident-operations-query-cancellation",
    );
    await workerHost.replayHistories([
      { history: retry.history, workflowId: "incident-operations-query-retry" },
      {
        history: cancellation.history,
        workflowId: "incident-operations-query-cancellation",
      },
    ]);
    return { retry, cancellation };
  } finally {
    if (workerHost !== undefined) {
      await workerHost.shutdown();
    }
    await withDeadline(
      environment.teardown(),
      workflowDeadlineMs,
      "incident operations Temporal environment teardown",
    );
  }
}

async function runRetryEvidence(
  environment: TestWorkflowEnvironment,
  registry: EffectProbeActivityRegistry,
  input: IncidentOperationsQueryEvidenceInput,
  workflowId: string,
): Promise<IncidentOperationsQueryLiveEvidence> {
  const effectRequest = cancellationEffectRequest(
    input.scenario,
    input.semanticProcess,
  );
  const store = new EffectProbeStore();
  const completionRelease = deferred();
  registry.register(effectRequest, async (request) => {
    const invocation = store.evidence().invocations;
    if (invocation === 0) {
      return store.execute(
        request,
        EffectExecutionSchedule.IncidentReportRetrySuccess,
      );
    }
    await completionRelease.promise;
    return store.execute(
      request,
      EffectExecutionSchedule.IncidentReportRetrySuccess,
    );
  });
  try {
    const handle = await startEvidenceWorkflow(
      environment,
      input,
      workflowId,
    );
    const openSnapshot = await waitForSnapshot(
      handle,
      (snapshot) => snapshot?.status === ProcessStatus.Running &&
        snapshot.incidents.length === 1,
    );
    requireExpectedOpenSnapshot(input, openSnapshot, false);
    const historyBefore = await historyEventCount(handle);
    const openClassification = await observe(
      environment,
      workflowId,
      requireStartStimulus(input.scenario).instanceId,
    );
    requireObservedIncidents(openClassification, openSnapshot.incidents);
    await queryTrace(handle);
    const historyAfter = await historyEventCount(handle);

    const retry = input.scenario.stimuli.find(
      (stimulus) => stimulus.kind === StimulusKind.RetryIncident,
    );
    if (retry?.kind !== StimulusKind.RetryIncident) {
      throw new TypeError("Retry evidence has no exact retry stimulus");
    }
    const actionResult = await submitTemporalIncidentOperation(
      operationsClient(environment),
      workflowId,
      retry.incidentId.effectId.processInstanceId,
      retry,
    );
    requireCommittedAction(actionResult, retry.commandId);
    const currentSnapshot = await waitForSnapshot(
      handle,
      (snapshot) => snapshot?.status === ProcessStatus.Running &&
        snapshot.incidents.length === 0,
    );
    const currentClassification = await observe(
      environment,
      workflowId,
      retry.incidentId.effectId.processInstanceId,
    );
    requireObservedIncidents(currentClassification, []);
    const retainedTrace = await queryTrace(handle);
    const mutation = traceDerivedCurrentIncidentMutation(retainedTrace);
    if (mutation.length === 0 || currentSnapshot.incidents.length !== 0) {
      throw new TypeError(
        "Diagnostic trace mutation did not differ from the current incident Query",
      );
    }

    completionRelease.resolve();
    const terminalReceipt = requireCompletedProcessReceipt((await withDeadline(
      readTestProcessTerminalResult(handle),
      workflowDeadlineMs,
      "incident operations retry Workflow terminal result",
    )).receipt);
    const terminalSnapshot = await querySnapshot(handle);
    if (
      terminalSnapshot === null ||
      terminalSnapshot.status !== ProcessStatus.Completed ||
      terminalSnapshot.incidents.length !== 0
    ) {
      throw new TypeError("Retry Query did not expose exact completed state");
    }
    const terminalClassification = await observe(
      environment,
      workflowId,
      retry.incidentId.effectId.processInstanceId,
    );
    requireClosed(terminalClassification);
    return {
      openSnapshot,
      openClassification,
      actionResult,
      currentSnapshot,
      currentClassification,
      terminalSnapshot,
      terminalClassification,
      terminalReceipt,
      retainedTrace,
      traceDerivedCurrentIncidentMutation: mutation,
      queryHistoryEventCounts: [historyBefore, historyAfter],
      history: await fetchHistory(handle),
    };
  } finally {
    completionRelease.resolve();
    registry.unregister(effectRequest.idempotencyKey);
  }
}

async function runCancellationEvidence(
  environment: TestWorkflowEnvironment,
  registry: EffectProbeActivityRegistry,
  input: IncidentOperationsQueryEvidenceInput,
  workflowId: string,
): Promise<IncidentOperationsQueryLiveEvidence> {
  const effectRequest = cancellationEffectRequest(
    input.scenario,
    input.semanticProcess,
  );
  const store = new EffectProbeStore();
  registry.register(
    effectRequest,
    (request) => store.execute(request, EffectExecutionSchedule.IncidentReportCancel),
  );
  try {
    const handle = await startEvidenceWorkflow(
      environment,
      input,
      workflowId,
    );
    const openSnapshot = await waitForSnapshot(
      handle,
      (snapshot) => snapshot?.status === ProcessStatus.Running &&
        snapshot.incidents.length === 1,
    );
    requireExpectedOpenSnapshot(input, openSnapshot, true);
    const historyBefore = await historyEventCount(handle);
    const openClassification = await observe(
      environment,
      workflowId,
      requireStartStimulus(input.scenario).instanceId,
    );
    requireObservedIncidents(openClassification, openSnapshot.incidents);
    await queryTrace(handle);
    const historyAfter = await historyEventCount(handle);

    const cancellation = input.scenario.stimuli.find(
      (stimulus) => stimulus.kind === StimulusKind.CancelIncidentProcess,
    );
    if (cancellation?.kind !== StimulusKind.CancelIncidentProcess) {
      throw new TypeError("Cancellation evidence has no exact cancellation stimulus");
    }
    const actionResult = await submitTemporalIncidentOperation(
      operationsClient(environment),
      workflowId,
      cancellation.processInstanceId,
      cancellation,
    );
    requireCommittedAction(actionResult, cancellation.commandId);
    const terminalReceipt = requireTerminalProcessReceipt((await withDeadline(
      readTestProcessTerminalResult(handle),
      workflowDeadlineMs,
      "incident operations cancellation Workflow terminal result",
    )).receipt);
    if (!isCancelledProcessReceipt(terminalReceipt)) {
      throw new TypeError("Cancellation Query evidence has no cancelled receipt");
    }
    const terminalSnapshot = await querySnapshot(handle);
    if (
      terminalSnapshot === null ||
      terminalSnapshot.status !== ProcessStatus.Cancelled ||
      terminalSnapshot.incidents.length !== 0
    ) {
      throw new TypeError("Cancellation Query did not expose exact cancelled state");
    }
    const terminalClassification = await observe(
      environment,
      workflowId,
      cancellation.processInstanceId,
    );
    requireClosed(terminalClassification);
    const retainedTrace = await queryTrace(handle);
    return {
      openSnapshot,
      openClassification,
      actionResult,
      currentSnapshot: terminalSnapshot,
      currentClassification: terminalClassification,
      terminalSnapshot,
      terminalClassification,
      terminalReceipt,
      retainedTrace,
      traceDerivedCurrentIncidentMutation:
        traceDerivedCurrentIncidentMutation(retainedTrace),
      queryHistoryEventCounts: [historyBefore, historyAfter],
      history: await fetchHistory(handle),
    };
  } finally {
    registry.unregister(effectRequest.idempotencyKey);
  }
}

async function startEvidenceWorkflow(
  environment: TestWorkflowEnvironment,
  input: IncidentOperationsQueryEvidenceInput,
  workflowId: string,
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
  return startScenarioWorkflow(
    environment.client.workflow,
    requireStartStimulus(input.scenario),
    input.semanticProcess,
    workflowId,
    operationDeadlineMs,
  );
}

async function waitForSnapshot(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  predicate: (snapshot: TemporalIncidentOperationsSnapshot) => boolean,
): Promise<Exclude<TemporalIncidentOperationsSnapshot, null>> {
  let latestError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const snapshot = await querySnapshot(handle);
      if (snapshot !== null && predicate(snapshot)) {
        return snapshot;
      }
    } catch (error: unknown) {
      latestError = error;
    }
    await delay(25);
  }
  throw latestError instanceof Error
    ? latestError
    : new Error("Workflow did not expose the expected current incident snapshot");
}

async function querySnapshot(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<TemporalIncidentOperationsSnapshot> {
  return requireTemporalIncidentOperationsSnapshot(await withDeadline(
    handle.query<unknown>(bpmnIncidentOperationsQueryName),
    operationDeadlineMs,
    "dedicated incident operations Query",
  ));
}

async function queryTrace(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<ReadonlyArray<CanonicalObservation>> {
  return withDeadline(
    handle.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
    operationDeadlineMs,
    "diagnostic trace Query",
  );
}

async function observe(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  processInstanceId: string,
): Promise<TemporalProcessOperationsObservationResult> {
  return observeTemporalProcessIncidents(
    operationsClient(environment),
    workflowId,
    processInstanceId,
  );
}

function operationsClient(
  environment: TestWorkflowEnvironment,
): TemporalProcessOperationsClient {
  return environment.client.workflow as unknown as TemporalProcessOperationsClient;
}

function requireExpectedOpenSnapshot(
  input: IncidentOperationsQueryEvidenceInput,
  snapshot: Exclude<TemporalIncidentOperationsSnapshot, null>,
  expectsCancellation: boolean,
): void {
  const expected = runScenario(
    { ...input.scenario, stimuli: input.scenario.stimuli.slice(0, 2) },
    input.semanticProcess,
  ).trace.at(-1);
  if (expected?.kind !== CanonicalObservationKind.State) {
    throw new TypeError("Semantic incident prefix has no committed state");
  }
  const incident = expected.openIncidents[0];
  if (incident === undefined || expected.openIncidents.length !== 1) {
    throw new TypeError("Semantic incident prefix has no exact incident");
  }
  const interactions = expected.enabledInteractions.filter(
    (interaction) =>
      interaction.kind === StimulusKind.RetryIncident ||
      interaction.kind === StimulusKind.CancelIncidentProcess,
  );
  if (
    !isDeepStrictEqual(snapshot, {
      instanceId: incident.id.effectId.processInstanceId,
      status: ProcessStatus.Running,
      incidents: [{ incident, interactions }],
    }) ||
    interactions.length !== (expectsCancellation ? 2 : 1) ||
    interactions[0]?.kind !== StimulusKind.RetryIncident ||
    (expectsCancellation &&
      interactions[1]?.kind !== StimulusKind.CancelIncidentProcess)
  ) {
    throw new TypeError("Current incident Query differs from exact semantic publication order");
  }
}

/** Deliberately wrong current-state account used to prove why retained trace is not authoritative. */
export function traceDerivedCurrentIncidentMutation(
  trace: ReadonlyArray<CanonicalObservation>,
): ReadonlyArray<OpenEffectIncident> {
  return trace.flatMap((observation) =>
    observation.kind === CanonicalObservationKind.State
      ? observation.openIncidents
      : []
  );
}

function requireObservedIncidents(
  result: TemporalProcessOperationsObservationResult,
  expected: ReadonlyArray<unknown>,
): void {
  if (
    result.status !== TemporalProcessOperationsObservationStatus.Observed ||
    !isDeepStrictEqual(result.incidents, expected)
  ) {
    throw new TypeError("Product 1 did not classify the exact current incident snapshot");
  }
}

function requireClosed(
  result: TemporalProcessOperationsObservationResult,
): void {
  if (result.status !== TemporalProcessOperationsObservationStatus.Closed) {
    throw new TypeError("Product 1 did not corroborate terminal Query state with its receipt");
  }
}

function requireCommittedAction(
  result: ProcessCommandResult,
  commandId: string,
): void {
  if (
    result.kind !== ProcessCommandResultKind.Semantic ||
    result.commandId !== commandId ||
    result.outcome !== CommandOutcome.Committed
  ) {
    throw new TypeError("Incident operation did not commit through Product 1");
  }
}

async function historyEventCount(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<number> {
  return (await fetchHistory(handle)).events.length;
}

async function fetchHistory(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<TemporalHistory> {
  const history = await withDeadline(
    handle.fetchHistory(),
    operationDeadlineMs,
    "incident operations history fetch",
  );
  if (!Array.isArray(history.events)) {
    throw new TypeError("Incident operations history has no events array");
  }
  return history as TemporalHistory;
}

function deferred(): Readonly<{
  promise: Promise<void>;
  resolve(): void;
}> {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
