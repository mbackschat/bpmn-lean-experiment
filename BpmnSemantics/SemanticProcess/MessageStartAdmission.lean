import BpmnSemantics.SemanticProcess.MessageStart
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation

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
      | .initiate .. | .initiateMessage .. => true
      | _ => false with
  | [.initiate ..] => true
  | _ => false

/-- Admit one resolved operation-addressed Message trigger against one exact checked IL start. -/
def admitMessageStart? (program : Program) (state : RuntimeState)
    (processId instanceId startEventId : SemanticId)
    (channel : MessageChannel) : Option RuntimeState :=
  match state.control with
  | .notStarted =>
      if program.identity.semanticProfile = messageStartProfileId &&
          programWellFormed program &&
          programProfileCapabilitiesValid program &&
          program.processId.value = processId.value then
        match program.operations.filterMap fun
            | .initiateMessage _ origin expectedChannel _ =>
                some (origin.elementId, expectedChannel)
            | _ => none with
        | [(originId, expectedChannel)] =>
            if originId.value = startEventId.value &&
                expectedChannel = channel then
              runningProgramStartState? program instanceId []
            else none
        | _ => none
      else none
  | .running _ | .completed _ => none

end BpmnSemantics.SemanticProcess
