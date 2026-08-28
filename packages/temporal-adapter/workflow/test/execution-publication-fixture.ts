import {
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  SemanticOperation,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

const processId = "Process_PublicationParallel";
const processInstanceId = "Instance_Publication";
const scopeId = `scope:${processId}`;

function controlPlace(elementId: string) {
  return {
    id: `place:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId,
    },
  } as const;
}

function operationBase(elementId: string) {
  return {
    id: `operation:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId,
    },
  } as const;
}

const controlPlaces = [
  controlPlace("Flow_AToJoin"),
  controlPlace("Flow_BToJoin"),
  controlPlace("Flow_ForkToA"),
  controlPlace("Flow_ForkToB"),
  controlPlace("Flow_JoinToEnd"),
  controlPlace("Flow_StartToFork"),
];

const operations: SemanticOperation[] = [{
  ...operationBase("EndEvent_1"),
  kind: SemanticOperationKind.ReachNoneEnd,
  input: "place:Flow_JoinToEnd",
}, {
  ...operationBase("Gateway_Fork"),
  kind: SemanticOperationKind.Duplicate,
  input: "place:Flow_StartToFork",
  outputs: ["place:Flow_ForkToA", "place:Flow_ForkToB"],
}, {
  ...operationBase("Gateway_Join"),
  kind: SemanticOperationKind.Synchronize,
  inputs: ["place:Flow_AToJoin", "place:Flow_BToJoin"],
  output: "place:Flow_JoinToEnd",
}, {
  ...operationBase("StartEvent_1"),
  kind: SemanticOperationKind.Initiate,
  output: "place:Flow_StartToFork",
}, {
  ...operationBase("UserTask_A"),
  kind: SemanticOperationKind.AwaitUserTask,
  input: "place:Flow_ForkToA",
  output: "place:Flow_AToJoin",
  task: { elementId: "UserTask_A", name: "A" },
}, {
  ...operationBase("UserTask_B"),
  kind: SemanticOperationKind.AwaitUserTask,
  input: "place:Flow_ForkToB",
  output: "place:Flow_BToJoin",
  task: { elementId: "UserTask_B", name: "B" },
}, {
  id: `operation:complete-scope:${scopeId}`,
  kind: SemanticOperationKind.CompleteScope,
  origin: {
    kind: SemanticOriginKind.BpmnElement,
    elementId: processId,
  },
  scopeId,
  parentOutput: null,
}].sort((left, right) => compareCanonicalStrings(left.id, right.id));

export const publicationProgram: SemanticProcessProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "parallel-fork-join-draft",
    sourceId: "publication-parallel-source",
    sourceOverlay: null,
    sourceSha256: "b".repeat(64),
  },
  processId,
  definitionScopes: [{
    id: scopeId,
    parentScopeId: null,
    originElementId: processId,
  }],
  operationScopes: operations.map(({ id: operationId }) => ({
    operationId,
    scopeId,
  })),
  controlPlaceScopes: controlPlaces.map(({ id: controlPlaceId }) => ({
    controlPlaceId,
    scopeId,
  })),
  controlPlaces,
  operations,
};

export const publicationStart: StartProcessStimulus = {
  kind: StimulusKind.StartProcess,
  commandId: "start-publication",
  processId,
  instanceId: processInstanceId,
  initialVariables: [],
};

export function publicationCompletion(
  elementId: "UserTask_A" | "UserTask_B",
  activation = 1,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}-${activation}`,
    taskId: { processInstanceId, elementId, activation },
    submittedValues: [],
  };
}

export { processInstanceId as publicationProcessInstanceId };

const timedProcessId = "Process_PublicationTimed";
const timedInstanceId = "Instance_PublicationTimed";
const timedScopeId = `scope:${timedProcessId}`;
const timedControlPlaces = [
  controlPlace("Flow_TimedStartToTimer"),
  controlPlace("Flow_TimedTimerToTask"),
  controlPlace("Flow_TimedTaskToEnd"),
];
const timedOperations: SemanticOperation[] = [{
  ...operationBase("EndEvent_Timed"),
  kind: SemanticOperationKind.ReachNoneEnd,
  input: "place:Flow_TimedTaskToEnd",
}, {
  ...operationBase("StartEvent_Timed"),
  kind: SemanticOperationKind.Initiate,
  output: "place:Flow_TimedStartToTimer",
}, {
  ...operationBase("TimerCatch_Timed"),
  kind: SemanticOperationKind.AwaitTimer,
  input: "place:Flow_TimedStartToTimer",
  output: "place:Flow_TimedTimerToTask",
  timer: { elementId: "TimerCatch_Timed", durationMs: 1000 },
}, {
  ...operationBase("UserTask_Timed"),
  kind: SemanticOperationKind.AwaitUserTask,
  input: "place:Flow_TimedTimerToTask",
  output: "place:Flow_TimedTaskToEnd",
  task: { elementId: "UserTask_Timed", name: "Timed task" },
}, {
  id: `operation:complete-scope:${timedScopeId}`,
  kind: SemanticOperationKind.CompleteScope,
  origin: {
    kind: SemanticOriginKind.BpmnElement,
    elementId: timedProcessId,
  },
  scopeId: timedScopeId,
  parentOutput: null,
}].sort((left, right) => compareCanonicalStrings(left.id, right.id));

export const timedPublicationProgram: SemanticProcessProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-timer-user-task-composition-draft",
    sourceId: "publication-timed-source",
    sourceOverlay: null,
    sourceSha256: "c".repeat(64),
  },
  processId: timedProcessId,
  definitionScopes: [{
    id: timedScopeId,
    parentScopeId: null,
    originElementId: timedProcessId,
  }],
  operationScopes: timedOperations.map(({ id: operationId }) => ({
    operationId,
    scopeId: timedScopeId,
  })),
  controlPlaceScopes: timedControlPlaces.map(({ id: controlPlaceId }) => ({
    controlPlaceId,
    scopeId: timedScopeId,
  })),
  controlPlaces: timedControlPlaces,
  operations: timedOperations,
};

export const timedPublicationStart = {
  kind: StimulusKind.StartProcess,
  commandId: "start-publication-timed",
  processId: timedProcessId,
  instanceId: timedInstanceId,
  initialVariables: [],
} as const;

export const timedPublicationFire = {
  kind: StimulusKind.FireTimer,
  commandId: "fire-publication-timed",
  timerId: {
    processInstanceId: timedInstanceId,
    elementId: "TimerCatch_Timed",
    activation: 1,
  },
  logicalTimeMs: 1000,
} as const;

export const timedPublicationCompletion = {
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-publication-timed",
  taskId: {
    processInstanceId: timedInstanceId,
    elementId: "UserTask_Timed",
    activation: 1,
  },
  submittedValues: [],
} as const;

export { timedInstanceId as timedPublicationProcessInstanceId };
