import {
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

export const callerProcessId = "Process_Caller";
export const calledProcessId = "Process_Called";
export const callerScopeId = "scope:Process_Caller";
export const calledScopeId = "scope:Process_Called";
export const instanceId = "Caller:😀";
export const callElementId = "Call:é";
export const expectedCalledInstanceId = "call:11:Caller:😀:7:Call:é:1";

export const callActivityProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-called-process-call-activity-draft",
    sourceId: "call-activity-runtime-test",
    sourceOverlay: null,
    sourceSha256: "c".repeat(64),
  },
  processId: callerProcessId,
  definitionScopes: [
    { id: callerScopeId, parentScopeId: null, originElementId: callerProcessId },
    { id: calledScopeId, parentScopeId: null, originElementId: calledProcessId },
  ],
  operationScopes: ([
    ["operation:Call:é", callerScopeId],
    ["operation:End_Called", calledScopeId],
    ["operation:End_Caller", callerScopeId],
    ["operation:Start_Caller", callerScopeId],
    ["operation:Task_Called", calledScopeId],
    ["operation:Task_Caller", callerScopeId],
    ["operation:complete-scope:scope:Process_Caller", callerScopeId],
    ["operation:return-process:Call:é", calledScopeId],
  ] as const).map(([operationId, scopeId]) => ({ operationId, scopeId })),
  controlPlaceScopes: ([
    ["place:Called_End", calledScopeId],
    ["place:Called_Start", calledScopeId],
    ["place:Call_To_Caller_Task", callerScopeId],
    ["place:Caller_End", callerScopeId],
    ["place:Caller_Start", callerScopeId],
  ] as const).map(([controlPlaceId, scopeId]) => ({ controlPlaceId, scopeId })),
  controlPlaces: [
    "Called_End",
    "Called_Start",
    "Call_To_Caller_Task",
    "Caller_End",
    "Caller_Start",
  ].map((elementId) => ({
    id: `place:${elementId}`,
    origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId },
  })),
  operations: [
    {
      id: `operation:${callElementId}`,
      kind: SemanticOperationKind.InvokeProcess,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: callElementId },
      input: "place:Caller_Start",
      calledProcessId,
      calledRootScopeId: calledScopeId,
      calledEntry: "place:Called_Start",
      returnOperationId: `operation:return-process:${callElementId}`,
    },
    {
      id: "operation:End_Called",
      kind: SemanticOperationKind.ReachNoneEnd,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "End_Called" },
      input: "place:Called_End",
    },
    {
      id: "operation:End_Caller",
      kind: SemanticOperationKind.ReachNoneEnd,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "End_Caller" },
      input: "place:Caller_End",
    },
    {
      id: "operation:Start_Caller",
      kind: SemanticOperationKind.Initiate,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Start_Caller" },
      output: "place:Caller_Start",
    },
    {
      id: "operation:Task_Called",
      kind: SemanticOperationKind.AwaitUserTask,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Task_Called" },
      input: "place:Called_Start",
      output: "place:Called_End",
      task: { elementId: "Task_Called", name: "Called task" },
    },
    {
      id: "operation:Task_Caller",
      kind: SemanticOperationKind.AwaitUserTask,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Task_Caller" },
      input: "place:Call_To_Caller_Task",
      output: "place:Caller_End",
      task: { elementId: "Task_Caller", name: "Caller task" },
    },
    {
      id: "operation:complete-scope:scope:Process_Caller",
      kind: SemanticOperationKind.CompleteScope,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: callerProcessId },
      scopeId: callerScopeId,
      parentOutput: null,
    },
    {
      id: `operation:return-process:${callElementId}`,
      kind: SemanticOperationKind.ReturnProcess,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: callElementId },
      calledProcessId,
      calledRootScopeId: calledScopeId,
      callerOutput: "place:Call_To_Caller_Task",
    },
  ],
} as const satisfies SemanticProcessProgram;

export function callActivityStart(
  initialVariables: StartProcessStimulus["initialVariables"] = [],
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-call",
    processId: callerProcessId,
    instanceId,
    initialVariables,
  };
}

export function callActivityCompletion(
  processInstanceId: string,
  elementId: string,
  commandId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: { processInstanceId, elementId, activation: 1 },
    submittedValues: [],
  };
}
