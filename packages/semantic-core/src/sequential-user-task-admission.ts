import {
  ObservationRequestKind,
  ScenarioDocumentKind,
  StimulusKind,
} from "./contract.js";
import type {
  Scenario,
} from "./contract.js";
import {
  BpmnCompilerIdentity,
  BpmnExecutableIrKind,
} from "./executable-ir.js";
import type {
  SequentialUserTaskExecutableIr,
} from "./executable-ir.js";

const supportedObservations = Object.freeze([
  ObservationRequestKind.Deployment,
  ObservationRequestKind.CommandResults,
  ObservationRequestKind.ProcessStatus,
  ObservationRequestKind.ActiveWaits,
  ObservationRequestKind.OpenUserTasks,
  ObservationRequestKind.EnabledInteractions,
  ObservationRequestKind.LogicalTime,
]);

export function supportsSequentialUserTaskScenario(
  scenario: Scenario,
  executableIr: SequentialUserTaskExecutableIr,
): boolean {
  return (
    isSupportedScenario(scenario) &&
    isSupportedExecutableIr(executableIr) &&
    executableIr.identity.semanticProfile === scenario.profile &&
    executableIr.identity.sourceId === scenario.bpmn.id &&
    executableIr.identity.sourceSha256 === scenario.bpmn.sha256
  );
}

function isSupportedScenario(value: unknown): value is Scenario {
  if (!isRecord(value) || value.kind !== ScenarioDocumentKind.Scenario) {
    return false;
  }
  const bpmn = isRecord(value.bpmn) ? value.bpmn : undefined;
  const stimuli = Array.isArray(value.stimuli) ? value.stimuli : undefined;
  const observations = Array.isArray(value.observations)
    ? value.observations
    : undefined;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.profile) &&
    bpmn !== undefined &&
    isNonEmptyString(bpmn.id) &&
    isNonEmptyString(bpmn.relativePath) &&
    isSha256(bpmn.sha256) &&
    stimuli !== undefined &&
    stimuli.length >= 1 &&
    isStartProcessStimulus(stimuli[0]) &&
    stimuli.slice(1).every(isCompleteUserTaskInstanceStimulus) &&
    observations !== undefined &&
    observations.length === supportedObservations.length &&
    observations.every(
      (observation, index) => observation === supportedObservations[index],
    )
  );
}

export function isSupportedExecutableIr(
  value: unknown,
): value is SequentialUserTaskExecutableIr {
  if (!isRecord(value)) {
    return false;
  }
  const identity = isRecord(value.identity) ? value.identity : undefined;
  const userTask = isRecord(value.userTask) ? value.userTask : undefined;
  const sequenceFlows = Array.isArray(value.sequenceFlows)
    ? value.sequenceFlows
    : undefined;
  if (
    value.kind !== BpmnExecutableIrKind.SequentialUserTask ||
    identity === undefined ||
    identity.compiler !== BpmnCompilerIdentity.SequentialUserTask ||
    !isNonEmptyString(identity.semanticProfile) ||
    !isNonEmptyString(identity.sourceId) ||
    !isSha256(identity.sourceSha256) ||
    userTask === undefined ||
    !isNonEmptyString(userTask.id) ||
    (userTask.name !== null && typeof userTask.name !== "string") ||
    sequenceFlows === undefined ||
    sequenceFlows.length !== 2 ||
    !sequenceFlows.every(isExecutableSequenceFlow)
  ) {
    return false;
  }

  const ids = [
    value.processId,
    value.startEventId,
    userTask.id,
    value.endEventId,
    ...sequenceFlows.map(({ id }) => id),
  ];
  return (
    ids.every(isNonEmptyString) &&
    new Set(ids).size === 6 &&
    hasExecutableFlow(sequenceFlows, value.startEventId, userTask.id) &&
    hasExecutableFlow(sequenceFlows, userTask.id, value.endEventId)
  );
}

function hasExecutableFlow(
  sequenceFlows: ReadonlyArray<Record<string, unknown>>,
  sourceId: unknown,
  targetId: unknown,
): boolean {
  return sequenceFlows.some(
    (flow) =>
      flow.sourceId === sourceId &&
      flow.targetId === targetId,
  );
}

function isStartProcessStimulus(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.kind === StimulusKind.StartProcess &&
    isNonEmptyString(value.commandId) &&
    isNonEmptyString(value.processId) &&
    isNonEmptyString(value.instanceId)
  );
}

function isCompleteUserTaskInstanceStimulus(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance ||
    !isNonEmptyString(value.commandId) ||
    !isRecord(value.taskId)
  ) {
    return false;
  }
  return (
    isNonEmptyString(value.taskId.processInstanceId) &&
    isNonEmptyString(value.taskId.elementId) &&
    Number.isSafeInteger(value.taskId.activation) &&
    Number(value.taskId.activation) >= 1
  );
}

function isExecutableSequenceFlow(
  value: unknown,
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.sourceId) &&
    isNonEmptyString(value.targetId)
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
