import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  deployProcess,
  initialState,
  isWellFormedStimulus,
} from "@bpmn-lean/semantic-core";
import type { CompleteUserTaskInstanceStimulus, RetryIncidentStimulus, Stimulus } from "@bpmn-lean/semantic-core";
import {
  ExecutionPublicationResultKind,
  WorkflowChainBudgetKind,
  bpmnCompleteUserTaskUpdateName,
  bpmnDeliverMessageSignalName,
  bpmnExecutionPublicationQueryName,
  bpmnFlowNodeOccurrencesQueryName,
  bpmnProcessWorkflowType,
  bpmnRetryEffectIncidentUpdateName,
  bpmnTraceQueryName,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  bpmnWorkflowChainCommandRecoveryQueryName,
  bpmnWorkflowRolloverInProgressFailureType,
  buildWorkflowChainRecoveryRequest,
  productionBpmnWorkflowInitialHostInput,
  requireExecutionPublicationResult,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import type { MessageDeliveryStimulus } from "@bpmn-lean/temporal-protocol";
import { loadBpmnWorkflowBundle } from "@bpmn-lean/temporal-testkit";
import {
  WorkflowChainCapacityState,
  WorkflowChainFenceState,
  WorkflowCommandCapacityState,
  WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryPreflightKind,
  validateWorkflowChainUpdate,
} from "@bpmn-lean/temporal-workflow";
import type { WorkflowChainRuntime } from "@bpmn-lean/temporal-workflow";
import { parseWorkflowCode } from "@temporalio/worker/lib/worker.js";
import { ApplicationFailure, defaultPayloadConverter } from "@temporalio/workflow";

import {
  activityBoundaryMessageFixture,
  compileActivityBoundaryMessageProgram,
} from "./activity-boundary-message-temporal-support.ts";
import { commands, runDirectVmActivations, workflowFailureType } from "./direct-vm-activation-harness.ts";
import type { Activation, Completion } from "./direct-vm-activation-harness.ts";

type Job = NonNullable<Activation["jobs"]>[number];
type Failure = NonNullable<NonNullable<ReturnType<typeof commands>[number]["failWorkflowExecution"]>["failure"]>;
type OversizedField = "commandId" | "stringPayload";
const bundle = loadBpmnWorkflowBundle().then(({ code }) => parseWorkflowCode(code));
const compiledProgram = compileActivityBoundaryMessageProgram("oversized-command-ingress");
const oversizedString = "x".repeat(300 * 1024);

for (const field of ["commandId", "stringPayload"] as const) {
  test(`Signal ${field} overflow retains typed capacity before recovery hashing or a pair callback`, async () => {
    const setup = await fixture(`signal-${field}`);
    const stimulus: MessageDeliveryStimulus = field === "commandId"
      ? { ...setup.model.delivery, commandId: oversizedString }
      : {
          ...setup.model.delivery,
          kind: StimulusKind.DeliverPayloadMessage,
          payload: { kind: VariableValueKind.String, value: oversizedString },
        };
    assert.equal(isWellFormedStimulus(stimulus), true);
    const [seed, before, refused, after] = await activate(setup, [
      [updateJob(setup.seed, "seed")],
      setup.queries,
      [signalJob(stimulus), signalJob({ ...stimulus, commandId: `${stimulus.commandId}x` })],
      setup.queries,
    ]);
    requireUpdateOutcome(seed, CommandOutcome.Rejected);
    assertBaseline(setup, before);
    assert.ok(refused);
    assert.equal(refused.failed, undefined);
    const failure = commands(refused).find(({ failWorkflowExecution }) => failWorkflowExecution)?.failWorkflowExecution?.failure;
    assert.ok(failure);
    requireCapacityFailure(failure, stimulus, setup, publicRevision(setup, before));
    assertNoOwnedCommands(refused);
    assert.deepEqual(snapshot(after), snapshot(before));
  });

  test(`Update ${field} overflow refuses without mutation and leaves bounded work recoverable`, async () => {
    const setup = await fixture(`update-${field}`);
    const stimulus = oversizedCompletion(setup.model.completion, field);
    assert.equal(isWellFormedStimulus(stimulus), true);
    const conflict = {
      ...setup.model.completion,
      taskId: { ...setup.model.completion.taskId, activation: 2 },
    };
    const [seed, before, refused, after, completed, committed, retried, conflicted, final] = await activate(setup, [
      [updateJob(setup.seed, "seed")],
      setup.queries,
      [updateJob(stimulus, "oversized")],
      setup.queries,
      [updateJob(setup.model.completion, "bounded")],
      setup.queries,
      [updateJob(setup.model.completion, "retry")],
      [updateJob(conflict, "conflict")],
      setup.queries,
    ]);
    requireUpdateOutcome(seed, CommandOutcome.Rejected);
    assertBaseline(setup, before);
    requireSuccessful(refused);
    const responses = Array.from(commands(refused)).flatMap(({ updateResponse }) => updateResponse ? [updateResponse] : []);
    assert.equal(responses.length, 1, "validator refusal must emit no Update acceptance");
    const failure = responses[0]?.rejected;
    assert.ok(failure);
    requireCapacityFailure(failure, stimulus, setup, publicRevision(setup, before));
    assert.deepEqual(snapshot(after), snapshot(before));
    requireUpdateOutcome(completed, CommandOutcome.Committed);
    requireUpdateOutcome(retried, CommandOutcome.Committed);
    requireSuccessful(conflicted);
    const conflictFailure = commands(conflicted).find(({ updateResponse }) => updateResponse?.rejected)?.updateResponse?.rejected;
    assert.equal(conflictFailure?.applicationFailureInfo?.type, "BpmnCommandIdentityConflict");
    assert.deepEqual(snapshot(final), snapshot(committed));
    const step = advanceScenario(setup.program, setup.started.state, setup.model.completion);
    assert.equal(step.kind, ScenarioStepKind.Committed);
    assert.deepEqual(snapshot(committed).trace, [...setup.expectedTrace, ...step.observations]);
    assert.ok(publicRevision(setup, committed) > publicRevision(setup, before));
    for (const completion of [refused, completed, retried, conflicted]) {
      assertNoOwnedCommands(completion);
    }
  });

  test(`${field} raw preflight covers active and terminal recovery while preserving rollover and legacy precedence`, async () => {
    const setup = await fixture(`fence-${field}`);
    const runtime = workflowChain(setup.model.start.instanceId);
    const admission = runtime.recovery.preflight(setup.model.completion);
    assert.equal(admission.kind, WorkflowCommandRecoveryPreflightKind.Admitted);
    if (admission.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
      assert.fail("bounded command must fit recovery");
    }
    runtime.recovery.record(admission.admission, CommandOutcome.Committed);
    const before = { recovery: runtime.recovery.snapshot(), capacity: runtime.commandCapacity.snapshot() };
    const stimulus = oversizedCompletion(setup.model.completion, field);
    for (const fence of [WorkflowChainFenceState.Active, WorkflowChainFenceState.Terminal]) {
      assert.throws(() => validateWorkflowChainUpdate(runtime, fence, stimulus, 7), (error: unknown) => {
        assert.ok(error instanceof ApplicationFailure);
        assert.equal(error.type, bpmnWorkflowChainCapacityExhaustedFailureType);
        assert.equal(error.nonRetryable, true);
        assert.deepEqual(error.details, [capacityDetails(stimulus, setup, 7)]);
        return true;
      });
      assert.equal(runtime.capacity.pendingFailure(), null);
      assert.deepEqual({ recovery: runtime.recovery.snapshot(), capacity: runtime.commandCapacity.snapshot() }, before);
    }
    assert.throws(() => validateWorkflowChainUpdate(runtime, WorkflowChainFenceState.Rollover, stimulus, 7), (error: unknown) =>
      error instanceof ApplicationFailure && error.type === bpmnWorkflowRolloverInProgressFailureType && !error.nonRetryable);
    assert.doesNotThrow(() => validateWorkflowChainUpdate(null, WorkflowChainFenceState.Active, stimulus, 7));
  });
}

async function fixture(suffix: string) {
  const program = await compiledProgram;
  const model = activityBoundaryMessageFixture(program, suffix);
  const seed: RetryIncidentStimulus = {
    kind: StimulusKind.RetryIncident,
    commandId: `seed-${suffix}`,
    incidentId: {
      effectId: { processInstanceId: model.start.instanceId, elementId: "AbsentEffect", activation: 1 },
      generation: 1,
    },
  };
  const started = advanceScenario(program, initialState, model.start);
  assert.equal(started.kind, ScenarioStepKind.Committed);
  const rejected = advanceScenario(program, started.state, seed);
  assert.equal(rejected.kind, ScenarioStepKind.Terminal);
  assert.deepEqual(rejected.state, started.state);
  return {
    program,
    model,
    seed,
    started,
    expectedTrace: [deployProcess(model.start, program).observation, ...started.observations, ...rejected.observations],
    queries: [
      queryJob("trace", bpmnTraceQueryName),
      queryJob("execution", bpmnExecutionPublicationQueryName, { afterRevision: 0 }),
      queryJob("occurrences", bpmnFlowNodeOccurrencesQueryName, { afterRevision: 0 }),
      queryJob("recovery", bpmnWorkflowChainCommandRecoveryQueryName, buildWorkflowChainRecoveryRequest(model.start.instanceId, seed)),
    ],
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function activate(setup: Fixture, batches: Job[][]) {
  const [readyJobs, ...later] = batches;
  assert.ok(readyJobs);
  return runDirectVmActivations({
    bundle: await bundle,
    workflowType: bpmnProcessWorkflowType,
    replaying: false,
    taskQueue: "oversized-command-ingress",
    args: [setup.model.start, setup.program, productionBpmnWorkflowInitialHostInput()].map((value) => defaultPayloadConverter.toPayload(value)),
    readyJobs,
    assertInitialization(completion) {
      requireSuccessful(completion);
      assertNoOwnedCommands(completion);
    },
  }, later);
}

function oversizedCompletion(stimulus: CompleteUserTaskInstanceStimulus, field: OversizedField): CompleteUserTaskInstanceStimulus {
  return field === "commandId"
    ? { ...stimulus, commandId: oversizedString }
    : { ...stimulus, submittedValues: [{ name: "oversized", value: { kind: VariableValueKind.String, value: oversizedString } }] };
}

function updateJob(stimulus: CompleteUserTaskInstanceStimulus | RetryIncidentStimulus, id: string): Job {
  return { doUpdate: {
    id,
    protocolInstanceId: id,
    name: stimulus.kind === StimulusKind.RetryIncident ? bpmnRetryEffectIncidentUpdateName : bpmnCompleteUserTaskUpdateName,
    input: [defaultPayloadConverter.toPayload(stimulus)],
    runValidator: true,
  } };
}

function signalJob(stimulus: MessageDeliveryStimulus): Job {
  return { signalWorkflow: { signalName: bpmnDeliverMessageSignalName, input: [defaultPayloadConverter.toPayload(stimulus)] } };
}

function queryJob(queryId: string, queryType: string, ...args: unknown[]): Job & { variant: "queryWorkflow" } {
  return { variant: "queryWorkflow", queryWorkflow: { queryId, queryType, arguments: args.map((value) => defaultPayloadConverter.toPayload(value)) } };
}

function queryResult(completion: Completion, id: string): unknown {
  const response = commands(completion).find(({ respondToQuery }) => respondToQuery?.queryId === id)?.respondToQuery;
  assert.equal(response?.failed, undefined);
  assert.ok(response?.succeeded?.response);
  return defaultPayloadConverter.fromPayload(response.succeeded.response);
}

function snapshot(completion: Completion | undefined) {
  requireSuccessful(completion);
  return {
    trace: queryResult(completion, "trace"),
    execution: queryResult(completion, "execution"),
    occurrences: queryResult(completion, "occurrences"),
    recovery: queryResult(completion, "recovery"),
  };
}

function assertBaseline(setup: Fixture, completion: Completion | undefined): void {
  assert.deepEqual(snapshot(completion).trace, setup.expectedTrace);
  assert.ok(publicRevision(setup, completion) > 0);
}

function publicRevision(setup: Fixture, completion: Completion | undefined): number {
  const publication = requireExecutionPublicationResult(snapshot(completion).execution, {
    program: setup.program,
    processInstanceId: setup.model.start.instanceId,
    afterRevision: 0,
  });
  assert.equal(publication.kind, ExecutionPublicationResultKind.Available);
  assert.ok(publication.kind === ExecutionPublicationResultKind.Available);
  return publication.page.headRevision;
}

function capacityDetails(stimulus: Stimulus, setup: Fixture, revision: number) {
  return {
    budget: WorkflowChainBudgetKind.SemanticStimulusBytes,
    configuredBound: workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticStimulusBytes),
    observedValue: workflowChainCanonicalUtf8ByteLength(stimulus),
    processInstanceId: setup.model.start.instanceId,
    publicRevision: revision,
    runOrdinal: 1,
  };
}

function requireCapacityFailure(failure: Failure, stimulus: Stimulus, setup: Fixture, revision: number): void {
  const info = failure.applicationFailureInfo;
  assert.equal(info?.type, bpmnWorkflowChainCapacityExhaustedFailureType);
  assert.equal(info?.nonRetryable, true);
  assert.deepEqual(Array.from(info?.details?.payloads ?? [], (payload) => defaultPayloadConverter.fromPayload(payload)), [capacityDetails(stimulus, setup, revision)]);
}

function requireSuccessful(completion: Completion | undefined): asserts completion is Completion {
  assert.ok(completion);
  assert.equal(completion.failed, undefined);
  assert.ok(completion.successful);
  assert.equal(workflowFailureType(completion), undefined);
}

function requireUpdateOutcome(completion: Completion | undefined, outcome: CommandOutcome): void {
  requireSuccessful(completion);
  const outcomes = Array.from(commands(completion)).flatMap(({ updateResponse }) =>
    updateResponse?.completed ? [defaultPayloadConverter.fromPayload(updateResponse.completed)] : []);
  assert.deepEqual(outcomes, [outcome]);
}

function assertNoOwnedCommands(completion: Completion | undefined): void {
  assert.ok(completion);
  assert.equal(commands(completion).some(({ startTimer, cancelTimer, scheduleActivity, requestCancelActivity }) =>
    startTimer !== undefined || cancelTimer !== undefined || scheduleActivity !== undefined || requestCancelActivity !== undefined), false);
}

function workflowChain(processInstanceId: string): WorkflowChainRuntime {
  return {
    eventHistoryEventLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryEvents),
    eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes),
    runId: "run-1",
    runOrdinal: 1,
    firstExecutionRunId: "run-1",
    segmentDirectory: { format: "bpmn-lean.workflow-publication-segment-directory.v1", segments: [] },
    recovery: new WorkflowCommandRecoveryLedger(),
    capacity: new WorkflowChainCapacityState({ processInstanceId, runOrdinal: 1 }),
    commandCapacity: new WorkflowCommandCapacityState(),
  };
}
