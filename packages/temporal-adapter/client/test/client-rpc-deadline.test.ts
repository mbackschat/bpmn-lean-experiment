import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowNotFoundError } from "@temporalio/client";
import { MessageChannelKind, ProcessStatus, SemanticOperationKind, SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { bpmnCorrelationIngressConfigurationQueryName, CorrelationPublicationStatusKind, correlationPublicationContentSha256, createCorrelationIngressEcho, productionCorrelationIngressConfiguration } from "@bpmn-lean/temporal-protocol";
import { listOpenUserTasks, readBpmnProcessTrace, readUserTaskDetail, startBpmnProcess } from "../dist/process-client.js";
import { observeTemporalProcessWork, readTemporalProcessWorkDetail } from "../dist/process-work-client.js";
import { observeTemporalProcessIncidents } from "../dist/process-operations-client.js";
import { describeTemporalDefinitionStart, prepareTemporalDefinitionStart, startPreparedTemporalDefinition } from "../dist/definition-start-client.js";
import { describeTemporalMessageStart, prepareTemporalMessageStart, startTemporalMessageStart } from "../dist/message-start-client.js";
import { createTemporalDefinitionSchedule, deleteTemporalDefinitionSchedule, describeTemporalDefinitionSchedule, pauseTemporalDefinitionSchedule } from "../dist/definition-schedule-client.js";
import { ensureCorrelationIngress } from "../dist/correlation-ingress-client.js";
import { publishTemporalCorrelatedMessage } from "../dist/correlation-publication-client.js";
import { processProgramFixture as program, processStartFixture as start } from "./process-start-fixture.ts";
import { enrollmentFixture } from "./worker-deployment-enrollment-fixture.ts";

const taskQueue = "deadline-queue";
const workflowId = "deadline-workflow";
const instanceId = start.instanceId;
const detail = { taskId: { processInstanceId: instanceId, elementId: "UserTask_1", activation: 1 }, inputVariableNames: [] };
const channel = { kind: MessageChannelKind.OperationMessage, interfaceId: "Interface", interfaceOperationId: "Operation", messageId: "Message" } as const;
const address = { definition: program.identity, processId: program.processId, channel, correlationKeyId: "Key" };
const command = { commandId: "Publication", address, payload: { kind: VariableValueKind.String, value: "value" } } as const;
const ingressRequest = { address, taskQueue, configuration: productionCorrelationIngressConfiguration };
const messageStart = { kind: StimulusKind.TriggerMessageStart, commandId: start.commandId, processId: start.processId, instanceId, startEventId: "StartEvent_1", channel } as const;
const timerStart = { kind: StimulusKind.TriggerTimerStart, commandId: start.commandId, processId: start.processId, instanceId, startEventId: "StartEvent_1" } as const;
const messageProgram: SemanticProcessProgram = {
  ...program, identity: { ...program.identity, semanticProfile: SemanticProfileId.MessageStart },
  operations: program.operations.map((operation) => operation.kind === SemanticOperationKind.Initiate
    ? { id: operation.id, origin: operation.origin, kind: SemanticOperationKind.InitiateMessage, outputs: [operation.output], channel } : operation),
};
const timerProgram: SemanticProcessProgram = {
  ...program, identity: { ...program.identity, semanticProfile: SemanticProfileId.TimerStart },
  operations: program.operations.map((operation) => operation.kind === SemanticOperationKind.Initiate
    ? { id: operation.id, origin: operation.origin, kind: SemanticOperationKind.InitiateTimer, outputs: [operation.output], timer: { durationMs: 1_000 } } : operation),
};
const directRequest = { start, semanticProcess: program, taskQueue, workflowId };
const messageRequest = { start: messageStart, semanticProcess: messageProgram, taskQueue, workflowId };
const direct = prepareTemporalDefinitionStart(directRequest);
const message = prepareTemporalMessageStart(messageRequest);
assert.equal(direct.kind, "admitted");
assert.equal(message.kind, "admitted");
if (direct.kind !== "admitted" || message.kind !== "admitted") throw new Error("Start fixtures must be admitted");

type Scenario = { name: string; rpc: "query" | "result" | "start" | "describe" | "create" | "pause" | "delete" | "update"; queryResult?: "absent" | "terminal" | "echo"; invoke: (client: never) => Promise<unknown> };
const scenarios: Scenario[] = [
  { name: "trace Query", rpc: "query", invoke: (client) => readBpmnProcessTrace(client, instanceId) },
  { name: "open-task Query", rpc: "query", invoke: (client) => listOpenUserTasks(client, instanceId) },
  { name: "task-detail Query", rpc: "query", invoke: (client) => readUserTaskDetail(client, instanceId, detail) },
  { name: "Process creation", rpc: "start", invoke: (client) => startBpmnProcess(client, start, program, { taskQueue }) },
  { name: "work Query", rpc: "query", invoke: (client) => observeTemporalProcessWork(client, workflowId, instanceId) },
  { name: "work detail Query", rpc: "query", invoke: (client) => readTemporalProcessWorkDetail(client, workflowId, instanceId, detail) },
  { name: "work absence result", rpc: "result", queryResult: "absent", invoke: (client) => observeTemporalProcessWork(client, workflowId, instanceId) },
  { name: "incident Query", rpc: "query", invoke: (client) => observeTemporalProcessIncidents(client, workflowId, instanceId) },
  { name: "incident terminal result", rpc: "result", queryResult: "terminal", invoke: (client) => observeTemporalProcessIncidents(client, workflowId, instanceId) },
  { name: "incident absence result", rpc: "result", queryResult: "absent", invoke: (client) => observeTemporalProcessIncidents(client, workflowId, instanceId) },
  { name: "prepared definition creation", rpc: "start", invoke: (client) => startPreparedTemporalDefinition(client, { ...directRequest, expectedIntent: direct.intent }) },
  { name: "definition description", rpc: "describe", invoke: (client) => describeTemporalDefinitionStart(client, workflowId) },
  { name: "Message Start creation", rpc: "start", invoke: (client) => startTemporalMessageStart(client, { ...messageRequest, expectedIntent: message.intent }) },
  { name: "Message Start description", rpc: "describe", invoke: (client) => describeTemporalMessageStart(client, workflowId) },
  { name: "Schedule creation", rpc: "create", invoke: (client) => createTemporalDefinitionSchedule(client, { scheduleId: "Schedule", configuredWorkflowId: workflowId, taskQueue, dueAtEpochMs: Date.UTC(2030, 0, 1), start: timerStart, semanticProcess: timerProgram }) },
  { name: "Schedule description", rpc: "describe", invoke: (client) => describeTemporalDefinitionSchedule(client, "Schedule") },
  { name: "Schedule pause", rpc: "pause", invoke: (client) => pauseTemporalDefinitionSchedule(client, "Schedule") },
  { name: "Schedule deletion", rpc: "delete", invoke: (client) => deleteTemporalDefinitionSchedule(client, "Schedule") },
  { name: "ingress creation", rpc: "start", queryResult: "echo", invoke: (client) => ensureCorrelationIngress(client, ingressRequest) },
  { name: "ingress echo Query", rpc: "query", invoke: (client) => ensureCorrelationIngress(client, ingressRequest) },
  { name: "publication status Query", rpc: "query", queryResult: "echo", invoke: (client) => publishTemporalCorrelatedMessage(client, { command, taskQueue, deadlineMs: 5_000 }) },
  { name: "publication Update", rpc: "update", queryResult: "echo", invoke: (client) => publishTemporalCorrelatedMessage(client, { command, taskQueue, deadlineMs: 5_000 }) },
];

for (const scenario of scenarios) {
  test(`${scenario.name} expires its transport before the public call settles`, { timeout: 5_000 }, async (context) => {
    context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000 });
    let deadline: number | undefined;
    let pending = false;
    let observedDeadline: number | undefined;
    let settle: (() => void) | undefined;
    let started: (() => void) | undefined;
    const rpcStarted = new Promise<void>((resolve) => { started = resolve; });
    const connection = {
      withDeadline: async <Value>(at: number, invoke: () => Promise<Value>) => {
        deadline = at;
        try { return await invoke(); } finally { deadline = undefined; }
      },
    };
    const rpc = async () => {
      pending = true;
      observedDeadline = deadline;
      return new Promise<never>((_resolve, reject) => {
        settle = () => { pending = false; reject(new Error("RPC deadline exceeded")); };
        if (deadline !== undefined) setTimeout(settle, deadline - Date.now());
        started?.();
      });
    };
    const client = {
      ...enrollmentFixture(taskQueue), connection,
      start: scenario.rpc === "start" ? rpc : async () => ({}),
      getHandle: () => ({
        client,
        query: async (name: string) => {
          if (scenario.queryResult === "absent") throw new WorkflowNotFoundError("missing", workflowId);
          if (scenario.queryResult === "terminal") return { instanceId, status: ProcessStatus.Completed, incidents: [] };
          if (scenario.queryResult === "echo" && name === bpmnCorrelationIngressConfigurationQueryName) return createCorrelationIngressEcho(address, productionCorrelationIngressConfiguration);
          if (scenario.rpc === "update") return { kind: CorrelationPublicationStatusKind.Absent, commandId: command.commandId, contentSha256: correlationPublicationContentSha256(command) };
          return rpc();
        },
        result: rpc, describe: rpc, executeUpdate: rpc,
      }),
      schedule: { connection, create: rpc, getHandle: () => ({ describe: rpc, pause: rpc, delete: rpc }) },
    };
    const publicResult = scenario.invoke({ ...client, workflow: client } as never).then((value) => ({ value }), (error: unknown) => ({ error }));
    await rpcStarted;
    context.mock.timers.tick(5_000);
    try {
      await publicResult;
      assert.equal(pending, false, "a returned timeout must leave no running RPC");
      assert.equal(observedDeadline, 6_000, "RPC expiry must preserve the existing budget");
    } finally {
      settle?.();
      await publicResult;
    }
  });
}
