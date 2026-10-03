import BpmnSemantics.SemanticProcess.CallDataStateValidation
import BpmnSemantics.SemanticProcess.WaitCompletion

/-! # Scalar Call state-domain laws

CDATA-OWNER-01 requires every live task to have its composed declaration. This excludes ordinary
completion from the private Call account while preserving predecessor execution propositions.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem callData_valid_wait_has_contract (program : Program) (state : RuntimeState)
    (host : SemanticId) (wait : UserTaskWait)
    (profile : program.identity.semanticProfile = callDataCheckpointProfileId)
    (running : state.control = .running host)
    (valid : callDataRuntimeStateValid program state = true)
    (member : wait ∈ state.waits) :
    ∃ contract, dataInputOutputTaskContract? program wait.task.id = some contract := by
  simp only [callDataRuntimeStateValid, profile, bne_self_eq_false, Bool.false_eq_true,
    ↓reduceIte] at valid
  cases admitted : CallDataAdmission.program? program with
  | none => simp [admitted] at valid
  | some data =>
      simp only [admitted, running, Bool.and_eq_true] at valid
      have allTasks : state.waits.all (callDataTaskValid program state) = true := by grind
      have taskValid := List.all_eq_true.mp allTasks wait member
      cases found : dataInputOutputTaskContract? program wait.task.id with
      | none => simp [callDataTaskValid, found] at taskValid
      | some contract => exact ⟨contract, rfl⟩

theorem callData_valid_completion_has_composed_definition
    (program : Program) (state after : RuntimeState) (host process : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (profile : program.identity.semanticProfile = callDataCheckpointProfileId)
    (running : state.control = .running host)
    (valid : callDataRuntimeStateValid program state = true)
    (completed : completeUserTask state process taskId activation = some after) :
    isDataInputOutputTaskDefinition program taskId = true := by
  unfold completeUserTask at completed
  split at completed
  · contradiction
  · rename_i wait found
    have key := List.find?_some found
    simp only [Bool.and_eq_true, decide_eq_true_eq] at key
    obtain ⟨contract, declared⟩ := callData_valid_wait_has_contract program state host wait
      profile running valid (List.mem_of_find?_eq_some found)
    rw [key.1.2] at declared
    unfold dataInputOutputTaskContract? at declared
    split at declared
    · rename_i singleton
      have member : contract ∈ (dataInputOutputTaskContracts program).filter
          (fun candidate => decide (candidate.taskId = taskId)) := by
        cases Option.some.inj declared
        simp [singleton]
      exact List.any_eq_true.mpr ⟨contract, (List.mem_filter.mp member).1,
        (List.mem_filter.mp member).2⟩
    · contradiction

end BpmnSemantics.SemanticProcess
