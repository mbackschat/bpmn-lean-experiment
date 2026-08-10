/** Proves exact Message Start identity is admitted before any Temporal Workflow creation. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  MessageChannelKind,
  SemanticCheckpointProfileId,
  SemanticOperationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
  TriggerMessageStartStimulus,
} from "@bpmn-lean/semantic-core";
import type { WorkflowClient } from "@temporalio/client";

import {
  BpmnProcessStartResultKind,
  startBpmnProcess,
} from "@bpmn-lean/temporal-client";

const sourceUrl = new URL(
  "../../../bpmn-source/test/fixtures/message-start-event.bpmn",
  import.meta.url,
);

test("rejects a wrong Interface Operation before creating a Workflow", async () => {
  const program = await compileProgram();
  const operation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.InitiateMessage,
  );
  assert.equal(operation?.kind, SemanticOperationKind.InitiateMessage);
  if (operation?.kind !== SemanticOperationKind.InitiateMessage) {
    throw new TypeError("Message Start compilation lost initiation");
  }
  const exact = {
    kind: StimulusKind.TriggerMessageStart,
    commandId: "trigger-message-start",
    processId: program.processId,
    instanceId: "MessageStartInstance_1",
    startEventId: operation.origin.elementId,
    channel: operation.channel,
  } as const satisfies TriggerMessageStartStimulus;
  const wrongOperation = {
    ...exact,
    channel: {
      ...exact.channel,
      interfaceOperationId: "Operation_Other",
    },
  } as const satisfies TriggerMessageStartStimulus;
  const temporal = recordingClient();

  const rejected = await startBpmnProcess(
    temporal.client,
    wrongOperation,
    program,
    { taskQueue: "message-start-task-queue" },
  );
  assert.equal(rejected.kind, BpmnProcessStartResultKind.Rejected);
  assert.equal(temporal.starts.length, 0);

  await startAfterMessageNameOnlyAdmission(
    temporal.client,
    wrongOperation,
    program,
  );
  assert.equal(temporal.starts.length, 1);

  const started = await startBpmnProcess(
    temporal.client,
    exact,
    program,
    { taskQueue: "message-start-task-queue" },
  );
  assert.equal(started.kind, BpmnProcessStartResultKind.Started);
  assert.equal(temporal.starts.length, 2);
  assert.deepEqual(
    temporal.starts[1]?.options.args,
    [exact, program],
  );
});

async function compileProgram(): Promise<SemanticProcessProgram> {
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(sourceUrl),
    sourceId: "message-start-event",
    expectedSha256: undefined,
    semanticProfile: SemanticCheckpointProfileId.MessageStart,
    sourceOverlay: null,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("Message Start fixture was not accepted");
  }
  return result.semanticProcess;
}

type RecordedStart = Readonly<{
  workflowType: unknown;
  options: Readonly<{
    args: readonly unknown[];
  }>;
}>;

function recordingClient(): Readonly<{
  client: WorkflowClient;
  starts: RecordedStart[];
}> {
  const starts: RecordedStart[] = [];
  const client = {
    start: async (workflowType: unknown, options: RecordedStart["options"]) => {
      starts.push({ workflowType, options });
      return Object.freeze({ workflowId: "recorded-workflow" });
    },
  } as unknown as WorkflowClient;
  return { client, starts };
}

async function startAfterMessageNameOnlyAdmission(
  client: WorkflowClient,
  start: TriggerMessageStartStimulus,
  program: SemanticProcessProgram,
): Promise<void> {
  const initiation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.InitiateMessage,
  );
  if (
    initiation?.kind !== SemanticOperationKind.InitiateMessage ||
    initiation.channel.kind !== MessageChannelKind.OperationMessage ||
    initiation.channel.messageId !== start.channel.messageId ||
    initiation.channel.interfaceId !== start.channel.interfaceId
  ) {
    return;
  }
  await client.start("bpmn-process", {
    taskQueue: "message-start-task-queue",
    workflowId: start.instanceId,
    args: [start, program],
  });
}
