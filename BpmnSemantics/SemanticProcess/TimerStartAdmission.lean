import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.TimerStart

/-! # Timer Start Event external admission

This module owns exact resolved Timer Start admission against the registered profile and its single admitted IL start operation. It creates no runtime Timer and performs no scheduling.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def timerStartProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-timer-start-event-draft"⟩

/-- Match one resolved Timer Start target to the sole admitted normalized timer-initiation operation. -/
def timerStartTargetMatchesProgram (program : Program)
    (processId startEventId : SemanticId) : Bool :=
  program.identity.semanticProfile = timerStartProfileId &&
    programWellFormed program &&
    programProfileCapabilitiesValid program &&
    program.processId.value = processId.value &&
    match program.operations.filterMap fun
        | .initiateTimer _ origin durationMs _ =>
            some (origin.elementId, durationMs)
        | _ => none with
    | [(originId, durationMs)] =>
        originId.value = startEventId.value && durationMs = 1000
    | _ => false

/-- Admit one resolved Timer Start occurrence against one exact checked IL start. -/
def admitTimerStart? (program : Program) (state : RuntimeState)
    (processId instanceId startEventId : SemanticId) : Option RuntimeState :=
  match state.control with
  | .notStarted =>
      if timerStartTargetMatchesProgram program processId startEventId then
        runningProgramStartState? program instanceId []
      else none
  | .running _ | .completed _ | .cancelled _ => none

end BpmnSemantics.SemanticProcess
