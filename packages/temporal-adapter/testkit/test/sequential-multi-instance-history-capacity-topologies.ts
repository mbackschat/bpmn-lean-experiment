/** Pure natural and interrupted semantic topologies for the private SMI capacity probe. */
import assert from "node:assert/strict";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  ScenarioStepKind,
  SemanticOperationKind,
  SemanticTransitionKind,
  StimulusKind,
  VariableValueKind,
  applyInternalOperationStep,
  completeOrdinaryUserTask,
  completeSequentialMultiInstanceIteration,
  interruptSequentialMultiInstance,
  observeStableState,
  projectControlPositionDelta,
  projectCurrentControlPositions,
  projectFlowNodeOccurrenceLifecycleDelta,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
  StateObservation,
  Stimulus,
  UnnumberedCommittedTransitionRecord,
  UnnumberedFlowNodeOccurrenceDelta,
} from "@bpmn-lean/semantic-core";
import {
  canonicalStimulusEncoding,
  processTerminalReceiptFormatV1,
  requireWorkflowChainRecoveryEntry,
  requireWorkflowTerminalResultV1,
  timerFiringStimulus,
  workflowTerminalResultFormatV1,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryPreflightKind,
} from "@bpmn-lean/temporal-workflow";

import {
  appendCapacityPublication,
  publicationPages,
} from "./sequential-multi-instance-history-capacity-publication.ts";
import type {
  CapacityCommandFacts,
  CapacityPublicationState,
} from "./sequential-multi-instance-history-capacity-publication.ts";
import type {
  SequentialMultiInstanceCapacityProbeStaticPayload,
} from "./sequential-multi-instance-history-capacity-workflows.ts";

type LoopOperation = Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask }
>;

export type SequentialMultiInstanceCapacityProbeTopologyFixture = Readonly<{
  staticPayload: SequentialMultiInstanceCapacityProbeStaticPayload;
  updates: readonly CompleteUserTaskInstanceStimulus[];
}>;

export type SequentialMultiInstanceCapacityTopologyContext = Readonly<{
  program: SemanticProcessProgram;
  processInstanceId: string;
  operation: LoopOperation;
  collection: readonly string[];
  initialState: RuntimeState;
  initialPublication: CapacityPublicationState;
  initialObservations: readonly CanonicalObservation[];
  continuation: SequentialMultiInstanceCapacityProbeStaticPayload["continuation"];
}>;

type MutableTopology = {
  state: RuntimeState;
  publication: CapacityPublicationState;
  observations: CanonicalObservation[];
  recovery: WorkflowCommandRecoveryLedger;
  updates: CompleteUserTaskInstanceStimulus[];
};

type AppliedStep = NonNullable<ReturnType<typeof applyInternalOperationStep>>;

export function buildNaturalCapacityTopology(
  context: SequentialMultiInstanceCapacityTopologyContext & Readonly<{
    naturalEnd: SemanticOperation;
    completedScope: SemanticOperation;
  }>,
): SequentialMultiInstanceCapacityProbeTopologyFixture {
  const build = completeIterations(
    context,
    context.collection.length,
    [context.naturalEnd, context.completedScope],
  );
  return closeTopology(context, build);
}

