/**
 * Answer-free pipeline case catalog and retained seeded-disagreement mutations.
 */
import {
  CanonicalObservationKind,
  ProcessStatus,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  DisagreementKind,
} from "@bpmn-lean/differential";
import {
  EffectExecutionSchedule,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "@bpmn-lean/temporal-adapter";

import {
  CibEffectExecutionSchedule,
  CibCaseRelation,
  PipelineReplaySelection,
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type {
  CibPipelineConfiguration,
  DeepMutable,
  MutableScenarioResult,
  MutableStateObservation,
  ObservationValueDisagreement,
  PipelineCase,
} from "./pipeline-types.ts";
import {
  embeddedSubProcessPipelineCases,
} from "./embedded-subprocess-pipeline-cases.ts";
import {
  subprocessErrorPipelineCases,
} from "./subprocess-error-pipeline-cases.ts";

type InteractionCaseOptions = Readonly<{
  completionDelivery?: TemporalCompletionDelivery;
  temporalRelation?: PipelineCase["temporalRelation"];
  executionSchedule?: TemporalExecutionSchedule;
}>;

type ParallelCaseOptions = Readonly<{
  injectMutation?: PipelineCase["injectMutation"];
  expectedInjectedDisagreement?: ObservationValueDisagreement;
}>;

function cibConfiguration(
  evidenceRelativePath: string,
  version: CibPipelineConfiguration["version"],
  relation: CibPipelineConfiguration["relation"],
  effectExecutionSchedule:
    CibPipelineConfiguration["effectExecutionSchedule"] =
    CibEffectExecutionSchedule.None,
): CibPipelineConfiguration {
  return Object.freeze({
    evidenceRelativePath,
    version,
    relation,
    effectExecutionSchedule,
  });
}

function mutableClone<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

function observationValueDisagreement(
  path: string,
  expected: unknown,
  actual: unknown,
): ObservationValueDisagreement {
  return {
    kind: DisagreementKind.ObservationValue,
    path,
    expected,
    actual,
  };
}

function mutateOpenTaskActivation(result: MutableScenarioResult): void {
  const running = runningObservation(result);
  const openTask = running.openUserTasks?.[0];
  if (openTask === undefined) {
    throw new Error("calibrated open User Task is required");
  }
  running.openUserTasks[0] = {
    ...openTask,
    id: {
      ...openTask.id,
      activation: 2,
    },
  };
}

function mutateSelectedBranchTask(result: MutableScenarioResult): void {
  const running = runningObservation(result);
  const openTask = running.openUserTasks?.[0];
  if (
    openTask === undefined ||
    openTask.id.elementId !== "Task_First"
  ) {
    throw new Error(
      "Simple Boolean calibration requires the first branch User Task",
    );
  }
  running.openUserTasks[0] = {
    ...openTask,
    id: {
      ...openTask.id,
      elementId: "Task_Second",
    },
  };
}

function omitOneParallelOpenTask(result: MutableScenarioResult): void {
  const running = runningObservation(result);
  if (running.openUserTasks?.length !== 2) {
    throw new Error("two calibrated parallel User Tasks are required");
  }
  running.openUserTasks = running.openUserTasks.slice(0, 1);
}

function omitLiveSiblingAfterStaleRejection(
  result: MutableScenarioResult,
): void {
  const staleCommandIndex = result.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command &&
      observation.commandId === "complete-stale-user-task-a",
  );
  const state = result.trace[staleCommandIndex + 1];
  if (
    staleCommandIndex < 0 ||
    state?.kind !== CanonicalObservationKind.State ||
    state.openUserTasks.length !== 1
  ) {
    throw new Error(
      "stale parallel calibration requires one live sibling",
    );
  }
  state.openUserTasks = [];
}

function mutateOpenTimerDeadline(result: MutableScenarioResult): void {
  const running = runningObservation(result);
  const openTimer = running.openTimers?.[0];
  if (openTimer === undefined) {
    throw new Error("one calibrated open Timer is required");
  }
  running.openTimers[0] = {
    ...openTimer,
    deadlineMs: openTimer.deadlineMs + 1,
  };
}

function mutateOpenMessageChannel(result: MutableScenarioResult): void {
  const running = runningObservation(result);
  const subscription = running.openMessageSubscriptions?.[0];
  if (subscription === undefined) {
    throw new Error("one calibrated open Message subscription is required");
  }
  running.openMessageSubscriptions[0] = {
    ...subscription,
    channel: {
      ...subscription.channel,
      messageId: `${subscription.channel.messageId}-mutated`,
    },
  };
}

function mutateOpenEffectOperation(result: MutableScenarioResult): void {
  const running = runningObservation(result);
  const openEffect = running.openEffects?.[0];
  if (openEffect === undefined) {
    throw new Error("one calibrated open effect is required");
  }
  running.openEffects[0] = {
    ...openEffect,
    descriptor: {
      ...openEffect.descriptor,
      operation: `${openEffect.descriptor.operation}-mutated`,
    },
  } as unknown as typeof openEffect;
}

function runningObservation(
  result: MutableScenarioResult,
): MutableStateObservation {
  const observation = result.trace.find(
    (candidate): candidate is MutableStateObservation =>
      candidate.kind === CanonicalObservationKind.State &&
      candidate.status === ProcessStatus.Running,
  );
  if (observation === undefined) {
    throw new Error("calibrated running state is required");
  }
  return observation;
}

function mutateFinalProcessVariable(
  result: MutableScenarioResult,
): void {
  const finalState = [...result.trace].reverse().find(
    (observation): observation is MutableStateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  const binding = finalState?.variables[0];
  if (
    finalState === undefined ||
    binding?.value.kind !== "string"
  ) {
    throw new Error(
      "CreateDocument calibration requires one final string variable",
    );
  }
  binding.value.value = `${binding.value.value}-mutated`;
}

function mutateBoundaryErrorProcessVariable(
  result: MutableScenarioResult,
): void {
  const routedState = result.trace.find(
    (observation): observation is MutableStateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.openUserTasks.some(
        ({ id }) =>
          id.elementId === "ExpectedUserTaskAfterBPMNError",
      ),
  );
  const binding = routedState?.variables.find(
    ({ name }) => name === "relationshipLinkId",
  );
  if (binding?.value.kind !== "null") {
    throw new Error(
      "boundary-error calibration requires one mapped null variable",
    );
  }
  binding.value = { kind: VariableValueKind.String, value: "" };
}

function interactionCase(
  id: string,
  scenarioFile: string,
  evidenceFile: string,
  options: InteractionCaseOptions = {},
): PipelineCase {
  return Object.freeze({
    id,
    scenarioRelativePath:
      `scenarios/user-task-discovery-completion/${scenarioFile}`,
    bpmnRelativePath:
      "scenarios/user-task-discovery-completion/process.bpmn",
    workflowIdPrefix: id,
    cib: cibConfiguration(
        `scenarios/user-task-discovery-completion/${evidenceFile}`,
      "2.2.0",
      CibCaseRelation.ExactSemantic,
    ),
    expectedWaitTraceLength: 3,
    completionDelivery:
      options.completionDelivery ??
      TemporalCompletionDelivery.Ordered,
    temporalRelation:
      options.temporalRelation ??
      TemporalCaseRelation.ExactSemantic,
    executionSchedule:
      options.executionSchedule ??
      TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: mutateOpenTaskActivation,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openUserTasks[0].id.activation",
      1,
      2,
    ),
  });
}

function parallelCase(
  id: string,
  scenarioFile: string,
  evidenceFile: string,
  options: ParallelCaseOptions = {},
): PipelineCase {
  return Object.freeze({
    id,
    scenarioRelativePath:
      `scenarios/parallel-fork-join/${scenarioFile}`,
    bpmnRelativePath: "scenarios/parallel-fork-join/process.bpmn",
    workflowIdPrefix: id,
    cib: cibConfiguration(
        `scenarios/parallel-fork-join/${evidenceFile}`,
      "2.2.0",
      CibCaseRelation.ExactSemantic,
    ),
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation:
      options.injectMutation ?? omitOneParallelOpenTask,
    expectedInjectedDisagreement:
      options.expectedInjectedDisagreement ??
      observationValueDisagreement(
        "trace[2].openUserTasks.length",
        2,
        1,
      ),
  });
}

function timerCase(): PipelineCase {
  return Object.freeze({
    id: "intermediate-catch-timer-pt1s",
    scenarioRelativePath:
      "scenarios/intermediate-catch-timer/scenario.json",
    bpmnRelativePath:
      "scenarios/intermediate-catch-timer/process.bpmn",
    workflowIdPrefix: "intermediate-catch-timer-pt1s",
    cib: cibConfiguration(
        "scenarios/intermediate-catch-timer/cibseven-evidence.json",
      "2.2.0",
      CibCaseRelation.ExactSemantic,
    ),
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: mutateOpenTimerDeadline,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openTimers[0].deadlineMs",
      1000,
      1001,
    ),
  });
}

