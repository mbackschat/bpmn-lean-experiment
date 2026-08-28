/** Direct-VM witness for one outer Timer across the complete parallel child set. */
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
  bpmnExecutionPublicationQueryName,
  bpmnFlowNodeOccurrencesQueryName,
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

const taskQueue = "parallel-multi-instance-deadline";
const instanceId = "ParallelMultiInstance_deadline-witness";

type DirectVmActivationJob = NonNullable<Activation["jobs"]>[number];
type DirectVmQueryActivationJob = DirectVmActivationJob & {
  variant: "queryWorkflow";
};

export type ParallelMultiInstanceDeadlineWitness = Readonly<{
  naturalCompletions: ReadonlyArray<Completion>;
  interruptedCompletions: ReadonlyArray<Completion>;
  sharedActivationCompletion: Completion;
}>;

export type ParallelMultiInstanceFirstFifoRun = Readonly<{
  stimuli: readonly [
    CompleteUserTaskInstanceStimulus,
    CompleteUserTaskInstanceStimulus,
  ];
  updateIds: readonly [string, string];
  mutationCompletion: Completion;
  publicationCompletion: Completion;
}>;

export async function runParallelMultiInstanceDeadlineWitness(): Promise<ParallelMultiInstanceDeadlineWitness> {
  const program = await compileProgram();
  const fixture = parallelFixture(program);
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

  const firstCompletion = completionUpdateJob(fixture.reviewCompletion(1, "accepted-alpha"));
  const secondCompletion = completionUpdateJob(fixture.reviewCompletion(2, "accepted-beta"));
  const thirdCompletion = completionUpdateJob(fixture.reviewCompletion(3, "accepted-gamma"));
  const shared = await activate([firstCompletion, deadlineTimerJob()]);
  const sharedActivationCompletion = shared[0];
  if (sharedActivationCompletion === undefined) {
    throw new TypeError("Shared parallel Multi-Instance activation produced no completion");
  }

  return {
    naturalCompletions: await activate(
      [thirdCompletion],
      [[firstCompletion], [secondCompletion]],
    ),
    interruptedCompletions: await activate(
      [firstCompletion],
      [
        [deadlineTimerJob()],
        [secondCompletion],
        [completionUpdateJob(fixture.escalationCompletion)],
      ],
    ),
    sharedActivationCompletion,
  };
}

/** Runs both exact FIFO orders and reads the retained aligned E1/E2 publications before disposal. */
export async function runParallelMultiInstanceFirstFifoWitness(): Promise<
  readonly [ParallelMultiInstanceFirstFifoRun, ParallelMultiInstanceFirstFifoRun]
> {
  const program = await compileProgram();
  const fixture = parallelFixture(program, "first");
  const bundle = parseWorkflowCode((await loadBpmnWorkflowBundle()).code);
  const first = fixture.reviewCompletion(1, "accepted");
  const second = fixture.reviewCompletion(2, "accepted");
  const run = async (
    stimuli: readonly [
      CompleteUserTaskInstanceStimulus,
      CompleteUserTaskInstanceStimulus,
    ],
  ): Promise<ParallelMultiInstanceFirstFifoRun> => {
    const completions = await runDirectVmActivations({
      bundle,
      workflowType: bpmnProcessWorkflowType,
      replaying: false,
      taskQueue,
      args: [
        defaultPayloadConverter.toPayload(fixture.start),
        defaultPayloadConverter.toPayload(program),
      ],
      readyJobs: stimuli.map(completionUpdateJob),
      assertInitialization: requireOneLifetimeTimer,
    }, [publicationQueryJobs()]);
    const [mutationCompletion, publicationCompletion] = completions;
    if (mutationCompletion === undefined || publicationCompletion === undefined) {
      throw new TypeError("Parallel Multi-Instance FIFO witness lost an activation completion");
    }
    return {
      stimuli,
      updateIds: stimuli.map(contentBoundUpdateId) as [string, string],
      mutationCompletion,
      publicationCompletion,
    };
  };
  return Promise.all([
    run([first, second]),
    run([second, first]),
  ]);
}