export function buildInterruptedCapacityTopology(
  context: SequentialMultiInstanceCapacityTopologyContext & Readonly<{
    escalationTask: SemanticOperation;
    interruptedEnd: SemanticOperation;
    completedScope: SemanticOperation;
  }>,
): SequentialMultiInstanceCapacityProbeTopologyFixture {
  const build = completeIterations(context, context.collection.length - 1, []);
  const timer = build.state.timerWaits[0];
  assert.ok(
    build.state.timerWaits.length === 1 && timer !== undefined,
    "interrupted SMI topology lost its lifetime Timer",
  );
  const firing = timerFiringStimulus(timer);
  const interrupted = interruptSequentialMultiInstance(
    context.program,
    build.state,
    firing,
  );
  assert.ok(interrupted !== null, "SMI lifetime Timer was refused");
  const escalation = closeCapacityOperations(
    context.program,
    interrupted,
    [context.escalationTask],
  );
  appendTopologyCommand(context, build, firing, interrupted, escalation.steps, 1_016);

  const task = build.state.userTaskWaits[0];
  assert.ok(
    build.state.userTaskWaits.length === 1 &&
      task?.id.elementId === "UserTask_Escalation",
    "SMI interruption did not expose the escalation User Task",
  );
  const completion: CompleteUserTaskInstanceStimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-smi-history-capacity-15",
    taskId: task.id,
    submittedValues: [],
  };
  canonicalStimulusEncoding(completion);
  const completed = completeOrdinaryUserTask(
    context.program,
    build.state,
    completion,
  );
  assert.ok(completed !== null, "SMI escalation completion was refused");
  const closure = closeCapacityOperations(
    context.program,
    completed,
    [context.interruptedEnd, context.completedScope],
  );
  appendTopologyCommand(context, build, completion, completed, closure.steps, 1_017);
  recordRecoverableUpdate(build, completion, 15);
  return closeTopology(context, build);
}

export function closeCapacityOperations(
  program: SemanticProcessProgram,
  start: RuntimeState,
  operations: readonly SemanticOperation[],
): { state: RuntimeState; steps: AppliedStep[] } {
  let state = start;
  const steps: AppliedStep[] = [];
  for (const operation of operations) {
    const step = applyInternalOperationStep(program, operation, state);
    assert.ok(step !== null && step.owner !== null, `${operation.id} did not apply`);
    steps.push(step);
    state = step.successor;
  }
  return { state, steps };
}

export function projectCapacityCommand(
  program: SemanticProcessProgram,
  before: RuntimeState,
  stimulus: Stimulus,
  admitted: RuntimeState,
  internalSteps: readonly AppliedStep[],
): CapacityCommandFacts {
  const transitions: UnnumberedCommittedTransitionRecord[] = [];
  const lifecycles: UnnumberedFlowNodeOccurrenceDelta[] = [];
  appendProjectedBoundary(
    program,
    before,
    admitted,
    { kind: SemanticTransitionKind.ExternalStimulus, stimulus },
    { kind: "external", stimulus },
    stimulus.commandId,
    transitions,
    lifecycles,
  );
  let current = admitted;
  for (const step of internalSteps) {
    assert.ok(step.owner !== null);
    appendProjectedBoundary(
      program,
      current,
      step.successor,
      {
        kind: SemanticTransitionKind.InternalOperation,
        operationId: step.operation.id,
        operationKind: step.operation.kind,
        origin: step.operation.origin,
        owner: step.owner,
      },
      { kind: "internal", operation: step.operation, owner: step.owner },
      stimulus.commandId,
      transitions,
      lifecycles,
    );
    current = step.successor;
  }
  const observation = observeStableState(program, current);
  const positions = projectCurrentControlPositions(program, current);
  const firstTransition = transitions[0];
  const firstLifecycle = lifecycles[0];
  assert.ok(
    observation !== null &&
      positions !== null &&
      firstTransition !== undefined &&
      firstLifecycle !== undefined,
  );
  return {
    kind: ScenarioStepKind.Committed,
    state: current,
    observations: [{
      kind: CanonicalObservationKind.Command,
      commandId: stimulus.commandId,
      outcome: CommandOutcome.Committed,
    }, observation],
    publication: {
      transitions: [firstTransition, ...transitions.slice(1)],
      current: {
        state: observation,
        controlTokens: positions.controlTokens,
        scopes: positions.scopes,
      },
    },
    flowNodeOccurrenceLifecycles: [firstLifecycle, ...lifecycles.slice(1)],
  };
}