function simpleBooleanGatewayCase(): PipelineCase {
  return Object.freeze({
    id: "exclusive-gateway-simple-boolean-first-true",
    scenarioRelativePath:
      "scenarios/exclusive-gateway-simple-boolean/scenario.json",
    bpmnRelativePath:
      "scenarios/exclusive-gateway-simple-boolean/process.bpmn",
    workflowIdPrefix:
      "exclusive-gateway-simple-boolean-first-true",
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: mutateSelectedBranchTask,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openUserTasks[0].id.elementId",
      "Task_First",
      "Task_Second",
    ),
  });
}

function timerUserTaskCompositionCase(): PipelineCase {
  return Object.freeze({
    id: "timer-user-task-composition",
    scenarioRelativePath:
      "scenarios/timer-user-task-composition/scenario.json",
    bpmnRelativePath:
      "scenarios/timer-user-task-composition/process.bpmn",
    workflowIdPrefix: "timer-user-task-composition",
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: mutateOpenTimerDeadline,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openTimers[0].deadlineMs",
      1000,
      1001,
    ),
  });
}

function intermediateCatchMessageCase(): PipelineCase {
  return Object.freeze({
    id: "intermediate-catch-message",
    scenarioRelativePath:
      "scenarios/intermediate-catch-message/scenario.json",
    bpmnRelativePath:
      "scenarios/intermediate-catch-message/process.bpmn",
    workflowIdPrefix: "intermediate-catch-message",
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: mutateOpenMessageChannel,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openMessageSubscriptions[0].channel.messageId",
      "Message_ApprovalRequest",
      "Message_ApprovalRequest-mutated",
    ),
  });
}

