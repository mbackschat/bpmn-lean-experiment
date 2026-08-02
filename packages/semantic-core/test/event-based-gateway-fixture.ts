import {
  MessageChannelKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  FireTimerStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

export const eventRaceProgram: SemanticProcessProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-event-based-gateway-message-timer-draft",
    sourceId: "event-race",
    sourceSha256: "9".repeat(64),
  },
  processId: "Process_EventRace",
  controlPlaces: [
    "Flow_Message_End",
    "Flow_Message_Task",
    "Flow_Start",
    "Flow_Timer_End",
    "Flow_Timer_Task",
  ].map(controlPlace),
  operations: [
    {
      ...operationBase("MessageEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Message_End",
    },
    {
      ...operationBase("MessageTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Message_Task",
      output: "place:Flow_Message_End",
      task: { elementId: "MessageTask", name: "Message selected" },
    },
    {
      ...operationBase("Race"),
      kind: SemanticOperationKind.AwaitEventRace,
      input: "place:Flow_Start",
      message: {
        configurationOrigin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_Message_Config",
        },
        elementId: "MessageCatch",
        channel: {
          kind: MessageChannelKind.OperationMessage,
          interfaceId: "Interface_ProcessMessages",
          interfaceOperationId: "Operation_ReceiveApproval",
          messageId: "Message_Approval",
        },
        output: "place:Flow_Message_Task",
      },
      timer: {
        configurationOrigin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_Timer_Config",
        },
        elementId: "TimerCatch",
        durationMs: 1000,
        output: "place:Flow_Timer_Task",
      },
    },
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start",
    },
    {
      ...operationBase("TimerEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Timer_End",
    },
    {
      ...operationBase("TimerTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Timer_Task",
      output: "place:Flow_Timer_End",
      task: { elementId: "TimerTask", name: "Timer selected" },
    },
  ],
});

export const eventRaceStart: StartProcessStimulus = {
  kind: StimulusKind.StartProcess,
  commandId: "start-event-race",
  processId: eventRaceProgram.processId,
  instanceId: "event-race-instance",
  initialVariables: [],
};

export function messageDelivery(
  commandId = "deliver-event-race-message",
): DeliverMessageStimulus {
  const operation = eventRaceProgram.operations.find(
    (candidate) => candidate.kind === SemanticOperationKind.AwaitEventRace,
  );
  if (operation?.kind !== SemanticOperationKind.AwaitEventRace) {
    throw new TypeError("Event race operation is missing");
  }
  return {
    kind: StimulusKind.DeliverMessage,
    commandId,
    subscriptionId: {
      processInstanceId: eventRaceStart.instanceId,
      elementId: operation.message.elementId,
      activation: 1,
    },
    channel: operation.message.channel,
  };
}

export function timerFiring(
  commandId = "fire-event-race-timer",
): FireTimerStimulus {
  return {
    kind: StimulusKind.FireTimer,
    commandId,
    timerId: {
      processInstanceId: eventRaceStart.instanceId,
      elementId: "TimerCatch",
      activation: 1,
    },
    logicalTimeMs: 1000,
  };
}

export function taskCompletion(
  elementId: "MessageTask" | "TimerTask",
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: {
      processInstanceId: eventRaceStart.instanceId,
      elementId,
      activation: 1,
    },
    submittedValues: [],
  };
}