function requireOneLifetimeTimer(completion: Completion): void {
  const timers = commands(completion).flatMap(({ startTimer }) =>
    startTimer === undefined || startTimer === null ? [] : [startTimer]
  );
  assert.equal(timers.length, 1);
  assert.equal(timers[0]?.seq, 1);
  const timeout = timers[0]?.startToFireTimeout;
  assert.ok(timeout !== undefined && timeout !== null);
  assert.equal(Number(timeout.seconds), 1);
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

function publicationQueryJobs(): NonNullable<Activation["jobs"]> {
  const request = defaultPayloadConverter.toPayload({ afterRevision: 0 });
  // The query-only VM path bypasses protobuf conversion, so it needs the oneof discriminant that
  // conversion adds at runtime but the generated IWorkflowActivationJob interface omits.
  const jobs: DirectVmQueryActivationJob[] = [
    {
      variant: "queryWorkflow",
      queryWorkflow: {
        queryId: "parallel-first-e1",
        queryType: bpmnExecutionPublicationQueryName,
        arguments: [request],
        headers: {},
      },
    },
    {
      variant: "queryWorkflow",
      queryWorkflow: {
        queryId: "parallel-first-e2",
        queryType: bpmnFlowNodeOccurrencesQueryName,
        arguments: [request],
        headers: {},
      },
    },
  ];
  return jobs;
}

function parallelFixture(
  program: SemanticProcessProgram,
  completionPolicy: "all" | "first" = "all",
) {
  const operation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask,
  );
  assert.ok(operation?.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask);
  const reviewCompletion = (
    activation: number,
    result: string,
  ): CompleteUserTaskInstanceStimulus => ({
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-parallel-review-${String(activation)}`,
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
    commandId: "complete-parallel-escalation",
    taskId: {
      processInstanceId: instanceId,
      elementId: "UserTask_Escalation",
      activation: 1,
    },
    submittedValues: [],
  };
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-parallel-multi-instance-deadline-witness",
    processId: program.processId,
    instanceId,
    initialVariables: [{
      name: operation.data.input.dataObjectReferenceId,
      value: {
        kind: VariableValueKind.StringList,
        value: ["alpha", "beta", "gamma"],
      },
    }, {
      name: "completionPolicy",
      value: { kind: VariableValueKind.String, value: completionPolicy },
    }],
  };
  return { escalationCompletion, reviewCompletion, start } as const;
}

async function compileProgram(): Promise<SemanticProcessProgram> {
  const sequential = await readFile(new URL(
    "../../../bpmn-source/test/fixtures/sequential-multi-instance-user-task.bpmn",
    import.meta.url,
  ), "utf8");
  const parallel = sequential
    .replace("Definitions_SequentialMultiInstanceReview", "Definitions_ParallelMultiInstanceReview")
    .replace(
      "https://bpmn-lean.org/scenarios/sequential-multi-instance-review",
      "https://bpmn-lean.org/scenarios/parallel-multi-instance-review",
    )
    .replace(
      'targetNamespace="https://bpmn-lean.org/scenarios/parallel-multi-instance-review">',
      [
        'targetNamespace="https://bpmn-lean.org/scenarios/parallel-multi-instance-review"',
        '  expressionLanguage="urn:bpmn-lean:expression:simple-boolean:v1">',
      ].join("\n"),
    )
    .replace("Process_SequentialMultiInstanceReview", "Process_ParallelMultiInstanceReview")
    .replace('isSequential="true"', 'isSequential="false"')
    .replace(
      "      </bpmn:multiInstanceLoopCharacteristics>",
      [
        '        <bpmn:completionCondition xsi:type="bpmn:tFormalExpression">stringEquals(completionPolicy,"first")</bpmn:completionCondition>',
        "      </bpmn:multiInstanceLoopCharacteristics>",
      ].join("\n"),
    );
  const compilation = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(parallel),
    sourceId: "parallel-multi-instance-deadline-witness",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: "bpmn-2.0.2-parallel-multi-instance-user-task-draft",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(
    compilation.status,
    BpmnCompilationStatus.Accepted,
    compilation.status === BpmnCompilationStatus.Rejected
      ? JSON.stringify(compilation.diagnostics)
      : undefined,
  );
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Parallel Multi-Instance deadline fixture was rejected");
  }
  return compilation.semanticProcess;
}
