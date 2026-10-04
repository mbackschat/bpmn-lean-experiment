import BpmnSemantics.SemanticProcess.EffectCompletion
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! SBT-REFUSE-01 and MBERR-REFUSE-01 require complete declaration/wait/local ownership checks before any public command can mutate a business-task state. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- SBT-REFUSE-01 and MTCF retain the same single-control-unit ingress and definition/occurrence associations. -/
def serialBusinessCommandAdmitted (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) : Bool :=
  if program.identity.semanticProfile != serialBusinessTaskProfileId && program.identity.semanticProfile != mixedTaskControlFlowProfileId &&
      program.identity.semanticProfile != mixedTaskBusinessErrorProfileId then true
  else programWellFormed program && programProfileCapabilitiesValid program &&
    SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program)
      state.variables.process.bindings &&
    serialRuntimeAssociationsValid program state
      (program.identity.semanticProfile == mixedTaskBusinessErrorProfileId) &&
    (match state.control with
      | .notStarted => state == initialState
      | .running instanceId | .completed instanceId => runtimeStateWellFormed program instanceId state
      | _ => false) &&
    match stimulus with
    | .startProcess _ _ instanceId _ => !instanceId.value.isEmpty
    | .completeUserTaskInstance .. | .completeEffect .. => true
    | _ => false

@[simp] theorem serialBusinessCommandAdmitted_of_other_profile
    (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (unselected : program.identity.semanticProfile ≠ serialBusinessTaskProfileId)
    (unselectedMixed : program.identity.semanticProfile ≠ mixedTaskControlFlowProfileId)
    (unselectedError : program.identity.semanticProfile ≠ mixedTaskBusinessErrorProfileId) :
    serialBusinessCommandAdmitted program state stimulus = true := by
  unfold serialBusinessCommandAdmitted
  simp only [Bool.and_eq_true, bne_iff_ne]
  exact if_pos ⟨⟨unselected, unselectedMixed⟩, unselectedError⟩

end BpmnSemantics.SemanticProcess
