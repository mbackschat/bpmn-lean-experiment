/**
 * Direct-VM oracle for the interrupting Activity boundary deadline against its completion Update.
 *
 * Three activation shapes separate the family's host behavior: the completion alone, the deadline
 * alone, and both in one activation. The third is the reason this uses the direct-VM harness — a
 * server decides what an activation contains, so a shared-activation race cannot be composed
 * through the ordinary runner, and the [premise witness](./event-race-sdk-activation-premise.test.ts)
 * establishes that the shape is reachable rather than hypothetical.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticOperationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import { parseWorkflowCode } from "@temporalio/worker/lib/worker.js";
import { defaultPayloadConverter } from "@temporalio/workflow";

import {
  bpmnCompleteUserTaskUpdateName,
  bpmnProcessWorkflowType,
  loadBpmnWorkflowBundle,
} from "@bpmn-lean/temporal-adapter";

import {
  requireStartedTimer,
  runDirectVmActivations,
} from "./direct-vm-activation-harness.ts";
import type {
  Activation,
  Completion,
} from "./direct-vm-activation-harness.ts";

const fixtureUrl = new URL(
  "../../../scenarios/activity-boundary-timer/process.bpmn",
  import.meta.url,
);
const boundedTaskQueue = "activity-boundary-timer-deadline";
const instanceId = "BoundedTask_deadline-witness";

/** The fixture's two follow-on User Tasks, one per route, and only one is ever open. */
const normalFollowOn = "NormalTask";
const boundaryFollowOn = "BoundaryTask";

export type BoundedActivityDeadlineWitness = Readonly<{
  activityVictoryCompletions: ReadonlyArray<Completion>;
  deadlineVictoryCompletions: ReadonlyArray<Completion>;
  crossRouteCompletions: ReadonlyArray<Completion>;
  sharedActivationCompletion: Completion;
}>;

export async function runBoundedActivityDeadlineWitness(): Promise<BoundedActivityDeadlineWitness> {
  const program = await compileBoundedProgram();
  const fixture = boundedFixture(program);
  const bundle = parseWorkflowCode((await loadBpmnWorkflowBundle()).code);
  const activate = async (
    readyJobs: NonNullable<Activation["jobs"]>,
    laterBatches: ReadonlyArray<NonNullable<Activation["jobs"]>> = [],
  ): Promise<ReadonlyArray<Completion>> =>
    runDirectVmActivations({
      bundle,
      workflowType: bpmnProcessWorkflowType,
      replaying: false,
      taskQueue: boundedTaskQueue,
      args: [
        defaultPayloadConverter.toPayload(fixture.start),
        defaultPayloadConverter.toPayload(program),
      ],
      readyJobs,
      // Arming is atomic, so the deadline's durable timer must already exist before either
      // callback is delivered. Without this the victory observations could be read from a
      // Workflow that never armed at all.
      assertInitialization: (completion) => requireStartedTimer(completion, 1),
    }, laterBatches);

  const boundedCompletion = completionUpdateJob(fixture.completion);
  const sharedActivation = await activate([boundedCompletion, deadlineTimerJob()]);
  const shared = sharedActivation[0];
  if (shared === undefined) {
    throw new TypeError("Shared-activation run produced no completion");
  }
  return {
    activityVictoryCompletions: await activate(
      [boundedCompletion],
      [[followOnCompletionJob(fixture, normalFollowOn)]],
    ),
    deadlineVictoryCompletions: await activate(
      [deadlineTimerJob()],
      [[followOnCompletionJob(fixture, boundaryFollowOn)]],
    ),
    crossRouteCompletions: await activate(
      [deadlineTimerJob()],
      [[followOnCompletionJob(fixture, normalFollowOn)]],
    ),
    sharedActivationCompletion: shared,
  };
}

function followOnCompletionJob(
  fixture: ReturnType<typeof boundedFixture>,
  elementId: string,
): NonNullable<Activation["jobs"]>[number] {
  return completionUpdateJob({
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: {
      processInstanceId: fixture.start.instanceId,
      elementId,
      activation: 1,
    },
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

function deadlineTimerJob(): NonNullable<Activation["jobs"]>[number] {
  return { fireTimer: { seq: 1 } };
}

function boundedFixture(program: SemanticProcessProgram) {
  const bounded = program.operations.find(
    (operation) => operation.kind === SemanticOperationKind.AwaitBoundedUserTask,
  );
  assert.ok(bounded?.kind === SemanticOperationKind.AwaitBoundedUserTask);
  const completion: CompleteUserTaskInstanceStimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-bounded-task",
    taskId: {
      processInstanceId: instanceId,
      elementId: bounded.task.elementId,
      activation: 1,
    },
    submittedValues: [],
  };
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-deadline-witness",
    processId: program.processId,
    instanceId,
    initialVariables: [],
  };
  return { completion, start } as const;
}

async function compileBoundedProgram(): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(fixtureUrl),
    sourceId: "activity-boundary-timer-deadline-witness",
    expectedSha256: undefined,
    semanticProfile: "bpmn-2.0.2-activity-boundary-timer-draft",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Activity boundary Timer deadline fixture was rejected");
  }
  return compilation.semanticProcess;
}
