import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  EffectExecutionResultKind,
  MessageChannelKind,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  deployProcess,
  initialState,
} from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, DeliverMessageStimulus, SemanticProcessProgram, StartProcessStimulus, Stimulus } from "@bpmn-lean/semantic-core";
import {
  bpmnCancelIncidentProcessUpdateName,
  bpmnCompleteUserTaskUpdateName,
  bpmnDeliverMessageSignalName,
  bpmnProcessWorkflowType,
  bpmnRetryEffectIncidentUpdateName,
  bpmnTraceQueryName,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  completeEffectStimulus,
  productionBpmnWorkflowInitialHostInput,
  timerFiringStimulus,
  WorkflowChainBudgetKind,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import { loadBpmnWorkflowBundle } from "@bpmn-lean/temporal-testkit";
import { parseWorkflowCode } from "@temporalio/worker/lib/worker.js";
import { defaultPayloadConverter } from "@temporalio/workflow";

import {
  activityBoundaryMessageFixture,
  compileActivityBoundaryMessageProgram,
} from "./activity-boundary-message-temporal-support.ts";
import { compensationFixture, compensationProgram } from "./compensation-durability-support.ts";
import { commands, runDirectVmActivations, workflowFailureType } from "./direct-vm-activation-harness.ts";
import type { Activation, Completion } from "./direct-vm-activation-harness.ts";

type Job = NonNullable<Activation["jobs"]>[number];
const bundle = loadBpmnWorkflowBundle().then(({ code }) => parseWorkflowCode(code));
const messageProgram = compileActivityBoundaryMessageProgram("managed-host-wakeup");

for (const kind of [StimulusKind.RetryIncident, StimulusKind.CancelIncidentProcess] as const) {
  test(`Message-bounded wait processes ${kind} before either pair callback`, async () => {
    const program = await messageProgram;
    const fixture = activityBoundaryMessageFixture(program, kind);
    const command = incidentCommand(kind, fixture.start);
    const started = advanceScenario(program, initialState, fixture.start);
    assert.equal(started.kind, ScenarioStepKind.Committed);
    const rejected = advanceScenario(program, started.state, command);
    assert.equal(rejected.kind, ScenarioStepKind.Terminal);
    assert.deepEqual(rejected.state, started.state);
    const [response, trace] = await activate(program, fixture.start, [updateJob(command)], [[queryJob()]]);
    requireRejectedUpdate(response);
    assertNoOwnedCommands(response);
    assert.deepEqual(queryResult(trace), [
      deployProcess(fixture.start, program).observation,
      ...started.observations,
      ...rejected.observations,
    ]);
  });
}

test("Message-bounded wait surfaces Signal capacity failure before a pair callback", async () => {
  const program = await messageProgram;
  const fixture = activityBoundaryMessageFixture(program, "capacity");
  const [response] = await activate(program, fixture.start, [{
    signalWorkflow: {
      signalName: bpmnDeliverMessageSignalName,
      input: [defaultPayloadConverter.toPayload({ ...fixture.delivery, commandId: "x".repeat(70_000) })],
    },
  }]);
  assert.ok(response);
  assert.equal(response.failed, undefined);
  assert.equal(workflowFailureType(response), bpmnWorkflowChainCapacityExhaustedFailureType);
  assertNoOwnedCommands(response);
});

for (const fixtureName of ["event-based-gateway-message-timer", "activity-boundary-timer"] as const) {
  test(`${fixtureName} retains its original Timer across an unrelated Update wake`, async () => {
    const program = await compileTimerProgram(fixtureName);
    const start: StartProcessStimulus = {
      kind: StimulusKind.StartProcess,
      commandId: `start-${fixtureName}`,
      instanceId: `Instance_${fixtureName}`,
      processId: program.processId,
      initialVariables: [],
    };
    const rejectedCommand = incidentCommand(StimulusKind.RetryIncident, start);
    const started = advanceScenario(program, initialState, start);
    assert.equal(started.kind, ScenarioStepKind.Committed);
    const rejected = advanceScenario(program, started.state, rejectedCommand);
    assert.equal(rejected.kind, ScenarioStepKind.Terminal);
    const timer = started.state.timerWaits[0];
    assert.ok(timer);
    const fired = advanceScenario(program, rejected.state, timerFiringStimulus(timer));
    assert.equal(fired.kind, ScenarioStepKind.Committed);
    const [response, afterTimer, trace] = await activate(program, start,
      [updateJob(rejectedCommand)], [[{ fireTimer: { seq: 1 } }], [queryJob()]],
      (initial) => {
        assert.deepEqual(Array.from(commands(initial)).flatMap(({ startTimer }) => startTimer ? [startTimer.seq] : []), [1]);
      });
    requireRejectedUpdate(response);
    assertNoOwnedCommands(response);
    assertNoOwnedCommands(afterTimer);
    assert.deepEqual(queryResult(trace), [
      deployProcess(start, program).observation,
      ...started.observations,
      ...rejected.observations,
      ...fired.observations,
    ]);
  });
}

test("Compensation yields to an unrelated Update and keeps both scheduled Activities", async () => {
  const program = await compensationProgram("managed-host-wakeup-compensation");
  const fixture = compensationFixture(program, "host-wakeup");
  const retry = incidentCommand(StimulusKind.RetryIncident, fixture.start);
  const success = { kind: EffectExecutionResultKind.Success, localPatch: [] } as const;
  let state = initialState;
  const expectedTrace: CanonicalObservation[] = [deployProcess(fixture.start, program).observation];
  for (const stimulus of [fixture.start, ...Object.values(fixture.completions), retry]) {
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed || step.kind === ScenarioStepKind.Terminal);
    state = step.state;
    expectedTrace.push(...step.observations);
  }
  const cWait = state.compensationHandlerEffectWaits?.find(({ id }) => id.elementId === "Task_UndoInsurance");
  assert.ok(cWait);
  const completed = advanceScenario(program, state, completeEffectStimulus(cWait.id, success));
  assert.equal(completed.kind, ScenarioStepKind.Committed);
  expectedTrace.push(...completed.observations);
  const [hotel, ground, frontier, response, completedC, trace] = await activate(program, fixture.start,
    [updateJob(fixture.completions.reserveHotel)], [
      [updateJob(fixture.completions.groundTravel)],
      [updateJob(fixture.completions.insurance)],
      [updateJob(retry)],
      [{ resolveActivity: {
        seq: 2,
        result: { completed: { result: defaultPayloadConverter.toPayload(success) } },
      } }],
      [queryJob()],
    ]);
  assert.ok(hotel && ground && frontier);
  const scheduled = Array.from(commands(frontier)).flatMap(({ scheduleActivity }) => scheduleActivity ? [scheduleActivity] : []);
  assert.deepEqual(scheduled.map(({ seq }) => seq), [1, 2]);
  assert.deepEqual(scheduled.map(({ arguments: args }) => {
    assert.ok(args?.[0]);
    return defaultPayloadConverter.fromPayload(args[0]);
  }), [fixture.requests.b, fixture.requests.c]);
  requireRejectedUpdate(response);
  assertNoOwnedCommands(response);
  requireSuccessful(completedC);
  assertNoOwnedCommands(completedC);
  assert.deepEqual(queryResult(trace), expectedTrace);
});

