/**
 * Direct-VM oracle for the interrupting Sub-Process boundary deadline against its child completion.
 *
 * Three activation shapes separate the family's host behavior: the child completion alone, the
 * deadline alone, and both in one activation. The third is the reason this uses the direct-VM
 * harness — a server decides what an activation contains, so a shared-activation race cannot be
 * composed through the ordinary runner, and the
 * [premise witness](./event-race-sdk-activation-premise.test.ts) establishes that the coalesced
 * shape is reachable rather than hypothetical.
 *
 * Every element identity below is derived from the committed program rather than named, so this
 * witness follows the fixture's shape instead of asserting against a second copy of it.
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
  "../../../scenarios/subprocess-boundary-timer/process.bpmn",
  import.meta.url,
);
const scopeTaskQueue = "subprocess-boundary-timer-deadline";
const instanceId = "BoundedScope_deadline-witness";

export type BoundedScopeDeadlineWitness = Readonly<{
  quiescenceVictoryCompletions: ReadonlyArray<Completion>;
  deadlineVictoryCompletions: ReadonlyArray<Completion>;
  crossRouteCompletions: ReadonlyArray<Completion>;
  sharedActivationCompletion: Completion;
}>;

export async function runBoundedScopeDeadlineWitness(): Promise<
  BoundedScopeDeadlineWitness
> {
  const program = await compileBoundedScopeProgram();
  const fixture = boundedScopeFixture(program);
  const bundle = parseWorkflowCode((await loadBpmnWorkflowBundle()).code);
  const activate = async (
    readyJobs: NonNullable<Activation["jobs"]>,
    laterBatches: ReadonlyArray<NonNullable<Activation["jobs"]>> = [],
  ): Promise<ReadonlyArray<Completion>> =>
    runDirectVmActivations({
      bundle,
      workflowType: bpmnProcessWorkflowType,
      replaying: false,
      taskQueue: scopeTaskQueue,
      args: [
        defaultPayloadConverter.toPayload(fixture.start),
        defaultPayloadConverter.toPayload(program),
      ],
      readyJobs,
      // Arming is atomic, so the parent-owned deadline must already exist before either callback is
      // delivered. Without this the victory observations could be read from a Workflow that never
      // armed the scope at all.
      assertInitialization: (completion) => requireStartedTimer(completion, 1),
    }, laterBatches);

  const childCompletion = completionUpdateJob(fixture.childCompletion);
  const sharedActivation = await activate([childCompletion, deadlineTimerJob()]);
  const shared = sharedActivation[0];
  if (shared === undefined) {
    throw new TypeError("Shared-activation run produced no completion");
  }
  return {
    quiescenceVictoryCompletions: await activate(
      [childCompletion],
      [[followOnCompletionJob(fixture.normalFollowOn)]],
    ),
    deadlineVictoryCompletions: await activate(
      [deadlineTimerJob()],
      [[followOnCompletionJob(fixture.boundaryFollowOn)]],
    ),
    crossRouteCompletions: await activate(
      [deadlineTimerJob()],
      [[followOnCompletionJob(fixture.normalFollowOn)]],
    ),
    sharedActivationCompletion: shared,
  };
}

function followOnCompletionJob(
  elementId: string,
): NonNullable<Activation["jobs"]>[number] {
  return completionUpdateJob({
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: { processInstanceId: instanceId, elementId, activation: 1 },
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

function userTaskFedBy(
  program: SemanticProcessProgram,
  placeId: string,
): string {
  const operation = program.operations.find(
    (candidate) =>
      candidate.kind === SemanticOperationKind.AwaitUserTask &&
      candidate.input === placeId,
  );
  assert.ok(operation?.kind === SemanticOperationKind.AwaitUserTask);
  return operation.task.elementId;
}

function boundedScopeFixture(program: SemanticProcessProgram) {
  const scope = program.operations.find(
    (operation) => operation.kind === SemanticOperationKind.EnterBoundedScope,
  );
  assert.ok(scope?.kind === SemanticOperationKind.EnterBoundedScope);
  const completion = program.operations.find(
    (operation) =>
      operation.kind === SemanticOperationKind.CompleteScope &&
      operation.scopeId === scope.childScopeId,
  );
  assert.ok(completion?.kind === SemanticOperationKind.CompleteScope);
  // The scope's normal outgoing Flow is the child scope completion's parent output, which is the
  // only place the quiescence route can reach; the deadline route reaches the boundary output.
  assert.notEqual(completion.parentOutput, null);
  const normalOutput = completion.parentOutput ?? "";
  const childCompletion: CompleteUserTaskInstanceStimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-bounded-child-task",
    taskId: {
      processInstanceId: instanceId,
      elementId: userTaskFedBy(program, scope.childEntry),
      activation: 1,
    },
    submittedValues: [],
  };
  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-bounded-scope-deadline-witness",
    processId: program.processId,
    instanceId,
    initialVariables: [],
  };
  return {
    childCompletion,
    start,
    normalFollowOn: userTaskFedBy(program, normalOutput),
    boundaryFollowOn: userTaskFedBy(program, scope.boundaryTimer.output),
  } as const;
}

async function compileBoundedScopeProgram(): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(fixtureUrl),
    sourceId: "subprocess-boundary-timer-deadline-witness",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: "bpmn-2.0.2-subprocess-boundary-timer-draft",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Sub-Process boundary Timer deadline fixture was rejected");
  }
  return compilation.semanticProcess;
}
