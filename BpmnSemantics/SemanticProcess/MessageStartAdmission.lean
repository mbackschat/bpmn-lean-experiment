import BpmnSemantics.SemanticProcess.MessageStart
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.TimerStartAdmission

/-! # Message Start Event external admission

This module owns exact resolved-trigger admission against the Message Start profile and its single admitted IL start operation. It creates no subscription and performs no routing.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def messageStartProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-message-start-event-draft"⟩

/-- The ordinary start command can select only the existing None Start operation family. -/
def ordinaryStartMatchesProgram (program : Program) : Bool :=
  match program.operations.filter fun operation =>
      match operation with
      | .initiate .. | .initiateMessage .. | .initiateTimer .. => true
      | _ => false with
  | [.initiate ..] => true
  | _ => false

/-- Match one resolved Message Start target to the sole admitted Message initiation operation. -/
def messageStartTargetMatchesProgram (program : Program)
    (processId startEventId : SemanticId) (channel : MessageChannel) : Bool :=
  program.identity.semanticProfile = messageStartProfileId &&
    programWellFormed program &&
    programProfileCapabilitiesValid program &&
    program.processId.value = processId.value &&
    match program.operations.filterMap fun
        | .initiateMessage _ origin expectedChannel _ =>
            some (origin.elementId, expectedChannel)
        | _ => none with
    | [(originId, expectedChannel)] =>
        originId.value = startEventId.value && expectedChannel = channel
    | _ => false

/-- Pair the closed external start family with the start operation admitted by a program. -/
def startStimulusMatchesProgram (program : Program) : Stimulus → Bool
  | .startProcess .. => ordinaryStartMatchesProgram program
  | .triggerMessageStart _ processId _ startEventId channel =>
      messageStartTargetMatchesProgram program processId startEventId channel
  | .triggerTimerStart _ processId _ startEventId =>
      timerStartTargetMatchesProgram program processId startEventId
  | .completeUserTaskInstance .. | .deliverMessage .. | .deliverPayloadMessage ..
  | .fireTimer ..
  | .completeEffect .. | .reportEffectFailure .. | .retryIncident ..
  | .cancelIncidentProcess .. => false

/-- Admit one resolved operation-addressed Message trigger against one exact checked IL start. -/
def admitMessageStart? (program : Program) (state : RuntimeState)
    (processId instanceId startEventId : SemanticId)
    (channel : MessageChannel) : Option RuntimeState :=
  match state.control with
  | .notStarted =>
      if messageStartTargetMatchesProgram program processId startEventId
          channel then
        runningProgramStartState? program instanceId []
      else none
  | .running _ | .completed _ | .cancelled _ => none

end BpmnSemantics.SemanticProcess
