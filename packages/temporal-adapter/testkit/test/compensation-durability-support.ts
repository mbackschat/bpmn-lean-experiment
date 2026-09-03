/** Shared exact-source and Event History support for live Compensation durability witnesses. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";

import { Context } from "@temporalio/activity";

import {
  BpmnCompilationStatus,
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  EffectExecutionResultKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  initialState,
  observeStableState,
  projectCompensationEffectTransportMaterial,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteEffectStimulus,
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type { WorkflowClient, WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

import {
  BpmnWorkflowHostInputKind,
  ProcessCommandResultKind,
  WorkflowChainBudgetKind,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  bpmnWorkflowContinuationV1,
  compensationEffectTransportKey,
  processWorkflowId,
  submitUserTaskCompletion,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  EffectRequest,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import { decodeJsonPayload } from "./temporal-history-facts.ts";
import { waitForOpenUserTaskIds } from "./temporal-worker-test-support.ts";
import { workflowChainRuns } from "./workflow-chain-test-support.ts";

export const compensationOperationDeadlineMs = 20_000;

export const compensationFailureResult = {
  kind: EffectExecutionResultKind.BpmnError,
  code: "compensation-rejected",
  message: "insurance reversal rejected",
  localPatch: [],
} as const;

export type CompensationFixture = Readonly<{
  program: SemanticProcessProgram;
  start: StartProcessStimulus;
  completions: Readonly<{
    reserveHotel: CompleteUserTaskInstanceStimulus;
    groundTravel: CompleteUserTaskInstanceStimulus;
    insurance: CompleteUserTaskInstanceStimulus;
  }>;
  openBefore: Readonly<{
    reserveHotel: ReadonlyArray<string>;
    groundTravel: ReadonlyArray<string>;
    insurance: ReadonlyArray<string>;
  }>;
  requests: Readonly<{ b: EffectRequest; c: EffectRequest; a: EffectRequest }>;
  expectedFinalState: StateObservation;
  expectedFailedState: StateObservation;
}>;

export function compensationFixture(
  program: SemanticProcessProgram,
  suffix: string,
): CompensationFixture {
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: `start:compensation-durability:${suffix}`,
    processId: program.processId,
    instanceId: `CompensationDurability_${suffix}`,
    initialVariables: [{
      name: "Property_TravelDetails",
      value: { kind: VariableValueKind.String, value: "frozen itinerary" },
    }],
  };
  let state = committedState(program, initialState, start);
  const reserveHotel = completionFor(state, "Task_ReserveHotel", suffix);
  const reserveHotelOpen = openUserTaskElementIds(state);
  state = committedState(program, state, reserveHotel);
  const groundTravel = completionFor(state, "Task_ArrangeGroundTravel", suffix);
  const groundTravelOpen = openUserTaskElementIds(state);
  state = committedState(program, state, groundTravel);
  const insurance = completionFor(state, "Task_IssueInsurance", suffix);
  const insuranceOpen = openUserTaskElementIds(state);
  state = committedState(program, state, insurance);

  const frontierState = state;
  const bWait = compensationWait(state, "Task_UndoGroundTravel");
  const cWait = compensationWait(state, "Task_UndoInsurance");
  const b = effectRequest(program, bWait);
  const c = effectRequest(program, cWait);
  const failedState = committedState(program, frontierState, {
    kind: StimulusKind.CompleteEffect,
    commandId: "fail-c",
    effectId: cWait.id,
    result: compensationFailureResult,
  });
  const expectedFailedState = observeStableState(program, failedState);
  assert.ok(expectedFailedState !== null);
  state = committedState(program, state, effectCompletion(cWait.id, "complete-c"));
  state = committedState(program, state, effectCompletion(bWait.id, "complete-b"));
  const aWait = compensationWait(state, "Task_UndoReserveHotel");
  const a = effectRequest(program, aWait);
  state = committedState(program, state, effectCompletion(aWait.id, "complete-a"));
  const expectedFinalState = observeStableState(program, state);
  assert.ok(expectedFinalState !== null);

  return {
    program,
    start,
    completions: { reserveHotel, groundTravel, insurance },
    openBefore: {
      reserveHotel: reserveHotelOpen,
      groundTravel: groundTravelOpen,
      insurance: insuranceOpen,
    },
    requests: { b, c, a },
    expectedFinalState,
    expectedFailedState,
  };
}

export async function compensationProgram(
  sourceId: string,
): Promise<SemanticProcessProgram> {
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../bpmn-source/test/fixtures/compensation-source-checkpoint.bpmn",
      import.meta.url,
    )),
    sourceId,
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("Compensation durability source was not admitted");
  }
  return result.semanticProcess;
}

export async function startCompensationWorkflow(
  client: WorkflowClient,
  fixture: CompensationFixture,
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
  return client.start<BpmnProcessWorkflow>(bpmnProcessWorkflowType, {
    args: [
      fixture.start,
      fixture.program,
      {
        protocol: bpmnWorkflowContinuationV1,
        kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 3,
        eventHistoryByteLimit: workflowChainProductionLimit(
          WorkflowChainBudgetKind.EventHistoryBytes,
        ),
      },
    ],
    taskQueue: bpmnSemanticTaskQueue,
    workflowId: processWorkflowId(fixture.start.instanceId),
    workflowIdReusePolicy: "REJECT_DUPLICATE",
  });
}

export async function submitCompensationCompletion(
  handle: WorkflowHandle,
  client: WorkflowClient,
  completion: CompleteUserTaskInstanceStimulus,
  expectedOpen: ReadonlyArray<string>,
): Promise<void> {
  await waitForOpenUserTaskIds(handle, expectedOpen);
  assert.deepEqual(
    await submitUserTaskCompletion(
      client,
      completion.taskId.processInstanceId,
      completion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: completion.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
}

export function openCompensationEffectElementIds(
  state: StateObservation,
): ReadonlyArray<string> {
  return state.openEffects.map(({ id }) => id.elementId);
}

export async function compensationWorkflowEvidence(
  environment: TestWorkflowEnvironment,
  workflowId: string,
) {
  const listed = await workflowChainRuns(environment, workflowId);
  const runs: Array<Readonly<{
    history: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;
    trace: ReadonlyArray<CanonicalObservation>;
  }>> = [];
  for (const run of listed) {
    const handle = environment.client.workflow.getHandle<BpmnProcessWorkflow>(
      workflowId,
      run.runId,
    );
    runs.push({
      history: await handle.fetchHistory(),
      trace: await handle.query<ReadonlyArray<CanonicalObservation>>(
        bpmnTraceQueryName,
      ),
    });
  }
  return {
    runs,
    histories: runs.map(({ history }) => history as TemporalHistory),
    traces: runs.map(({ trace }) => trace),
  };
}

export function compensationActivityHistory(
  histories: ReadonlyArray<TemporalHistory>,
  request: EffectRequest,
): TemporalHistory {
  const matches = histories.flatMap((history) => history.events.flatMap((event) => {
    const attributes = record(event)["activityTaskScheduledEventAttributes"];
    if (!isRecord(attributes)) return [];
    const input = attributes["input"];
    if (!isRecord(input)) return [];
    const payloads = input["payloads"];
    return Array.isArray(payloads) && payloads.length === 1 &&
        isDeepStrictEqual(decodeJsonPayload(payloads[0]), request)
      ? [{ history, event }]
      : [];
  }));
  assert.equal(matches.length, 1);
  const match = matches[0];
  assert.ok(match !== undefined);
  const scheduledId = record(match.event)["eventId"];
  return {
    events: match.history.events.filter((event) =>
      event === match.event || [
        "activityTaskStartedEventAttributes",
        "activityTaskCompletedEventAttributes",
        "activityTaskFailedEventAttributes",
        "activityTaskTimedOutEventAttributes",
        "activityTaskCancelRequestedEventAttributes",
        "activityTaskCanceledEventAttributes",
      ].some((field) => {
        const attributes = record(event)[field];
        return isRecord(attributes) &&
          isDeepStrictEqual(attributes["scheduledEventId"], scheduledId);
      })
    ),
  };
}

export function deferred(): Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}> {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return {
    promise,
    resolve: () => resolve?.(),
  };
}

export async function waitForReleaseWithHeartbeat(
  release: Promise<void>,
): Promise<void> {
  const released = release.then(() => true);
  for (;;) {
    Context.current().heartbeat();
    if (await Promise.race([released, delay(25).then(() => false)])) return;
  }
}

function completionFor(
  state: RuntimeState,
  elementId: string,
  suffix: string,
): CompleteUserTaskInstanceStimulus {
  const waits = state.userTaskWaits.filter(({ id }) => id.elementId === elementId);
  assert.equal(waits.length, 1);
  const wait = waits[0];
  assert.ok(wait !== undefined);
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete:${elementId}:${suffix}`,
    taskId: wait.id,
    submittedValues: [],
  };
}

function compensationWait(state: RuntimeState, elementId: string) {
  const waits = (state.compensationHandlerEffectWaits ?? []).filter(
    ({ id }) => id.elementId === elementId,
  );
  assert.equal(waits.length, 1);
  const wait = waits[0];
  assert.ok(wait !== undefined);
  return wait;
}

function effectRequest(
  program: SemanticProcessProgram,
  wait: ReturnType<typeof compensationWait>,
): EffectRequest {
  const material = projectCompensationEffectTransportMaterial(program, wait);
  return {
    ...material.descriptor,
    idempotencyKey: compensationEffectTransportKey(material),
    arguments: material.arguments,
  };
}

function effectCompletion(
  effectId: ReturnType<typeof compensationWait>["id"],
  commandId: string,
): CompleteEffectStimulus {
  return {
    kind: StimulusKind.CompleteEffect,
    commandId,
    effectId,
    result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
  };
}

function committedState(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: StartProcessStimulus | CompleteUserTaskInstanceStimulus | CompleteEffectStimulus,
): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, stimulus.commandId);
  return result.state;
}

function openUserTaskElementIds(state: RuntimeState): ReadonlyArray<string> {
  return projectOpenUserTasks(state).map(({ id }) => id.elementId);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  assert.ok(isRecord(value));
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