for (const queueBound of ["entries", "bytes"] as const) {
  test(`an Activity completion remains admissible after exact queue ${queueBound} pressure drains beside its Timer`, async () => {
    const program = await compileTimerProgram("activity-boundary-timer");
    const start: StartProcessStimulus = {
      kind: StimulusKind.StartProcess, commandId: `start-drained-${queueBound}`,
      instanceId: `Drained_${queueBound}`, processId: program.processId, initialVariables: [],
    };
    const started = advanceScenario(program, initialState, start);
    assert.equal(started.kind, ScenarioStepKind.Committed);
    const task = started.state.userTaskWaits[0];
    assert.ok(task);
    const deliveries = queueFillingDeliveries(start.instanceId, queueBound);
    const expectedTrace: CanonicalObservation[] = [deployProcess(start, program).observation, ...started.observations];
    for (const delivery of deliveries) {
      const rejected = advanceScenario(program, started.state, delivery);
      assert.equal(rejected.kind, ScenarioStepKind.Terminal);
      assert.deepEqual(rejected.state, started.state);
      expectedTrace.push(...rejected.observations);
    }
    const completion = {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-drained-${queueBound}`,
      taskId: task.id, submittedValues: [],
    } as const;
    const completed = advanceScenario(program, started.state, completion);
    assert.equal(completed.kind, ScenarioStepKind.Committed);
    assert.deepEqual(completed.state.timerWaits, []);
    expectedTrace.push(...completed.observations);
    const [drained, response, trace] = await activate(program, start,
      deliveries.map((delivery) => ({ signalWorkflow: {
        signalName: bpmnDeliverMessageSignalName, input: [defaultPayloadConverter.toPayload(delivery)],
      } })), [[updateJob(completion)], [queryJob()]],
      (initial) => assert.deepEqual(Array.from(commands(initial)).flatMap(({ startTimer }) => startTimer ? [startTimer.seq] : []), [1]));
    requireSuccessful(drained);
    assertNoOwnedCommands(drained);
    assert.equal(commands(drained).some(({ continueAsNewWorkflowExecution }) => continueAsNewWorkflowExecution), false);
    requireSuccessful(response);
    assert.equal(commands(response).find(({ updateResponse }) => updateResponse?.rejected)?.updateResponse?.rejected, undefined);
    assert.deepEqual(Array.from(commands(response)).flatMap(({ updateResponse }) =>
      updateResponse?.completed ? [defaultPayloadConverter.fromPayload(updateResponse.completed)] : []), [CommandOutcome.Committed]);
    assert.deepEqual(Array.from(commands(response)).flatMap(({ cancelTimer }) => cancelTimer ? [cancelTimer.seq] : []), [1]);
    assert.deepEqual(queryResult(trace), expectedTrace);
  });
}

function queueFillingDeliveries(instanceId: string, bound: "entries" | "bytes"): DeliverMessageStimulus[] {
  const entries = workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticInputQueueEntries);
  const byteLimit = workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticInputQueueBytes);
  const count = bound === "entries" ? entries : 5;
  const deliveries: DeliverMessageStimulus[] = Array.from({ length: count }, (_, index) => ({
    kind: StimulusKind.DeliverMessage, commandId: `unrelated-${index}`,
    subscriptionId: { processInstanceId: instanceId, elementId: "AbsentCatch", activation: 1 },
    channel: { kind: MessageChannelKind.OperationMessage, interfaceId: "AbsentInterface", interfaceOperationId: "AbsentOperation", messageId: "AbsentMessage" },
  }));
  if (bound === "bytes") {
    let remaining = byteLimit - workflowChainCanonicalUtf8ByteLength(deliveries);
    for (const [index, delivery] of deliveries.entries()) {
      const padding = Math.ceil(remaining / (deliveries.length - index));
      deliveries[index] = { ...delivery, channel: { ...delivery.channel, messageId: `${delivery.channel.messageId}${"x".repeat(padding)}` } };
      remaining -= padding;
    }
    assert.equal(workflowChainCanonicalUtf8ByteLength(deliveries), byteLimit);
    assert.ok(deliveries.length < entries);
  } else {
    assert.equal(deliveries.length, entries);
    assert.ok(workflowChainCanonicalUtf8ByteLength(deliveries) < byteLimit);
  }
  assert.ok(deliveries.every((delivery) => workflowChainCanonicalUtf8ByteLength(delivery)
    <= workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticStimulusBytes)));
  return deliveries;
}

async function activate(
  program: SemanticProcessProgram,
  start: StartProcessStimulus,
  readyJobs: Job[],
  laterBatches: Job[][] = [],
  assertInitial: (completion: Completion) => void = assertNoOwnedCommands,
) {
  return runDirectVmActivations({
    bundle: await bundle,
    workflowType: bpmnProcessWorkflowType,
    replaying: false,
    taskQueue: "managed-host-wakeup",
    args: [start, program, productionBpmnWorkflowInitialHostInput()].map((argument) => defaultPayloadConverter.toPayload(argument)),
    readyJobs,
    assertInitialization(completion) {
      requireSuccessful(completion);
      assertInitial(completion);
    },
  }, laterBatches);
}

function incidentCommand(
  kind: StimulusKind.RetryIncident | StimulusKind.CancelIncidentProcess,
  start: StartProcessStimulus,
): Stimulus {
  const incidentId = {
    effectId: { processInstanceId: start.instanceId, elementId: "AbsentEffect", activation: 1 },
    generation: 1 as const,
  };
  switch (kind) {
    case StimulusKind.RetryIncident:
      return { kind, commandId: `retry-${start.instanceId}`, incidentId };
    case StimulusKind.CancelIncidentProcess:
      return { kind, commandId: `cancel-${start.instanceId}`, processInstanceId: start.instanceId, incidentId };
  }
}

function updateJob(stimulus: Stimulus): Job {
  let name: string;
  switch (stimulus.kind) {
    case StimulusKind.RetryIncident: name = bpmnRetryEffectIncidentUpdateName; break;
    case StimulusKind.CancelIncidentProcess: name = bpmnCancelIncidentProcessUpdateName; break;
    case StimulusKind.CompleteUserTaskInstance: name = bpmnCompleteUserTaskUpdateName; break;
    default: throw new TypeError(`Unexpected Update stimulus ${stimulus.kind}`);
  }
  return { doUpdate: {
    id: stimulus.commandId,
    protocolInstanceId: stimulus.commandId,
    name,
    input: [defaultPayloadConverter.toPayload(stimulus)],
    runValidator: true,
  } };
}

function queryJob(): Job & { variant: "queryWorkflow" } {
  return { variant: "queryWorkflow", queryWorkflow: { queryId: "trace", queryType: bpmnTraceQueryName, arguments: [] } };
}

function queryResult(completion: Completion | undefined): unknown {
  requireSuccessful(completion);
  const response = commands(completion).find(({ respondToQuery }) => respondToQuery?.queryId === "trace")?.respondToQuery;
  assert.equal(response?.failed, undefined);
  assert.ok(response?.succeeded?.response);
  return defaultPayloadConverter.fromPayload(response.succeeded.response);
}

function requireSuccessful(completion: Completion | undefined): asserts completion is Completion {
  assert.ok(completion);
  assert.equal(completion.failed, undefined);
  assert.ok(completion.successful);
  assert.equal(workflowFailureType(completion), undefined);
}

function requireRejectedUpdate(completion: Completion | undefined): void {
  requireSuccessful(completion);
  const outcomes = Array.from(commands(completion)).flatMap(({ updateResponse }) =>
    updateResponse?.completed ? [defaultPayloadConverter.fromPayload(updateResponse.completed)] : []);
  assert.deepEqual(outcomes, [CommandOutcome.Rejected], "accepted Update must settle before any managed callback");
}

function assertNoOwnedCommands(completion: Completion | undefined): void {
  assert.ok(completion);
  assert.equal(commands(completion).some(({ startTimer, cancelTimer, scheduleActivity, requestCancelActivity }) =>
    startTimer !== undefined || cancelTimer !== undefined || scheduleActivity !== undefined || requestCancelActivity !== undefined), false);
}

async function compileTimerProgram(name: "event-based-gateway-message-timer" | "activity-boundary-timer") {
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(`../../../../scenarios/${name}/process.bpmn`, import.meta.url)),
    sourceId: `managed-host-wakeup-${name}`,
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: `bpmn-2.0.2-${name}-draft`,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.ok(result.status === BpmnCompilationStatus.Accepted);
  return result.semanticProcess;
}
