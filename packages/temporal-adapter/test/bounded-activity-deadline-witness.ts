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
  commands,
  requireStartedTimer,
  runDirectVmActivations,
  workflowFailureType,
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

/** Requires the route to have reached its own End Event. */
export function requireRouteCompleted(
  completions: ReadonlyArray<Completion>,
): void {
  assert.equal(reachedCompletion(completions), true);
}

/** Requires the other route's follow-on Task to have never opened. */
export function requireRouteNotTaken(
  completions: ReadonlyArray<Completion>,
): void {
  assert.equal(reachedCompletion(completions), false);
}

function reachedCompletion(
  completions: ReadonlyArray<Completion>,
): boolean {
  return completions.some((completion) =>
    commands(completion).some(
      ({ completeWorkflowExecution }) => completeWorkflowExecution !== undefined,
    )
  );
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

/** Requires the host to have refused rather than selected a winner. */
export function requireNoWinnerSelected(
  completion: Completion,
  failureType: string,
): void {
  assert.equal(workflowFailureType(completion), failureType);
  // A refusal that had already cancelled the deadline would have committed a victory first.
  assert.equal(
    commands(completion).some(({ cancelTimer }) => cancelTimer !== undefined),
    false,
  );
}

/**
 * Requires the Activity's own completion to have withdrawn its durable deadline.
 *
 * This is the host half of the capsule's withdrawal claim. Its counterpart below must stay
 * separate: a deadline that fired was never withdrawn, so asserting withdrawal on both routes
 * would assert nothing about either.
 */
export function requireDeadlineWithdrawn(
  completions: ReadonlyArray<Completion>,
): void {
  assert.equal(cancelledDeadline(completions), true);
}

/** Requires the winning deadline not to have been cancelled, since it fired instead. */
export function requireDeadlineNotWithdrawn(
  completions: ReadonlyArray<Completion>,
): void {
  assert.equal(cancelledDeadline(completions), false);
}

function cancelledDeadline(completions: ReadonlyArray<Completion>): boolean {
  return completions.some((completion) =>
    commands(completion).some(({ cancelTimer }) => cancelTimer?.seq === 1)
  );
}

/**
 * Requires the refused completion Update to have been answered rather than left silent.
 *
 * This is the command-level half of the preflight's durable-resolution obligation. The refusal
 * carries an in-flight Update, and the two ways it could go wrong are opposite: no response at all
 * would strand the caller, while a `completed` response would mean the host had chosen a winner
 * after all. The assertions below reject both.
 *
 * What this does *not* establish: that a client awaiting the Update observes the failure. That is a
 * server-side fact and needs the real Temporal service, so it remains outstanding.
 */
export function requireRefusedUpdateAnswered(completion: Completion): void {
  const responses = commands(completion).flatMap(({ updateResponse }) =>
    updateResponse === undefined || updateResponse === null ? [] : [updateResponse]
  );
  assert.equal(responses.length, 1);
  assert.notEqual(responses[0]?.accepted, undefined);
  // The refusal is non-retryable, so no later attempt can produce this result either.
  assert.equal(responses[0]?.completed, undefined);
  assert.equal(responses[0]?.rejected, undefined);
}

/** Requires no activation in the run to have failed. */
export function requireNoHostFailure(
  completions: ReadonlyArray<Completion>,
): void {
  for (const completion of completions) {
    assert.equal(workflowFailureType(completion), undefined);
  }
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
