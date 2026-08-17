/** Durable cases for the operation-addressed Intermediate Catch Message profile. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnCommandIdentityConflict,
  BpmnMessageIngressInvalid,
  ProcessCommandResultKind,
  submitMessageDelivery,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";

import {
  assertExactMessageSignals,
  completedMessageResult,
  expectedWorkflowChainRecoveryEntry,
  fetchMessageHistory,
  requireMessageDelivery,
  requireMessageStart,
  startMessageWorkflow,
  waitForMessageSignalCount,
  waitForMessageState,
} from "./message-temporal-test-support.ts";
import type {
  MessageTemporalCaseContext,
} from "./message-temporal-test-support.ts";
import { assertWorkflowChainPatchHistory } from "./temporal-history-facts.ts";
import { loadJson } from "./temporal-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/intermediate-catch-message/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/intermediate-catch-message/process.bpmn",
  import.meta.url,
);
const reverseBpmnUrl = new URL(
  "../../../bpmn-source/test/fixtures/intermediate-catch-message-reverse.bpmn",
  import.meta.url,
);

export async function exerciseIntermediateCatchMessagePrimary(
  context: MessageTemporalCaseContext,
): Promise<void> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const program = await compileProgram(bpmnUrl, scenario.bpmn.id);
  const startStimulus = requireMessageStart(scenario);
  const delivery = requireMessageDelivery(scenario);
  const taskCompletion = requireCompletion(scenario);
  const handle = await startMessageWorkflow(
    context.environment,
    startStimulus,
    program,
  );
  const waitingForMessage = await waitForMessageState(
    handle,
    (state) => state.openMessageSubscriptions.length === 1,
  );
  assert.equal(waitingForMessage.openUserTasks.length, 0);

  const wrongChannel = {
    ...delivery,
    commandId: "deliver-message-wrong-channel",
    channel: {
      ...delivery.channel,
      messageId: "Message_Other",
    },
  } satisfies DeliverMessageStimulus;
  assert.deepEqual(
    await submitMessageDelivery(
      context.environment.client.workflow,
      startStimulus.instanceId,
      wrongChannel,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: wrongChannel.commandId,
      outcome: CommandOutcome.Rejected,
    },
  );
  assert.deepEqual(
    await waitForMessageState(
      handle,
      (state) => state.openMessageSubscriptions.length === 1,
    ),
    waitingForMessage,
  );

  await context.suspendWorker();
  const workerDownDelivery = submitMessageDelivery(
    context.environment.client.workflow,
    startStimulus.instanceId,
    delivery,
  );
  try {
    await waitForMessageSignalCount(handle, 2);
  } finally {
    await context.resumeWorker();
  }
  assert.deepEqual(await workerDownDelivery, {
    kind: ProcessCommandResultKind.Semantic,
    commandId: delivery.commandId,
    outcome: CommandOutcome.Committed,
  });

  const waitingForTask = await waitForMessageState(
    handle,
    (state) => state.openUserTasks.length === 1,
  );
  assert.equal(waitingForTask.openMessageSubscriptions.length, 0);
  const stale = {
    ...delivery,
    commandId: "deliver-message-stale",
  } satisfies DeliverMessageStimulus;
  assert.deepEqual(
    await submitMessageDelivery(
      context.environment.client.workflow,
      startStimulus.instanceId,
      stale,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: stale.commandId,
      outcome: CommandOutcome.Rejected,
    },
  );
  assert.deepEqual(
    await waitForMessageState(
      handle,
      (state) => state.openUserTasks.length === 1,
    ),
    waitingForTask,
  );
  assert.deepEqual(
    await submitMessageDelivery(
      context.environment.client.workflow,
      startStimulus.instanceId,
      delivery,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: delivery.commandId,
      outcome: CommandOutcome.Committed,
    },
  );

  const conflicting = {
    ...delivery,
    channel: {
      ...delivery.channel,
      messageId: "Message_Conflicting",
    },
  } satisfies DeliverMessageStimulus;
  await assert.rejects(
    submitMessageDelivery(
      context.environment.client.workflow,
      startStimulus.instanceId,
      conflicting,
    ),
    BpmnCommandIdentityConflict,
  );
  await assert.rejects(
    submitMessageDelivery(
      context.environment.client.workflow,
      startStimulus.instanceId,
      { ...delivery, extra: true },
    ),
    BpmnMessageIngressInvalid,
  );

  assert.equal(
    (
      await submitUserTaskCompletion(
        context.environment.client.workflow,
        startStimulus.instanceId,
        taskCompletion,
      )
    ).kind,
    ProcessCommandResultKind.Semantic,
  );
  const terminalResult = await completedMessageResult(handle);
  const history = await fetchMessageHistory(handle);
  assertWorkflowChainPatchHistory(history, 1);
  assert.deepEqual(terminalResult.recoveryEntries, [
    expectedWorkflowChainRecoveryEntry(
      startStimulus.instanceId,
      wrongChannel,
      CommandOutcome.Rejected,
    ),
    expectedWorkflowChainRecoveryEntry(
      startStimulus.instanceId,
      delivery,
      CommandOutcome.Committed,
    ),
    expectedWorkflowChainRecoveryEntry(
      startStimulus.instanceId,
      stale,
      CommandOutcome.Rejected,
    ),
    expectedWorkflowChainRecoveryEntry(
      startStimulus.instanceId,
      taskCompletion,
      CommandOutcome.Committed,
    ),
  ]);
  context.retainHistory(history, handle.workflowId);
  const expectedSignals = [
    wrongChannel,
    delivery,
    stale,
    delivery,
    conflicting,
  ];
  assertExactMessageSignals(history, expectedSignals);
  assert.throws(
    () =>
      assertExactMessageSignals(history, [
        { ...wrongChannel, commandId: "payload-substitution" },
        ...expectedSignals.slice(1),
      ]),
    /deep-equal/u,
  );
}

export async function exerciseIntermediateCatchMessageReverseOrder(
  context: MessageTemporalCaseContext,
): Promise<void> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const program = await compileProgram(
    reverseBpmnUrl,
    "intermediate-catch-message-reverse",
  );
  const primaryStart = requireMessageStart(scenario);
  const primaryDelivery = requireMessageDelivery(scenario);
  const primaryCompletion = requireCompletion(scenario);
  const start = {
    ...primaryStart,
    commandId: "start-reverse-message-process",
    processId: program.processId,
    instanceId: "MessageReverseInstance_1",
  } satisfies StartProcessStimulus;
  const handle = await startMessageWorkflow(
    context.environment,
    start,
    program,
  );
  const completion = {
    ...primaryCompletion,
    commandId: "complete-reverse-user-task",
    taskId: {
      ...primaryCompletion.taskId,
      processInstanceId: start.instanceId,
    },
  } satisfies CompleteUserTaskInstanceStimulus;
  assert.equal(
    (
      await submitUserTaskCompletion(
        context.environment.client.workflow,
        start.instanceId,
        completion,
      )
    ).kind,
    ProcessCommandResultKind.Semantic,
  );
  await waitForMessageState(
    handle,
    (state) => state.openMessageSubscriptions.length === 1,
  );
  const delivery = {
    ...primaryDelivery,
    commandId: "deliver-reverse-message",
    subscriptionId: {
      ...primaryDelivery.subscriptionId,
      processInstanceId: start.instanceId,
    },
  } satisfies DeliverMessageStimulus;
  assert.deepEqual(
    await submitMessageDelivery(
      context.environment.client.workflow,
      start.instanceId,
      delivery,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: delivery.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
  const terminalResult = await completedMessageResult(handle);
  assert.deepEqual(terminalResult.recoveryEntries, [
    expectedWorkflowChainRecoveryEntry(
      start.instanceId,
      completion,
      CommandOutcome.Committed,
    ),
    expectedWorkflowChainRecoveryEntry(
      start.instanceId,
      delivery,
      CommandOutcome.Committed,
    ),
  ]);
  const history = await fetchMessageHistory(handle);
  assertWorkflowChainPatchHistory(history, 1);
  context.retainHistory(history, handle.workflowId);
  assertExactMessageSignals(history, [delivery]);
}

async function compileProgram(
  url: URL,
  sourceId: string,
): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(url),
    sourceId,
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: "bpmn-2.0.2-intermediate-catch-message-draft",
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(
      `Message source was rejected: ${JSON.stringify(compilation.diagnostics)}`,
    );
  }
  return compilation.semanticProcess;
}

function requireCompletion(
  scenario: Scenario,
): CompleteUserTaskInstanceStimulus {
  const stimulus = scenario.stimuli[2];
  assert.ok(stimulus?.kind === StimulusKind.CompleteUserTaskInstance);
  return stimulus;
}
