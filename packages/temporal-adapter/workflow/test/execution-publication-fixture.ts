import {
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
