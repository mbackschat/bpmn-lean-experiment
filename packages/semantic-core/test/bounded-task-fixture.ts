/**
 * The interrupting Activity boundary Timer program, shared by every family that needs a task body.
 *
 * Hand-built to the shape `@bpmn-lean/bpmn-source` lowers, so consumers depend on no compiler. It is
 * the smallest program whose Activity occurrence record carries a **task** body rather than a child
 * scope, which is what separates it from [the bounded-scope fixture](bounded-scope-fixture.ts).
 */
import {
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

const sourceSha256 =
  "564a36ffc3815bbadc78d739892ae1e74c7137ff44beaa76eb20fad47401f30e";
export const instanceId = "BoundedInstance_1";

export const boundedProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-activity-boundary-timer-draft",
    sourceId: "activity-boundary-timer",
    sourceOverlay: null,
    sourceSha256,
  },
  processId: "Process_ActivityBoundaryTimer",
  controlPlaces: [
    controlPlace("Flow_Boundary"),
    controlPlace("Flow_Boundary_End"),
    controlPlace("Flow_Normal"),
    controlPlace("Flow_Normal_End"),
    controlPlace("Flow_Start"),
  ],
  operations: [
    {
      ...operationBase("BoundaryEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Boundary_End",
    },
    {
      ...operationBase("BoundaryTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Boundary",
      output: "place:Flow_Boundary_End",
      task: { elementId: "BoundaryTask", name: "Deadline reached" },
    },
    {
      ...operationBase("BoundedTask"),
      kind: SemanticOperationKind.AwaitBoundedUserTask,
      input: "place:Flow_Start",
      task: {
        elementId: "BoundedTask",
        name: "Bounded work",
        output: "place:Flow_Normal",
      },
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
      ...operationBase("NormalEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Normal_End",
    },
    {
      ...operationBase("NormalTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Normal",
      output: "place:Flow_Normal_End",
      task: { elementId: "NormalTask", name: "Normal follow-on" },
    },
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start",
    },
  ],
});

export const owner = rootScopeOccurrence(boundedProgram.processId, instanceId);

export const taskId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "BoundedTask",
  activation: 1,
});

export const deadlineId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "Deadline",
  activation: 1,
});

export const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-bounded",
  processId: boundedProgram.processId,
  instanceId,
  initialVariables: [],
});

export const completeBoundedTask = Object.freeze({
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-bounded-task",
  taskId,
  submittedValues: [],
});

export const fireDeadline = Object.freeze({
  kind: StimulusKind.FireTimer,
  commandId: "fire-deadline",
  timerId: deadlineId,
  logicalTimeMs: 1000,
});
