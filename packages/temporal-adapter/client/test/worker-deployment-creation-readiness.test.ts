import assert from "node:assert/strict";
import { test } from "node:test";
import { SemanticOperationKind, SemanticProfileId, StimulusKind, MessageChannelKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, TriggerMessageStartStimulus, TriggerTimerStartStimulus } from "@bpmn-lean/semantic-core";
import { startBpmnProcess, WorkerDeploymentNotReady } from "@bpmn-lean/temporal-client";
import { prepareTemporalDefinitionStart, startPreparedTemporalDefinition } from "@bpmn-lean/temporal-client/definition-start";
import { prepareTemporalMessageStart, startTemporalMessageStart } from "@bpmn-lean/temporal-client/message-start";
import { createTemporalDefinitionSchedule } from "@bpmn-lean/temporal-client/definition-schedule";
import { productionBpmnWorkflowInitialHostInput } from "@bpmn-lean/temporal-protocol";
import { ScheduleAlreadyRunning } from "@temporalio/client";
import { processProgramFixture as program, processStartFixture as start } from "./process-start-fixture.ts";
import { enrollmentFixture } from "./worker-deployment-enrollment-fixture.ts";

const taskQueue = "creation-enrollment-queue";
const workflowId = "exact-prepared-workflow";
const channel = { kind: MessageChannelKind.OperationMessage, interfaceId: "Interface", interfaceOperationId: "Operation", messageId: "Message" } as const;
const messageStart: TriggerMessageStartStimulus = {
  kind: StimulusKind.TriggerMessageStart, commandId: start.commandId, processId: start.processId,
  instanceId: start.instanceId, startEventId: "StartEvent_1", channel,
};
const timerStart: TriggerTimerStartStimulus = {
  kind: StimulusKind.TriggerTimerStart, commandId: start.commandId, processId: start.processId,
  instanceId: start.instanceId, startEventId: "StartEvent_1",
};
const messageProgram: SemanticProcessProgram = {
  ...program,
  identity: { ...program.identity, semanticProfile: SemanticProfileId.MessageStart },
  operations: program.operations.map((operation) => operation.kind === SemanticOperationKind.Initiate
    ? { id: operation.id, origin: operation.origin, kind: SemanticOperationKind.InitiateMessage, outputs: [operation.output], channel }
    : operation),
};
const timerProgram: SemanticProcessProgram = {
  ...program,
  identity: { ...program.identity, semanticProfile: SemanticProfileId.TimerStart },
  operations: program.operations.map((operation) => operation.kind === SemanticOperationKind.Initiate
    ? { id: operation.id, origin: operation.origin, kind: SemanticOperationKind.InitiateTimer, outputs: [operation.output], timer: { durationMs: 1_000 } }
    : operation),
};

function creationCases() {
  const directRequest = { start, semanticProcess: program, taskQueue, workflowId };
  const direct = prepareTemporalDefinitionStart(directRequest);
  assert.equal(direct.kind, "admitted");
  if (direct.kind !== "admitted") throw new Error("Direct fixture admission failed");
  const messageRequest = { start: messageStart, semanticProcess: messageProgram, taskQueue, workflowId };
  const message = prepareTemporalMessageStart(messageRequest);
  assert.equal(message.kind, "admitted");
  if (message.kind !== "admitted") throw new Error("Message fixture admission failed");
  return [
    { name: "ordinary Process", invoke: (client: never) => startBpmnProcess(client, start, program, { taskQueue }) },
    { name: "prepared definition", invoke: (client: never) => startPreparedTemporalDefinition(client, { ...directRequest, expectedIntent: direct.intent }) },
    { name: "Message Start", invoke: (client: never) => startTemporalMessageStart(client, { ...messageRequest, expectedIntent: message.intent }) },
    { name: "definition Schedule", invoke: (client: never) => createTemporalDefinitionSchedule(client, scheduleRequest()) },
  ];
}

function scheduleRequest() {
  return {
    scheduleId: "exact-schedule", configuredWorkflowId: workflowId, taskQueue,
    dueAtEpochMs: Date.UTC(2030, 0, 2, 3, 4, 6), start: timerStart, semanticProcess: timerProgram,
  };
}

for (const scenario of creationCases()) {
  for (const readiness of [
    { absentCurrent: "workflow" },
    { absentCurrent: "activity" },
    { missingActivityRegistration: true },
  ] as const) {
    test(`${scenario.name} submits no creation when native enrollment is unready ${JSON.stringify(readiness)}`, async () => {
      const calls: string[] = [];
      const native = enrollmentFixture(taskQueue, { ...readiness, calls });
      const client = creationClient(native, calls);
      await assert.rejects(scenario.invoke(client), WorkerDeploymentNotReady);
      assert.equal(calls.includes("create"), false);
    });
  }

  test(`${scenario.name} checks exact dual Current and registration before one creation`, async () => {
    const calls: string[] = [];
    const client = creationClient(enrollmentFixture(taskQueue, { calls }), calls);
    const result = await scenario.invoke(client);
    assert.ok(result.kind === "started" || result.kind === "created");
    assert.deepEqual(calls, ["current:workflow", "current:activity", "registration", "create"]);
  });

  test(`${scenario.name} preserves native transport failure without creation`, async () => {
    const calls: string[] = [];
    const failure = new Error("native service unavailable");
    const client = creationClient(enrollmentFixture(taskQueue, { failure, calls }), calls);
    await assert.rejects(scenario.invoke(client), (error) => error === failure);
    assert.deepEqual(calls, ["current:workflow"]);
  });

  test(`${scenario.name} preserves SDK creation failure after native readiness`, async () => {
    const calls: string[] = [];
    const failure = new Error("creation response lost");
    const client = creationClient(enrollmentFixture(taskQueue, { calls }), calls, [], failure);
    await assert.rejects(scenario.invoke(client), (error) => error === failure);
    assert.deepEqual(calls, ["current:workflow", "current:activity", "registration", "create"]);
  });
}