function completeIterations(
  context: SequentialMultiInstanceCapacityTopologyContext,
  count: number,
  finalOperations: readonly SemanticOperation[],
): MutableTopology {
  const build: MutableTopology = {
    state: context.initialState,
    publication: context.initialPublication,
    observations: [...context.initialObservations],
    recovery: new WorkflowCommandRecoveryLedger(),
    updates: [],
  };
  for (let counter = 0; counter < count; counter += 1) {
    const task = build.state.userTaskWaits[0];
    const result = context.collection[counter];
    assert.ok(task !== undefined && result !== undefined);
    const stimulus: CompleteUserTaskInstanceStimulus = {
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId: `complete-smi-history-capacity-${counter}`,
      taskId: task.id,
      submittedValues: [{
        name: context.operation.data.output.taskDataOutputId,
        value: { kind: VariableValueKind.String, value: result },
      }],
    };
    canonicalStimulusEncoding(stimulus);
    const successor = completeSequentialMultiInstanceIteration(
      context.program,
      build.state,
      stimulus,
    );
    assert.ok(successor !== null, `SMI iteration ${counter} was refused`);
    const closure = counter === count - 1 && finalOperations.length > 0
      ? closeCapacityOperations(context.program, successor, finalOperations)
      : { state: successor, steps: [] };
    appendTopologyCommand(
      context,
      build,
      stimulus,
      successor,
      closure.steps,
      1_001 + counter,
    );
    recordRecoverableUpdate(build, stimulus, counter);
  }
  return build;
}

function appendTopologyCommand(
  context: SequentialMultiInstanceCapacityTopologyContext,
  build: MutableTopology,
  stimulus: Stimulus,
  admitted: RuntimeState,
  internalSteps: readonly AppliedStep[],
  committedAtEpochMs: number,
): void {
  const facts = projectCapacityCommand(
    context.program,
    build.state,
    stimulus,
    admitted,
    internalSteps,
  );
  build.publication = appendCapacityPublication(
    context.program,
    build.publication,
    stimulus,
    facts,
    committedAtEpochMs,
  );
  publicationPages(context.program, context.processInstanceId, build.publication);
  build.observations.push(...facts.observations);
  build.state = facts.state;
}

function recordRecoverableUpdate(
  build: MutableTopology,
  stimulus: CompleteUserTaskInstanceStimulus,
  index: number,
): void {
  const preflight = build.recovery.preflight(stimulus);
  assert.equal(preflight.kind, WorkflowCommandRecoveryPreflightKind.Admitted);
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    throw new TypeError(`SMI recovery refused Update ${index}`);
  }
  const recorded = build.recovery.record(
    preflight.admission,
    CommandOutcome.Committed,
  );
  requireWorkflowChainRecoveryEntry(recorded.entry);
  build.updates.push(stimulus);
}

function closeTopology(
  context: SequentialMultiInstanceCapacityTopologyContext,
  build: MutableTopology,
): SequentialMultiInstanceCapacityProbeTopologyFixture {
  assert.equal(build.state.control.kind, ControlStateKind.Completed);
  const finalObservation = build.observations.findLast(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State,
  );
  assert.ok(finalObservation !== undefined);
  const terminal = requireWorkflowTerminalResultV1({
    format: workflowTerminalResultFormatV1,
    receipt: {
      format: processTerminalReceiptFormatV1,
      definition: context.program.identity,
      processId: context.program.processId,
      processInstanceId: context.processInstanceId,
      finalState: finalObservation,
    },
    entries: build.recovery.snapshot(),
  });
  return {
    updates: build.updates,
    staticPayload: {
      continuation: context.continuation,
      finalPublication: publicationPages(
        context.program,
        context.processInstanceId,
        build.publication,
      ),
      terminal,
    },
  };
}

function appendProjectedBoundary(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  transition: UnnumberedCommittedTransitionRecord["transition"],
  lifecycleBoundary: Parameters<typeof projectFlowNodeOccurrenceLifecycleDelta>[3],
  commandId: string,
  transitions: UnnumberedCommittedTransitionRecord[],
  lifecycles: UnnumberedFlowNodeOccurrenceDelta[],
): void {
  const positionDelta = projectControlPositionDelta(program, before, after);
  const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(
    program,
    before,
    after,
    lifecycleBoundary,
    commandId,
    transitions.length,
  );
  assert.ok(positionDelta !== null && lifecycle !== null);
  transitions.push({ logicalTimeMs: after.logicalTimeMs, transition, positionDelta });
  lifecycles.push(lifecycle);
}
