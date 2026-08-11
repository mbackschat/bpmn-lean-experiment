import {
  CheckedNodeKind,
  GatewayDirection,
  SemanticCheckpointProfileId,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CompleteUserTaskInstanceStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
  UserTaskInstanceId,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";

export const terminateProcessId = "Process_TerminateEnd";
export const terminateRootScopeId = `scope:${terminateProcessId}`;
export const terminateChildScopeId = "scope:SubProcess_Work";
export const terminateInstanceId = "TerminateEndInstance_1";

export const terminateCheckedNodes = [
  { kind: CheckedNodeKind.NoneStartEvent, id: "StartEvent_Outer" },
  {
    kind: CheckedNodeKind.EmbeddedSubProcess,
    id: "SubProcess_Work",
    childScopeId: terminateChildScopeId,
  },
  { kind: CheckedNodeKind.UserTask, id: "UserTask_Outer", name: "Outer" },
  { kind: CheckedNodeKind.NoneEndEvent, id: "EndEvent_Outer" },
  { kind: CheckedNodeKind.NoneStartEvent, id: "StartEvent_Child" },
  {
    kind: CheckedNodeKind.ParallelGateway,
    id: "Gateway_ChildFork",
    direction: GatewayDirection.Diverging,
  },
  { kind: CheckedNodeKind.UserTask, id: "UserTask_Sibling", name: "Sibling" },
  { kind: CheckedNodeKind.UserTask, id: "UserTask_Trigger", name: "Trigger" },
  { kind: CheckedNodeKind.NoneEndEvent, id: "EndEvent_ChildNormal" },
  { kind: CheckedNodeKind.TerminateEndEvent, id: "EndEvent_Terminate" },
] as const satisfies ReadonlyArray<CheckedNode>;

export const terminateProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: SemanticCheckpointProfileId.TerminateEnd,
    sourceId: "terminate-end-event-process",
    sourceOverlay: null,
    sourceSha256:
      "0b049156bee51883710a875edc0cbb54cd2afc9fa45989afca4a0fdfd5ab3a23",
  },
  processId: terminateProcessId,
  definitionScopes: [
    {
      id: terminateRootScopeId,
      parentScopeId: null,
      originElementId: terminateProcessId,
    },
    {
      id: terminateChildScopeId,
      parentScopeId: terminateRootScopeId,
      originElementId: "SubProcess_Work",
    },
  ],
  operationScopes: ([
    ["operation:EndEvent_ChildNormal", terminateChildScopeId],
    ["operation:EndEvent_Outer", terminateRootScopeId],
    ["operation:EndEvent_Terminate", terminateChildScopeId],
    ["operation:Gateway_ChildFork", terminateChildScopeId],
    ["operation:StartEvent_Outer", terminateRootScopeId],
    ["operation:SubProcess_Work", terminateRootScopeId],
    ["operation:UserTask_Outer", terminateRootScopeId],
    ["operation:UserTask_Sibling", terminateChildScopeId],
    ["operation:UserTask_Trigger", terminateChildScopeId],
    [`operation:complete-scope:${terminateRootScopeId}`, terminateRootScopeId],
    [`operation:complete-scope:${terminateChildScopeId}`, terminateChildScopeId],
  ] as const).map(([operationId, scopeId]) => ({ operationId, scopeId })),
  controlPlaceScopes: ([
    ["place:Flow_ChildForkToSibling", terminateChildScopeId],
    ["place:Flow_ChildForkToTrigger", terminateChildScopeId],
    ["place:Flow_ChildNormalToEnd", terminateChildScopeId],
    ["place:Flow_ChildStartToFork", terminateChildScopeId],
    ["place:Flow_OuterStartToScope", terminateRootScopeId],
    ["place:Flow_OuterToRootEnd", terminateRootScopeId],
    ["place:Flow_ScopeToOuter", terminateRootScopeId],
    ["place:Flow_TriggerToTerminate", terminateChildScopeId],
  ] as const).map(([controlPlaceId, scopeId]) => ({
    controlPlaceId,
    scopeId,
  })),
  controlPlaces: [
    "Flow_ChildForkToSibling",
    "Flow_ChildForkToTrigger",
    "Flow_ChildNormalToEnd",
    "Flow_ChildStartToFork",
    "Flow_OuterStartToScope",
    "Flow_OuterToRootEnd",
    "Flow_ScopeToOuter",
    "Flow_TriggerToTerminate",
  ].map(controlPlace),
  operations: [
    {
      ...operationBase("EndEvent_ChildNormal"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_ChildNormalToEnd",
    },
    {
      ...operationBase("EndEvent_Outer"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_OuterToRootEnd",
    },
    {
      ...operationBase("EndEvent_Terminate"),
      kind: SemanticOperationKind.TerminateScope,
      input: "place:Flow_TriggerToTerminate",
      scopeId: terminateChildScopeId,
    },
    {
      ...operationBase("Gateway_ChildFork"),
      kind: SemanticOperationKind.Duplicate,
      input: "place:Flow_ChildStartToFork",
      outputs: [
        "place:Flow_ChildForkToSibling",
        "place:Flow_ChildForkToTrigger",
      ],
    },
    {
      ...operationBase("StartEvent_Outer"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_OuterStartToScope",
    },
    {
      ...operationBase("SubProcess_Work"),
      kind: SemanticOperationKind.EnterScope,
      input: "place:Flow_OuterStartToScope",
      childEntry: "place:Flow_ChildStartToFork",
      childScopeId: terminateChildScopeId,
    },
    userTask("UserTask_Outer", "Outer", "Flow_ScopeToOuter", "Flow_OuterToRootEnd"),
    userTask(
      "UserTask_Sibling",
      "Sibling",
      "Flow_ChildForkToSibling",
      "Flow_ChildNormalToEnd",
    ),
    userTask(
      "UserTask_Trigger",
      "Trigger",
      "Flow_ChildForkToTrigger",
      "Flow_TriggerToTerminate",
    ),
    {
      id: `operation:complete-scope:${terminateRootScopeId}`,
      kind: SemanticOperationKind.CompleteScope,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: terminateProcessId,
      },
      scopeId: terminateRootScopeId,
      parentOutput: null,
    },
    {
      id: `operation:complete-scope:${terminateChildScopeId}`,
      kind: SemanticOperationKind.CompleteScope,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: "SubProcess_Work",
      },
      scopeId: terminateChildScopeId,
      parentOutput: "place:Flow_ScopeToOuter",
    },
  ],
} as const satisfies SemanticProcessProgram;

export function terminateStartStimulus(): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-terminate-end",
    processId: terminateProcessId,
    instanceId: terminateInstanceId,
    initialVariables: [],
  };
}

export function terminateCompletion(
  elementId: "UserTask_Outer" | "UserTask_Sibling" | "UserTask_Trigger",
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: terminateTaskId(elementId),
    submittedValues: [],
  };
}

export function terminateTaskId(elementId: string): UserTaskInstanceId {
  return {
    processInstanceId: terminateInstanceId,
    elementId,
    activation: 1,
  };
}

function userTask(
  elementId: string,
  name: string,
  inputFlow: string,
  outputFlow: string,
) {
  return {
    ...operationBase(elementId),
    kind: SemanticOperationKind.AwaitUserTask,
    input: `place:${inputFlow}`,
    output: `place:${outputFlow}`,
    task: { elementId, name },
  } as const;
}
