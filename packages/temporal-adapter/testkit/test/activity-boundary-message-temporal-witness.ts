/** Direct-VM witness for one interrupting Message boundary racing its host task's completion. */
import assert from "node:assert/strict";
import type {
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
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
import {
  activityBoundaryMessageFixture,
  compileActivityBoundaryMessageProgram,
} from "./activity-boundary-message-temporal-support.ts";

const taskQueue = "activity-boundary-message-readiness";

export type ActivityBoundaryMessageTemporalWitness = Readonly<{
  taskVictoryCompletions: ReadonlyArray<Completion>;
  messageVictoryCompletions: ReadonlyArray<Completion>;
  sharedActivationCompletion: Completion;
}>;

export async function runActivityBoundaryMessageTemporalWitness(): Promise<ActivityBoundaryMessageTemporalWitness> {
  const program = await compileActivityBoundaryMessageProgram(
    "activity-boundary-message-temporal-readiness",
  );
  const fixture = activityBoundaryMessageFixture(program, "readiness-witness");
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
      [[completionUpdateJob(fixture.normalFollowOn)]],
    ),
    messageVictoryCompletions: await activate(
      [messageSignalJob(fixture.delivery)],
      [[completionUpdateJob(fixture.boundaryFollowOn)]],
    ),
    sharedActivationCompletion,
  };
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
