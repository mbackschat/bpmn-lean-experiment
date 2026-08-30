/**
 * The non-interrupting Activity boundary Timer program.
 *
 * Hand-built to the shape `@bpmn-lean/bpmn-source` lowers, so consumers depend on no compiler. It is
 * the smallest program in which an Activity occurrence record's attached-handler list *changes while
 * its body stays open*: firing the reminder empties `attachedHandlers` and the host User Task wait
 * survives. That is the one shape that separates a retained snapshot of the list from a derivation of
 * it, which is why this fixture is shared rather than private to one family test.
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
  "d4d0f1c1b0e0a4f6ba2c8d7e5f3a1b9c7e6d5c4b3a2918070605040302010009";
export const instanceId = "MonitoredInstance_1";

export const monitoredProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-non-interrupting-boundary-timer-draft",
    sourceId: "non-interrupting-boundary-timer",
    sourceOverlay: null,
    sourceSha256,
  },
  processId: "Process_NonInterruptingBoundaryTimer",
  controlPlaces: [
    controlPlace("Flow_Boundary"),
    controlPlace("Flow_Boundary_End"),
    controlPlace("Flow_Normal"),
    controlPlace("Flow_Normal_End"),
    controlPlace("Flow_Start"),
  ],
  operations: [
    {
      ...operationBase("HandlerEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Boundary_End",
    },
    {
      ...operationBase("HandlerTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Boundary",
      output: "place:Flow_Boundary_End",
      task: { elementId: "HandlerTask", name: "Reminder handled" },
    },
    {
      ...operationBase("MonitoredTask"),
      kind: SemanticOperationKind.AwaitMonitoredUserTask,
      input: "place:Flow_Start",
      task: {
        elementId: "MonitoredTask",
        name: "Monitored work",
        output: "place:Flow_Normal",
      },
      boundaryTimer: {
        elementId: "Reminder",
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
      task: { elementId: "NormalTask", name: "Monitored work finished" },
    },
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start",
    },
  ],
});

export const owner = rootScopeOccurrence(monitoredProgram.processId, instanceId);

export const taskId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "MonitoredTask",
  activation: 1,
});

export const reminderId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "Reminder",
  activation: 1,
});

export const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-monitored",
  processId: monitoredProgram.processId,
  instanceId,
  initialVariables: [],
});

export const completeMonitoredTask = Object.freeze({
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-monitored-task",
  taskId,
  submittedValues: [],
});

export const fireReminder = Object.freeze({
  kind: StimulusKind.FireTimer,
  commandId: "fire-reminder",
  timerId: reminderId,
  logicalTimeMs: 1000,
});
