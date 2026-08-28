/**
 * The one exact interrupting Sub-Process boundary Timer program and its stimuli.
 *
 * Extracted so the family's behavior tests and the shared Activity occurrence lane read the same
 * program rather than two hand-built copies that could drift apart. It imports only the
 * representation it constructs, per the fixture-cohesion rule, and holds no assertion or schedule of
 * its own.
 */
import {
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";

export const processId = "Process_SubProcessBoundaryTimer";
export const rootScopeId = `scope:${processId}`;
export const childScopeId = "scope:Scope";
export const instanceId = "BoundedScopeInstance_1";

export const rootOccurrence = Object.freeze({
  processInstanceId: instanceId,
  definitionScopeId: rootScopeId,
  activation: 1,
});

export const childOccurrence = Object.freeze({
  processInstanceId: instanceId,
  definitionScopeId: childScopeId,
  activation: 1,
});

/** Hand-built to the exact shape `@bpmn-lean/bpmn-source` lowers, so this lane depends on no compiler. */
export const boundedScopeProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-subprocess-boundary-timer-draft",
    sourceId: "subprocess-boundary-timer",
    sourceOverlay: null,
    sourceSha256:
      "dc2875fb0c24deeab9d8f180fa4adf44652a504778f3dda187ac19839e60016e",
  },
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  processId,
  definitionScopes: [
    { id: rootScopeId, parentScopeId: null, originElementId: processId },
    { id: childScopeId, parentScopeId: rootScopeId, originElementId: "Scope" },
  ],
  operationScopes: [
    { operationId: "operation:AfterScope", scopeId: rootScopeId },
    { operationId: "operation:BoundaryEnd", scopeId: rootScopeId },
    { operationId: "operation:ChildEnd", scopeId: childScopeId },
    { operationId: "operation:ChildTask", scopeId: childScopeId },
    { operationId: "operation:EscalationTask", scopeId: rootScopeId },
    { operationId: "operation:NormalEnd", scopeId: rootScopeId },
    { operationId: "operation:Scope", scopeId: rootScopeId },
    { operationId: "operation:Start", scopeId: rootScopeId },
    {
      operationId: `operation:complete-scope:${rootScopeId}`,
      scopeId: rootScopeId,
    },
    {
      operationId: `operation:complete-scope:${childScopeId}`,
      scopeId: childScopeId,
    },
  ],
  controlPlaceScopes: [
    { controlPlaceId: "place:Flow_Boundary", scopeId: rootScopeId },
    { controlPlaceId: "place:Flow_Boundary_End", scopeId: rootScopeId },
    { controlPlaceId: "place:Flow_Child", scopeId: childScopeId },
    { controlPlaceId: "place:Flow_Child_End", scopeId: childScopeId },
    { controlPlaceId: "place:Flow_Normal", scopeId: rootScopeId },
    { controlPlaceId: "place:Flow_Normal_End", scopeId: rootScopeId },
    { controlPlaceId: "place:Flow_Start", scopeId: rootScopeId },
  ],
  controlPlaces: [
    controlPlace("Flow_Boundary"),
    controlPlace("Flow_Boundary_End"),
    controlPlace("Flow_Child"),
    controlPlace("Flow_Child_End"),
    controlPlace("Flow_Normal"),
    controlPlace("Flow_Normal_End"),
    controlPlace("Flow_Start"),
  ],
  operations: [
    {
      ...operationBase("AfterScope"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Normal",
      output: "place:Flow_Normal_End",
      task: { elementId: "AfterScope", name: "Scope completed in time" },
    },
    {
      ...operationBase("BoundaryEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Boundary_End",
    },
    {
      ...operationBase("ChildEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Child_End",
    },
    {
      ...operationBase("ChildTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Child",
      output: "place:Flow_Child_End",
      task: { elementId: "ChildTask", name: "Work inside the scope" },
    },
    {
      ...operationBase("EscalationTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Boundary",
      output: "place:Flow_Boundary_End",
      task: { elementId: "EscalationTask", name: "Deadline reached" },
    },
    {
      ...operationBase("NormalEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Normal_End",
    },
    {
      ...operationBase("Scope"),
      kind: SemanticOperationKind.EnterBoundedScope,
      input: "place:Flow_Start",
      childEntry: "place:Flow_Child",
      childScopeId,
      boundaryTimer: {
        elementId: "Deadline",
        durationMs: 1000,
        output: "place:Flow_Boundary",
        origin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_Boundary",
        },
      },
    },
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start",
    },
    {
      id: `operation:complete-scope:${rootScopeId}`,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: processId },
      kind: SemanticOperationKind.CompleteScope,
      scopeId: rootScopeId,
      parentOutput: null,
    },
    {
      id: `operation:complete-scope:${childScopeId}`,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Scope" },
      kind: SemanticOperationKind.CompleteScope,
      scopeId: childScopeId,
      parentOutput: "place:Flow_Normal",
    },
  ],
} as const satisfies SemanticProcessProgram;

export const childTaskId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "ChildTask",
  activation: 1,
});

export const deadlineId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "Deadline",
  activation: 1,
});

export const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-bounded-scope",
  processId,
  instanceId,
  initialVariables: [],
});

export const completeChildTask = Object.freeze({
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-child-task",
  taskId: childTaskId,
  submittedValues: [],
});

export const fireDeadline = Object.freeze({
  kind: StimulusKind.FireTimer,
  commandId: "fire-deadline",
  timerId: deadlineId,
  logicalTimeMs: 1000,
});
