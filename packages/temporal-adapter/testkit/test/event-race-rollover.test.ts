import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  ScenarioStepKind,
  SemanticOperationKind,
  StimulusKind,
  advanceScenario,
  deployProcess,
  initialState,
} from "@bpmn-lean/semantic-core";
import type { DeliverMessageStimulus } from "@bpmn-lean/semantic-core";
import {
  bpmnDeliverMessageSignalName,
  bpmnProcessWorkflowType,
  bpmnTraceQueryName,
  productionBpmnWorkflowInitialHostInput,
  timerFiringStimulus,
} from "@bpmn-lean/temporal-protocol";
import { loadBpmnWorkflowBundle } from "@bpmn-lean/temporal-testkit";
import { parseWorkflowCode } from "@temporalio/worker/lib/worker.js";
import { defaultPayloadConverter } from "@temporalio/workflow";

import {
  commands,
  requireStartedTimer,
  runDirectVmActivations,
  workflowFailureType,
} from "./direct-vm-activation-harness.ts";
import type { Activation, Completion } from "./direct-vm-activation-harness.ts";

const compiledFixture = compileFixture();
const productionBundle = loadBpmnWorkflowBundle().then(({ code }) => parseWorkflowCode(code));

for (const wrongTarget of ["channel", "occurrence"] as const) {
  test(`a rejected ${wrongTarget} defers rollover until the original Event-race Timer wins`, async () => {
    const { program, start, delivery } = await compiledFixture;
    const rejectedDelivery: DeliverMessageStimulus = wrongTarget === "channel"
      ? { ...delivery, channel: { ...delivery.channel, messageId: "Message_Unrelated" } }
      : { ...delivery, subscriptionId: { ...delivery.subscriptionId, activation: 2 } };
    const started = advanceScenario(program, initialState, start);
    assert.equal(started.kind, ScenarioStepKind.Committed);
    const rejected = advanceScenario(program, started.state, rejectedDelivery);
    assert.equal(rejected.kind, ScenarioStepKind.Terminal);
    assert.deepEqual(rejected.state, started.state);
    const timer = started.state.timerWaits[0];
    assert.ok(timer);
    const won = advanceScenario(program, rejected.state, timerFiringStimulus(timer));
    assert.equal(won.kind, ScenarioStepKind.Committed);
    assert.equal(won.state.logicalTimeMs, 1_000);
    assert.deepEqual(won.state.eventRaces, []);
    assert.deepEqual(won.state.messageWaits, []);
    assert.deepEqual(won.state.timerWaits, []);
    assert.deepEqual(won.state.userTaskWaits.map(({ id }) => id.elementId), ["TimerTask"]);
    const traceQuery: NonNullable<Activation["jobs"]>[number] & { variant: "queryWorkflow" } = {
      variant: "queryWorkflow",
      queryWorkflow: { queryId: "after-rejection", queryType: bpmnTraceQueryName, arguments: [] },
    };

    const [afterRejection, observedRejection, afterTimer] = await runDirectVmActivations({
      bundle: await productionBundle,
      workflowType: bpmnProcessWorkflowType,
      replaying: false,
      taskQueue: "event-race-rollover",
      args: [start, program, {
        ...productionBpmnWorkflowInitialHostInput(),
        eventHistoryEventLimit: 4,
      }].map((argument) => defaultPayloadConverter.toPayload(argument)),
      readyJobs: [{
        signalWorkflow: {
          signalName: bpmnDeliverMessageSignalName,
          input: [defaultPayloadConverter.toPayload(rejectedDelivery)],
        },
      }],
      assertInitialization(completion) {
        requireSuccessful(completion);
        requireStartedTimer(completion, 1);
        assert.equal(commands(completion).filter(({ startTimer }) => startTimer).length, 1);
        assert.equal(commands(completion).some(({ continueAsNewWorkflowExecution }) =>
          continueAsNewWorkflowExecution !== undefined), false);
      },
    }, [
      [traceQuery],
      [{ fireTimer: { seq: 1 } }],
    ]);

    assert.ok(afterRejection);
    requireSuccessful(afterRejection);
    assert.equal(commands(afterRejection).some(({ continueAsNewWorkflowExecution }) =>
      continueAsNewWorkflowExecution !== undefined), false,
    "a rejected Signal must not move the live native Timer into another Run");
    assertNoTimerCommands(afterRejection);
    assert.ok(observedRejection);
    requireSuccessful(observedRejection);
    assert.deepEqual(queryResult(observedRejection), [
      deployProcess(start, program).observation,
      ...started.observations,
      ...rejected.observations,
    ]);

    assert.ok(afterTimer);
    requireSuccessful(afterTimer);
    assertNoTimerCommands(afterTimer);
    const continuations = commands(afterTimer).flatMap(({ continueAsNewWorkflowExecution }) =>
      continueAsNewWorkflowExecution ? [continueAsNewWorkflowExecution] : []);
    assert.equal(continuations.length, 1, "rollover must resume after the core removes the race");
    const carriedState = continuations[0]?.arguments?.[3];
    assert.ok(carriedState);
    assert.deepEqual(defaultPayloadConverter.fromPayload(carriedState), won.state);
  });
}

function requireSuccessful(completion: Completion): void {
  assert.equal(completion.failed, undefined);
  assert.ok(completion.successful);
  assert.equal(workflowFailureType(completion), undefined);
}

function assertNoTimerCommands(completion: Completion): void {
  assert.equal(commands(completion).some(({ startTimer, cancelTimer }) =>
    startTimer !== undefined || cancelTimer !== undefined), false);
}

function queryResult(completion: Completion): unknown {
  const responses = commands(completion).flatMap(({ respondToQuery }) =>
    respondToQuery?.queryId === "after-rejection" ? [respondToQuery] : []);
  assert.equal(responses.length, 1);
  assert.equal(responses[0]?.failed, undefined);
  const payload = responses[0]?.succeeded?.response;
  assert.ok(payload);
  return defaultPayloadConverter.fromPayload(payload);
}

async function compileFixture() {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../../scenarios/event-based-gateway-message-timer/process.bpmn",
      import.meta.url,
    )),
    sourceId: "event-race-rollover",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: "bpmn-2.0.2-event-based-gateway-message-timer-draft",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  assert.ok(compilation.status === BpmnCompilationStatus.Accepted);
  const program = compilation.semanticProcess;
  const race = program.operations.find(({ kind }) => kind === SemanticOperationKind.AwaitEventRace);
  assert.ok(race?.kind === SemanticOperationKind.AwaitEventRace);
  const start = {
    kind: StimulusKind.StartProcess,
    commandId: "start-event-race-rollover",
    processId: program.processId,
    instanceId: "EventRace_Rollover",
    initialVariables: [],
  } as const;
  assert.equal(deployProcess(start, program).outcome, CommandOutcome.Committed);
  return {
    program,
    start,
    delivery: {
      kind: StimulusKind.DeliverMessage,
      commandId: "reject-event-race-rollover",
      subscriptionId: {
        processInstanceId: start.instanceId,
        elementId: race.message.elementId,
        activation: 1,
      },
      channel: race.message.channel,
    } as const,
  };
}