test("ordinary Process snapshots admitted arguments and queue before readiness yields", async () => {
  const calls: string[] = [];
  const captured: unknown[] = [];
  const mutableStart: Omit<typeof start, "instanceId"> & { instanceId: string } = structuredClone(start);
  const mutableProgram: Omit<typeof program, "processId"> & { processId: string } = structuredClone(program);
  const options = { taskQueue };
  const pending = startBpmnProcess(creationClient(enrollmentFixture(taskQueue, { calls }), calls, captured), mutableStart, mutableProgram, options);
  mutableStart.instanceId = "changed";
  mutableProgram.processId = "changed";
  options.taskQueue = "changed";
  await pending;
  const request = captured[0] as { taskQueue: string; args: unknown[] };
  assert.equal(request.taskQueue, taskQueue);
  assert.deepEqual(request.args, [start, program, productionBpmnWorkflowInitialHostInput()]);
});

test("Schedule snapshots the complete admitted action before readiness yields", async () => {
  const captured: unknown[] = [];
  const request = structuredClone(scheduleRequest());
  const expected = structuredClone(request);
  const pending = createTemporalDefinitionSchedule(creationClient(enrollmentFixture(taskQueue), [], captured), request);
  request.scheduleId = "changed";
  request.taskQueue = "changed";
  request.configuredWorkflowId = "changed";
  request.dueAtEpochMs += 1_000;
  (request.start as { instanceId: string }).instanceId = "changed";
  (request.semanticProcess as { processId: string }).processId = "changed";
  assert.deepEqual(await pending, { kind: "created" });
  const actual = captured[0] as { scheduleId: string; spec: { startAt: Date }; action: { taskQueue: string; workflowId: string; args: unknown[] } };
  assert.equal(actual.scheduleId, expected.scheduleId);
  assert.equal(actual.spec.startAt.getTime(), expected.dueAtEpochMs);
  assert.equal(actual.action.taskQueue, expected.taskQueue);
  assert.equal(actual.action.workflowId, expected.configuredWorkflowId);
  assert.deepEqual(actual.action.args, [expected.start, expected.semanticProcess, productionBpmnWorkflowInitialHostInput()]);
});

test("local admission and construction failures perform no native I/O", async () => {
  const calls: string[] = [];
  const client = creationClient(enrollmentFixture(taskQueue, { calls }), calls);
  const invalid = { ...program, processId: "invalid" };
  assert.equal((await startBpmnProcess(client, start, invalid, { taskQueue })).kind, "rejected");
  assert.equal((await startPreparedTemporalDefinition(client, { start, semanticProcess: invalid, taskQueue, workflowId, expectedIntent: { protocol: "bpmn-direct-start-v1", intentSha256: "0".repeat(64) } })).kind, "rejected");
  assert.equal((await startTemporalMessageStart(client, { start: messageStart, semanticProcess: invalid, taskQueue, workflowId, expectedIntent: { protocol: "bpmn-message-start-v1", intentSha256: "0".repeat(64) } })).kind, "rejected");
  assert.equal((await createTemporalDefinitionSchedule(client, { ...scheduleRequest(), semanticProcess: invalid })).kind, "rejected");
  await assert.rejects(createTemporalDefinitionSchedule(client, { ...scheduleRequest(), dueAtEpochMs: 9_000_000_000_000_000 }), RangeError);
  assert.deepEqual(calls, []);
});

test("Schedule retains the SDK already-exists classification after enrollment", async () => {
  const calls: string[] = [];
  const client = creationClient(enrollmentFixture(taskQueue, { calls }), calls, [], new ScheduleAlreadyRunning("already exists", "exact-schedule"));
  assert.deepEqual(await createTemporalDefinitionSchedule(client, scheduleRequest()), { kind: "alreadyExists" });
  assert.deepEqual(calls, ["current:workflow", "current:activity", "registration", "create"]);
});

function creationClient(native: ReturnType<typeof enrollmentFixture>, calls: string[], captured: unknown[] = [], failure?: Error): never {
  const create = async (options: unknown) => {
    calls.push("create");
    captured.push(options);
    if (failure !== undefined) throw failure;
    return {};
  };
  return {
    workflow: {
      ...native,
      start: async (_type: unknown, options: unknown) => create(options),
    },
    ...native,
    start: async (_type: unknown, options: unknown) => create(options),
    schedule: { create },
  } as never;
}