function effectCase(): PipelineCase {
  return Object.freeze({
    id: "service-task-effect-success",
    scenarioRelativePath:
      "scenarios/service-task-effect/scenario.json",
    bpmnRelativePath: "scenarios/service-task-effect/process.bpmn",
    workflowIdPrefix: "service-task-effect-success",
    cib: cibConfiguration(
        "scenarios/service-task-effect/cibseven-evidence.json",
      "2.2.0",
      CibCaseRelation.ExactSemantic,
      CibEffectExecutionSchedule.FailAfterMutationOnce,
    ),
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: {
      primary: EffectExecutionSchedule.PlainSuccess,
      isolation: EffectExecutionSchedule.FailAfterMutationOnce,
    },
    replaySelection: PipelineReplaySelection.PrimaryAndIsolation,
    injectMutation: mutateOpenEffectOperation,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openEffects[0].descriptor.operation",
      "urn:bpmn-lean:effect-operation:probe-v1",
      "urn:bpmn-lean:effect-operation:probe-v1-mutated",
    ),
  });
}

function createDocumentCase(): PipelineCase {
  return Object.freeze({
    id: "a12-create-document-data",
    scenarioRelativePath:
      "scenarios/create-document-data/scenario.json",
    bpmnRelativePath: "scenarios/create-document-data/process.bpmn",
    workflowIdPrefix: "a12-create-document-data",
    cib: cibConfiguration(
        "scenarios/create-document-data/cibseven-evidence.json",
      "2.0.0",
      CibCaseRelation.SynchronousFinalState,
    ),
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: {
      primary: EffectExecutionSchedule.PlainSuccess,
      isolation: EffectExecutionSchedule.FailAfterMutationOnce,
    },
    replaySelection: PipelineReplaySelection.PrimaryAndIsolation,
    injectMutation: mutateFinalProcessVariable,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[4].variables[0].value.value",
      "Document:42",
      "Document:42-mutated",
    ),
  });
}

function boundaryErrorCase(): PipelineCase {
  return Object.freeze({
    id: "a12-boundary-error-caught",
    scenarioRelativePath:
      "scenarios/boundary-error/scenario.json",
    bpmnRelativePath: "scenarios/boundary-error/process.bpmn",
    workflowIdPrefix: "a12-boundary-error-caught",
    cib: cibConfiguration(
        "scenarios/boundary-error/cibseven-evidence.json",
      "2.0.0",
      CibCaseRelation.SynchronousBoundaryError,
    ),
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: {
      primary: EffectExecutionSchedule.PlainSuccess,
      isolation: EffectExecutionSchedule.PlainSuccess,
    },
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: mutateBoundaryErrorProcessVariable,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[4].variables[0].value.kind",
      "null",
      "string",
    ),
  });
}

export const pipelineCases = Object.freeze([
  interactionCase(
    "user-task-discovery-completion",
    "scenario.json",
    "cibseven-evidence.json",
  ),
  interactionCase(
    "user-task-wrong-activation",
    "wrong-activation.scenario.json",
    "wrong-activation.cibseven-evidence.json",
  ),
  interactionCase(
    "user-task-stale-completion",
    "stale-completion.scenario.json",
    "stale-completion.cibseven-evidence.json",
    {
      completionDelivery: TemporalCompletionDelivery.PostTerminal,
      temporalRelation: TemporalCaseRelation.PostTerminalClosed,
      executionSchedule:
        TemporalExecutionSchedule.DuplicateFirstCompletion,
    },
  ),
  parallelCase(
    "parallel-fork-join-a-then-b",
    "a-then-b.scenario.json",
    "a-then-b.cibseven-evidence.json",
  ),
  parallelCase(
    "parallel-fork-join-b-then-a",
    "b-then-a.scenario.json",
    "b-then-a.cibseven-evidence.json",
  ),
  parallelCase(
    "parallel-fork-join-stale-a-while-b-active",
    "stale-a-while-b-active.scenario.json",
    "stale-a-while-b-active.cibseven-evidence.json",
    {
      injectMutation: omitLiveSiblingAfterStaleRejection,
      expectedInjectedDisagreement: observationValueDisagreement(
        "trace[6].openUserTasks.length",
        1,
        0,
      ),
    },
  ),
  ...embeddedSubProcessPipelineCases,
  ...subprocessErrorPipelineCases,
  timerCase(),
  timerUserTaskCompositionCase(),
  intermediateCatchMessageCase(),
  simpleBooleanGatewayCase(),
  effectCase(),
  createDocumentCase(),
  boundaryErrorCase(),
]);
