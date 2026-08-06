/**
 * Direct-VM oracle for the non-interrupting boundary deadline against its host's completion Update.
 *
 * Three activation shapes separate the family's host behavior: the completion alone, the deadline
 * alone, and both in one activation. The third is the reason this uses the direct-VM harness — a
 * server decides what an activation contains, so a shared-activation race cannot be composed
 * through the ordinary runner, and the [premise witness](./event-race-sdk-activation-premise.test.ts)
 * establishes that the shape is reachable rather than hypothetical.
 *
 * The registered schedules cannot reach this shape either, which is why the family's scheduler is
 * otherwise indistinguishable from the generic durable-timer path: both produce the same public
 * trace for every separated order. The shared activation is the only observation that reads the
 * scheduler rather than the outcome it usually agrees on.
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
  "../../../scenarios/non-interrupting-boundary-timer/process.bpmn",
  import.meta.url,
);
const monitoredTaskQueue = "non-interrupting-boundary-timer-deadline";
const instanceId = "MonitoredTask_deadline-witness";

/** The fixture's two follow-on User Tasks. Unlike the interrupting family, both can be open. */
const normalFollowOn = "NormalTask";
const handlerFollowOn = "HandlerTask";

export type MonitoredDeadlineWitness = Readonly<{
  completionVictoryCompletions: ReadonlyArray<Completion>;
  spawnCompletions: ReadonlyArray<Completion>;
  prematureNormalRouteCompletions: ReadonlyArray<Completion>;
  sharedActivationCompletion: Completion;
}>;

export async function runMonitoredDeadlineWitness(): Promise<
  MonitoredDeadlineWitness
> {
  const program = await compileMonitoredProgram();
  const fixture = monitoredFixture(program);
  const bundle = parseWorkflowCode((await loadBpmnWorkflowBundle()).code);
  const activate = async (
    readyJobs: NonNullable<Activation["jobs"]>,
    laterBatches: ReadonlyArray<NonNullable<Activation["jobs"]>> = [],
  ): Promise<ReadonlyArray<Completion>> =>
    runDirectVmActivations({
      bundle,
      workflowType: bpmnProcessWorkflowType,
      replaying: false,
      taskQueue: monitoredTaskQueue,
      args: [
        defaultPayloadConverter.toPayload(fixture.start),
        defaultPayloadConverter.toPayload(program),
      ],
      readyJobs,
      // Arming is atomic, so the deadline's durable timer must already exist before either callback
      // is delivered. Without this the observations could be read from a Workflow that never armed.
      assertInitialization: (completion) => requireStartedTimer(completion, 1),
    }, laterBatches);

  const monitoredCompletion = completionUpdateJob(fixture.completion);
  const sharedActivation = await activate([
    monitoredCompletion,
    deadlineTimerJob(),
  ]);
  const shared = sharedActivation[0];
  if (shared === undefined) {
    throw new TypeError("Shared-activation run produced no completion");
  }
  return {
    completionVictoryCompletions: await activate(
      [monitoredCompletion],
      [[followOnCompletionJob(fixture, normalFollowOn)]],
    ),
    // Firing leaves the host open, so reaching an End Event needs both branches completed. That is
    // the whole separation from the interrupting family, whose deadline alone reaches one.
    spawnCompletions: await activate(
      [deadlineTimerJob()],
      [
        [followOnCompletionJob(fixture, handlerFollowOn)],
        [completionUpdateJob(fixture.completion)],
        [followOnCompletionJob(fixture, normalFollowOn)],
      ],
    ),
    // The spawn must not open the *normal* follow-on: that task belongs to the host's own
    // completion, which has not happened here.
    prematureNormalRouteCompletions: await activate(
      [deadlineTimerJob()],
      [[followOnCompletionJob(fixture, normalFollowOn)]],
    ),
    sharedActivationCompletion: shared,
  };
}

function followOnCompletionJob(
  fixture: ReturnType<typeof monitoredFixture>,
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

function monitoredFixture(program: SemanticProcessProgram) {
  const monitored = program.operations.find(
    (operation) =>
      operation.kind === SemanticOperationKind.AwaitMonitoredUserTask,
  );
  assert.ok(monitored?.kind === SemanticOperationKind.AwaitMonitoredUserTask);
  const completion: CompleteUserTaskInstanceStimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-monitored-task",
    taskId: {
      processInstanceId: instanceId,
      elementId: monitored.task.elementId,
      activation: 1,
    },
    submittedValues: [],
  };
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-monitored-deadline-witness",
    processId: program.processId,
    instanceId,
    initialVariables: [],
  };
  return { completion, start } as const;
}

async function compileMonitoredProgram(): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(fixtureUrl),
    sourceId: "non-interrupting-boundary-timer-deadline-witness",
    expectedSha256: undefined,
    semanticProfile: "bpmn-2.0.2-non-interrupting-boundary-timer-draft",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Non-interrupting boundary Timer fixture was rejected");
  }
  return compilation.semanticProcess;
}
