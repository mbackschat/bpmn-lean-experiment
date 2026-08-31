/** Direct-VM witness for one interrupting Message boundary racing its host task's completion. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  ACTIVITY_BOUNDARY_MESSAGE_CHECKPOINT_PROFILE_ID,
  SemanticOperationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import { parseWorkflowCode } from "@temporalio/worker/lib/worker.js";
import { defaultPayloadConverter } from "@temporalio/workflow";

import {
  bpmnCompleteUserTaskUpdateName,
  bpmnDeliverMessageSignalName,
  bpmnProcessWorkflowType,
  loadBpmnWorkflowBundle,
} from "@bpmn-lean/temporal-testkit";

import {
  commands,
  runDirectVmActivations,
  workflowFailureType,
} from "./direct-vm-activation-harness.ts";
import type {
  Activation,
  Completion,
} from "./direct-vm-activation-harness.ts";

const fixtureUrl = new URL(
  "../../../../scenarios/activity-boundary-message/process.bpmn",
  import.meta.url,
);
const taskQueue = "activity-boundary-message-readiness";
const instanceId = "ActivityBoundaryMessage_readiness-witness";

export type ActivityBoundaryMessageTemporalWitness = Readonly<{
  taskVictoryCompletions: ReadonlyArray<Completion>;
  messageVictoryCompletions: ReadonlyArray<Completion>;
  sharedActivationCompletion: Completion;
}>;

export async function runActivityBoundaryMessageTemporalWitness(): Promise<ActivityBoundaryMessageTemporalWitness> {
  const program = await compileProgram();
  const fixture = createFixture(program);
  const bundle = parseWorkflowCode((await loadBpmnWorkflowBundle()).code);
  const activate = async (
    readyJobs: NonNullable<Activation["jobs"]>,
    laterBatches: ReadonlyArray<NonNullable<Activation["jobs"]>> = [],
  ): Promise<ReadonlyArray<Completion>> =>
    runDirectVmActivations({
      bundle,
      workflowType: bpmnProcessWorkflowType,
      replaying: false,
      taskQueue,
      args: [
        defaultPayloadConverter.toPayload(fixture.start),
        defaultPayloadConverter.toPayload(program),
      ],
      readyJobs,
      assertInitialization: (completion) => {
        assert.equal(completion.failed, undefined);
        assert.equal(workflowFailureType(completion), undefined);
        assert.equal(commands(completion).some(
          ({ completeWorkflowExecution }) =>
            completeWorkflowExecution !== undefined,
        ), false);
      },
    }, laterBatches);

  const shared = await activate([
    messageSignalJob(fixture.delivery),
    completionUpdateJob(fixture.completion),
  ]);
  const sharedActivationCompletion = shared[0];
  if (sharedActivationCompletion === undefined) {
    throw new TypeError("Shared Message/completion activation produced no completion");
  }
  return {
    taskVictoryCompletions: await activate(
      [completionUpdateJob(fixture.completion)],
      [[followOnCompletionJob(fixture.start.instanceId, "RecordReviewCompletion")]],
    ),
    messageVictoryCompletions: await activate(
      [messageSignalJob(fixture.delivery)],
      [[followOnCompletionJob(fixture.start.instanceId, "HandleWithdrawal")]],
    ),
    sharedActivationCompletion,
  };
}

function createFixture(program: SemanticProcessProgram) {
  const bounded = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitMessageBoundedUserTask,
  );
  assert.ok(bounded?.kind === SemanticOperationKind.AwaitMessageBoundedUserTask);
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-activity-boundary-message-readiness",
    processId: program.processId,
    instanceId,
    initialVariables: [],
  };
  const completion: CompleteUserTaskInstanceStimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-review-activity",
    taskId: {
      processInstanceId: instanceId,
      elementId: bounded.task.elementId,
      activation: 1,
    },
    submittedValues: [],
  };
  const delivery: DeliverMessageStimulus = {
    kind: StimulusKind.DeliverMessage,
    commandId: "deliver-application-withdrawal",
    subscriptionId: {
      processInstanceId: instanceId,
      elementId: bounded.boundaryMessage.elementId,
      activation: 1,
    },
    channel: bounded.boundaryMessage.channel,
  };
  return { start, completion, delivery } as const;
}

function followOnCompletionJob(
  processInstanceId: string,
  elementId: string,
): NonNullable<Activation["jobs"]>[number] {
  return completionUpdateJob({
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: { processInstanceId, elementId, activation: 1 },
    submittedValues: [],
  });
}

function completionUpdateJob(
  stimulus: CompleteUserTaskInstanceStimulus,
): NonNullable<Activation["jobs"]>[number] {
  return {
    doUpdate: {
      id: stimulus.commandId,
      protocolInstanceId: stimulus.commandId,
      name: bpmnCompleteUserTaskUpdateName,
      input: [defaultPayloadConverter.toPayload(stimulus)],
      runValidator: false,
    },
  };
}

function messageSignalJob(
  stimulus: DeliverMessageStimulus,
): NonNullable<Activation["jobs"]>[number] {
  return {
    signalWorkflow: {
      signalName: bpmnDeliverMessageSignalName,
      input: [defaultPayloadConverter.toPayload(stimulus)],
    },
  };
}

async function compileProgram(): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(fixtureUrl),
    sourceId: "activity-boundary-message-temporal-readiness",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: ACTIVITY_BOUNDARY_MESSAGE_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Activity boundary Message fixture was rejected");
  }
  return compilation.semanticProcess;
}
