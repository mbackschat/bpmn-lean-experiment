import {
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";

export const processStartFixture = {
  kind: StimulusKind.StartProcess,
  commandId: "start:instance-42",
  processId: "Process_Review",
  instanceId: "instance-42",
  initialVariables: [],
} as const;

export const processProgramFixture = {
  kind: SemanticProcessKind.SemanticProcess,
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "cibseven-2.2.0-user-task-process-data-draft",
    sourceId: "sequential-user-task-process",
    sourceSha256: "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d",
    sourceOverlay: null,
  },
  processId: "Process_Review",
  definitionScopes: [
    {
      id: "scope:Process_Review",
      parentScopeId: null,
      originElementId: "Process_Review",
    },
  ],
  operationScopes: [
    "operation:EndEvent_1",
    "operation:StartEvent_1",
    "operation:UserTask_Review",
    "operation:complete-scope:scope:Process_Review",
  ].map((operationId) => ({
    operationId,
    scopeId: "scope:Process_Review",
  })),
  controlPlaceScopes: [
    "place:Flow_StartToTask",
    "place:Flow_TaskToEnd",
  ].map((controlPlaceId) => ({
    controlPlaceId,
    scopeId: "scope:Process_Review",
  })),
  controlPlaces: [
    {
      id: "place:Flow_StartToTask",
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "Flow_StartToTask",
      },
    },
    {
      id: "place:Flow_TaskToEnd",
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "Flow_TaskToEnd",
      },
    },
  ],
  operations: [
    {
      id: "operation:EndEvent_1",
      kind: SemanticOperationKind.ReachNoneEnd,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: "EndEvent_1",
      },
      input: "place:Flow_TaskToEnd",
    },
    {
      id: "operation:StartEvent_1",
      kind: SemanticOperationKind.Initiate,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: "StartEvent_1",
      },
      output: "place:Flow_StartToTask",
    },
    {
      id: "operation:UserTask_Review",
      kind: SemanticOperationKind.AwaitUserTask,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: "UserTask_Review",
      },
      input: "place:Flow_StartToTask",
      output: "place:Flow_TaskToEnd",
      task: { elementId: "UserTask_Review", name: "Review" },
    },
    {
      id: "operation:complete-scope:scope:Process_Review",
      kind: SemanticOperationKind.CompleteScope,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: "Process_Review",
      },
      scopeId: "scope:Process_Review",
      parentOutput: null,
    },
  ],
} as const;
