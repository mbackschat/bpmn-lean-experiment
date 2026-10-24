module

public import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.TransitionTrace
public import BpmnSemantics.SemanticProcess.RootScopeFixtures

/-! Shared executable fixtures retain the conformance declaration bodies without importing their proofs. -/

@[expose] public section

namespace BpmnSemantics.EventBasedGatewayConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"bpmn-2.0.2-event-based-gateway-message-timer-draft"⟩

def operationChannel : MessageChannel :=
  .operationMessage ⟨"Interface_Events"⟩ ⟨"Operation_Message"⟩ ⟨"Message_Event"⟩

def processId : ProcessId := ⟨"Process_EventRace"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"event-based-gateway-message-timer"⟩
        sourceSha256 :=
          "4444444444444444444444444444444444444444444444444444444444444444" }
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"End_Message"⟩, ⟨"End_Timer"⟩, ⟨"EventGateway"⟩
      , ⟨"MessageCatch"⟩, ⟨"Start"⟩, ⟨"Task_Message"⟩
      , ⟨"Task_Timer"⟩, ⟨"TimerCatch"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_Gateway_Message"⟩, ⟨"Flow_Gateway_Timer"⟩
      , ⟨"Flow_Message_Task"⟩, ⟨"Flow_Start_Gateway"⟩
      , ⟨"Flow_Task_Message_End"⟩, ⟨"Flow_Task_Timer_End"⟩
      , ⟨"Flow_Timer_Task"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"End_Message"⟩
      , .noneEndEvent ⟨"End_Timer"⟩
      , .eventBasedGateway ⟨"EventGateway"⟩
      , .intermediateCatchMessageEvent ⟨"MessageCatch"⟩ operationChannel
      , .noneStartEvent ⟨"Start"⟩
      , .userTask ⟨"Task_Message"⟩ (some "Message path")
      , .userTask ⟨"Task_Timer"⟩ (some "Timer path")
      , .intermediateCatchTimerEvent ⟨"TimerCatch"⟩ "PT1S" ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Gateway_Message"⟩, sourceId := ⟨"EventGateway"⟩,
          targetId := ⟨"MessageCatch"⟩ }
      , { id := ⟨"Flow_Gateway_Timer"⟩, sourceId := ⟨"EventGateway"⟩,
          targetId := ⟨"TimerCatch"⟩ }
      , { id := ⟨"Flow_Message_Task"⟩, sourceId := ⟨"MessageCatch"⟩,
          targetId := ⟨"Task_Message"⟩ }
      , { id := ⟨"Flow_Start_Gateway"⟩, sourceId := ⟨"Start"⟩,
          targetId := ⟨"EventGateway"⟩ }
      , { id := ⟨"Flow_Task_Message_End"⟩, sourceId := ⟨"Task_Message"⟩,
          targetId := ⟨"End_Message"⟩ }
      , { id := ⟨"Flow_Task_Timer_End"⟩, sourceId := ⟨"Task_Timer"⟩,
          targetId := ⟨"End_Timer"⟩ }
      , { id := ⟨"Flow_Timer_Task"⟩, sourceId := ⟨"TimerCatch"⟩,
          targetId := ⟨"Task_Timer"⟩ } ] }

def program : Program := lowerCheckedProcess checkedProcess

def instanceId : SemanticId := ⟨"EventRaceInstance"⟩

def messageSubscriptionId : MessageSubscriptionId :=
  { processInstanceId := instanceId
    elementId := ⟨"MessageCatch"⟩
    activation := 1 }

def timerOccurrenceId : TimerOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"TimerCatch"⟩
    activation := 1 }

def primaryRace : EventRace :=
  { id :=
      { processInstanceId := instanceId
        elementId := ⟨"EventGateway"⟩
        activation := 1 }
    owner := rootScopeOccurrenceId instanceId processId
    messageSubscriptionId
    timerOccurrenceId }

def duplicateAssociationRace : EventRace :=
  { primaryRace with id := { primaryRace.id with activation := 2 } }

def startStimulus : Stimulus :=
  .startProcess ⟨"start-event-race"⟩ ⟨processId.value⟩ instanceId []

def messageStimulus : Stimulus :=
  .deliverMessage ⟨"deliver-race-message"⟩ messageSubscriptionId
    operationChannel

def timerStimulus : Stimulus :=
  .fireTimer ⟨"fire-race-timer"⟩ timerOccurrenceId 1000

def completeMessageTask : Stimulus :=
  .completeUserTaskInstance ⟨"complete-message-task"⟩
    { processInstanceId := instanceId
      elementId := ⟨"Task_Message"⟩
      activation := 1 } []

def completeTimerTask : Stimulus :=
  .completeUserTaskInstance ⟨"complete-timer-task"⟩
    { processInstanceId := instanceId
      elementId := ⟨"Task_Timer"⟩
      activation := 1 } []

def armed : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState startStimulus

end BpmnSemantics.EventBasedGatewayConformance
