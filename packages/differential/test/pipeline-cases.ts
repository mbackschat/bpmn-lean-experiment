/**
 * Answer-free pipeline case catalog and retained seeded-disagreement mutations.
 */
import {
  CanonicalObservationKind,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import {
  DisagreementKind,
} from "@bpmn-lean/differential";
import {
  TemporalCompletionDelivery,
} from "@bpmn-lean/temporal-adapter";

import {
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type {
  DeepMutable,
  MutableScenarioResult,
  MutableStateObservation,
  ObservationValueDisagreement,
  PipelineCase,
} from "./pipeline-types.ts";

type InteractionCaseOptions = Readonly<{
  completionDelivery?: TemporalCompletionDelivery;
  temporalRelation?: PipelineCase["temporalRelation"];
  duplicateFirstCompletion?: boolean;
}>;

type ParallelCaseOptions = Readonly<{
  injectMutation?: PipelineCase["injectMutation"];
  expectedInjectedDisagreement?: ObservationValueDisagreement;
}>;

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

function mutateOpenEffectHandler(result: MutableScenarioResult): void {
  const running = runningObservation(result);
  const openEffect = running.openEffects?.[0];
  if (openEffect === undefined) {
    throw new Error("one calibrated open effect is required");
  }
  running.openEffects[0] = {
    ...openEffect,
    descriptor: {
      ...openEffect.descriptor,
      handler: `${openEffect.descriptor.handler}-mutated`,
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
    evidenceRelativePath:
      `scenarios/user-task-discovery-completion/${evidenceFile}`,
    bpmnRelativePath:
      "scenarios/user-task-discovery-completion/process.bpmn",
    workflowIdPrefix: id,
    expectedWaitTraceLength: 3,
    completionDelivery:
      options.completionDelivery ??
      TemporalCompletionDelivery.Ordered,
    temporalRelation:
      options.temporalRelation ??
      TemporalCaseRelation.ExactSemantic,
    duplicateFirstCompletion:
      options.duplicateFirstCompletion === true,
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
    evidenceRelativePath:
      `scenarios/parallel-fork-join/${evidenceFile}`,
    bpmnRelativePath: "scenarios/parallel-fork-join/process.bpmn",
    workflowIdPrefix: id,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
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
    evidenceRelativePath:
      "scenarios/intermediate-catch-timer/cibseven-evidence.json",
    bpmnRelativePath:
      "scenarios/intermediate-catch-timer/process.bpmn",
    workflowIdPrefix: "intermediate-catch-timer-pt1s",
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    injectMutation: mutateOpenTimerDeadline,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openTimers[0].deadlineMs",
      1000,
      1001,
    ),
  });
}

function effectCase(): PipelineCase {
  return Object.freeze({
    id: "service-task-effect-success",
    scenarioRelativePath:
      "scenarios/service-task-effect/scenario.json",
    evidenceRelativePath:
      "scenarios/service-task-effect/cibseven-evidence.json",
    bpmnRelativePath: "scenarios/service-task-effect/process.bpmn",
    workflowIdPrefix: "service-task-effect-success",
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    effectScheduleSubstitution: true,
    replayIsolation: true,
    injectMutation: mutateOpenEffectHandler,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openEffects[0].descriptor.handler",
      "bpmnLeanEffectHandler",
      "bpmnLeanEffectHandler-mutated",
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
      duplicateFirstCompletion: true,
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
  timerCase(),
  effectCase(),
]);
