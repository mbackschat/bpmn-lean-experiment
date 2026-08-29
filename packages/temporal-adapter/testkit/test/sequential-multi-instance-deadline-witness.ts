/** Direct-VM witness for one outer-lifetime Timer across sequential task turnover. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
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
  contentBoundUpdateId,
  loadBpmnWorkflowBundle,
} from "@bpmn-lean/temporal-testkit";

import {
  commands,
  runDirectVmActivations,
} from "./direct-vm-activation-harness.ts";
import type {
  Activation,
  Completion,
} from "./direct-vm-activation-harness.ts";

const fixtureUrl = new URL(
  "../../../../scenarios/sequential-multi-instance/process.bpmn",
  import.meta.url,
);
const taskQueue = "sequential-multi-instance-deadline";
const instanceId = "SequentialMultiInstance_deadline-witness";

export type SequentialMultiInstanceDeadlineWitness = Readonly<{
  naturalCompletions: ReadonlyArray<Completion>;
  interruptedCompletions: ReadonlyArray<Completion>;
  sharedActivationCompletion: Completion;
}>;

export async function runSequentialMultiInstanceDeadlineWitness(): Promise<SequentialMultiInstanceDeadlineWitness> {
  const program = await compileProgram();
  const fixture = sequentialFixture(program);
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
      assertInitialization: requireOneLifetimeTimer,
    }, laterBatches);

  const firstCompletion = completionUpdateJob(fixture.reviewCompletion(1, "accepted"));
  const secondCompletion = completionUpdateJob(fixture.reviewCompletion(2, "archived"));
  const shared = await activate(
    [firstCompletion],
    [[secondCompletion, deadlineTimerJob()]],
  );
  const sharedActivationCompletion = shared[1];
  if (sharedActivationCompletion === undefined) {
    throw new TypeError("Shared sequential Multi-Instance activation produced no completion");
  }

  return {
    naturalCompletions: await activate(
      [firstCompletion],
      [[secondCompletion]],
    ),
    interruptedCompletions: await activate(
      [firstCompletion],
      [
        [deadlineTimerJob()],
        [completionUpdateJob(fixture.reviewCompletion(2, "must-not-publish"))],
        [completionUpdateJob(fixture.escalationCompletion)],
      ],
    ),
    sharedActivationCompletion,
  };
}

function requireOneLifetimeTimer(completion: Completion): void {
  const timers = commands(completion).flatMap(({ startTimer }) =>
    startTimer === undefined || startTimer === null ? [] : [startTimer]
  );
  assert.equal(timers.length, 1);
  assert.equal(timers[0]?.seq, 1);
  const timeout = timers[0]?.startToFireTimeout;
  assert.ok(timeout !== undefined && timeout !== null);
  assert.equal(Number(timeout.seconds), 5);
  assert.equal(timeout.nanos ?? 0, 0);
}

function completionUpdateJob(
  stimulus: CompleteUserTaskInstanceStimulus,
): NonNullable<Activation["jobs"]>[number] {
  const updateId = contentBoundUpdateId(stimulus);
  return {
    doUpdate: {
      id: updateId,
      protocolInstanceId: updateId,
      name: bpmnCompleteUserTaskUpdateName,
      input: [defaultPayloadConverter.toPayload(stimulus)],
      runValidator: false,
    },
  };
}

function deadlineTimerJob(): NonNullable<Activation["jobs"]>[number] {
  return { fireTimer: { seq: 1 } };
}

function sequentialFixture(program: SemanticProcessProgram) {
  const operation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  assert.ok(
    operation?.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  const reviewCompletion = (
    activation: number,
    result: string,
  ): CompleteUserTaskInstanceStimulus => ({
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-review-${String(activation)}`,
    taskId: {
      processInstanceId: instanceId,
      elementId: operation.task.elementId,
      activation,
    },
    submittedValues: [{
      name: operation.data.output.taskDataOutputId,
      value: { kind: VariableValueKind.String, value: result },
    }],
  });
  const escalationCompletion: CompleteUserTaskInstanceStimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-escalation",
    taskId: {
      processInstanceId: instanceId,
      elementId: "UserTask_Escalation",
      activation: 1,
    },
    submittedValues: [],
  };
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-sequential-multi-instance-deadline-witness",
    processId: program.processId,
    instanceId,
    initialVariables: [{
      name: operation.data.input.dataObjectReferenceId,
      value: {
        kind: VariableValueKind.StringList,
        value: ["contract", "invoice"],
      },
    }],
  };
  return { escalationCompletion, reviewCompletion, start } as const;
}

async function compileProgram(): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(fixtureUrl),
    sourceId: "sequential-multi-instance-deadline-witness",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Sequential Multi-Instance deadline fixture was rejected");
  }
  return compilation.semanticProcess;
}
