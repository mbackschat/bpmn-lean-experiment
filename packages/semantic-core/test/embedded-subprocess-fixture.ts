import {
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

export const processId = "Process_EmbeddedSubProcess";
export const rootScopeId = "scope:Process_EmbeddedSubProcess";
export const childScopeId = "scope:SubProcess_Work";
export const instanceId = "EmbeddedSubProcessInstance_1";

export const program = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile:
      "cibseven-2.2.0-embedded-subprocess-completion-draft",
    sourceId: "embedded-subprocess-completion-process",
    sourceOverlay: null,
    sourceSha256:
      "6ca0aa3bccb005de1ac4b6ef6283f2a29c4f4ef7c3e8aff6bf29d79247f09a36",
  },
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  processId,
  definitionScopes: [
    {
      id: rootScopeId,
      parentScopeId: null,
      originElementId: processId,
    },
    {
      id: childScopeId,
      parentScopeId: rootScopeId,
      originElementId: "SubProcess_Work",
    },
  ],
  operationScopes: ([
    ["operation:EndEvent_ChildA", childScopeId],
    ["operation:EndEvent_ChildB", childScopeId],
    ["operation:EndEvent_Outer", rootScopeId],
    ["operation:Gateway_ChildFork", childScopeId],
    ["operation:StartEvent_Outer", rootScopeId],
    ["operation:SubProcess_Work", rootScopeId],
    ["operation:UserTask_AfterScope", rootScopeId],
    ["operation:UserTask_ChildA", childScopeId],
    ["operation:UserTask_ChildB", childScopeId],
    ["operation:complete-scope:scope:Process_EmbeddedSubProcess", rootScopeId],
    ["operation:complete-scope:scope:SubProcess_Work", childScopeId],
  ] as const).map(([operationId, scopeId]) => ({ operationId, scopeId })),
  controlPlaceScopes: ([
    ["place:Flow_AfterToOuterEnd", rootScopeId],
    ["place:Flow_ChildAToEnd", childScopeId],
    ["place:Flow_ChildBToEnd", childScopeId],
    ["place:Flow_ChildForkToA", childScopeId],
    ["place:Flow_ChildForkToB", childScopeId],
    ["place:Flow_ChildStartToFork", childScopeId],
    ["place:Flow_OuterStartToScope", rootScopeId],
    ["place:Flow_ScopeToAfter", rootScopeId],
  ] as const).map(([controlPlaceId, scopeId]) => ({ controlPlaceId, scopeId })),
  controlPlaces: [
    "Flow_AfterToOuterEnd",
    "Flow_ChildAToEnd",
    "Flow_ChildBToEnd",
    "Flow_ChildForkToA",
    "Flow_ChildForkToB",
    "Flow_ChildStartToFork",
    "Flow_OuterStartToScope",
    "Flow_ScopeToAfter",
  ].map(controlPlace),
  operations: [
    {
      ...operationBase("EndEvent_ChildA"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_ChildAToEnd",
    },
    {
      ...operationBase("EndEvent_ChildB"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_ChildBToEnd",
    },
    {
      ...operationBase("EndEvent_Outer"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_AfterToOuterEnd",
    },
    {
      ...operationBase("Gateway_ChildFork"),
      kind: SemanticOperationKind.Duplicate,
      input: "place:Flow_ChildStartToFork",
      outputs: ["place:Flow_ChildForkToA", "place:Flow_ChildForkToB"],
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
      childScopeId,
    },
    userTask("UserTask_AfterScope", "After Scope",
      "Flow_ScopeToAfter", "Flow_AfterToOuterEnd"),
    userTask("UserTask_ChildA", "Child A",
      "Flow_ChildForkToA", "Flow_ChildAToEnd"),
    userTask("UserTask_ChildB", "Child B",
      "Flow_ChildForkToB", "Flow_ChildBToEnd"),
    {
      id: "operation:complete-scope:scope:Process_EmbeddedSubProcess",
      kind: SemanticOperationKind.CompleteScope,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: processId },
      scopeId: rootScopeId,
      parentOutput: null,
    },
    {
      id: "operation:complete-scope:scope:SubProcess_Work",
      kind: SemanticOperationKind.CompleteScope,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: "SubProcess_Work",
      },
      scopeId: childScopeId,
      parentOutput: "place:Flow_ScopeToAfter",
    },
  ],
} as const satisfies SemanticProcessProgram;

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

export function startStimulus(): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-embedded-subprocess",
    processId,
    instanceId,
    initialVariables: [],
  };
}

