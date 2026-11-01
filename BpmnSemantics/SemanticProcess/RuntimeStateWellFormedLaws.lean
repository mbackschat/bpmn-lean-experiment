module

public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws

/-! # Runtime-state well-formedness laws

The wait-key census facts about [`RuntimeStateWellFormed`](RuntimeStateWellFormed.lean), proved with the equation laws of [`ProgramStructuralValidationLaws`](ProgramStructuralValidationLaws.lean): kept apart so that the runtime predicate need not open the structural validation, whose body edits then rebuild this module and its importers' proofs instead of every module that opens the runtime predicate ([module rules](../../docs/LEAN-BUILD-MODULARITY-SPEC.md#module-rules)).
-/


public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem nodeId_eq_iff_value_eq (left right : NodeId) :
    left = right ↔ left.value = right.value := by
  constructor
  · intro equal
    cases equal
    rfl
  · intro equal
    cases left
    cases right
    simp_all

private theorem taskDefinitionId_eq_iff_value_eq (left right : TaskDefinitionId) :
    left = right ↔ left.value = right.value := by
  constructor
  · intro equal
    cases equal
    rfl
  · intro equal
    cases left
    cases right
    simp_all

/-- The runtime Timer declarer census is the Timer projection of structural wait keys. -/
theorem timerWaitDeclarers_eq_keyFilter (program : Program) (elementId : NodeId) :
    timerWaitDeclarers program elementId =
      program.operations.filter (fun operation =>
        operationDeclaresWaitKey operation (timerWaitDeclarationKey elementId)) := by
  unfold timerWaitDeclarers
  apply List.filter_congr
  intro operation _
  cases operation <;> simp [operationDeclaresWaitKey_eq, operationWaitDeclarationKeys_eq,
    userTaskWaitDeclarationKey_eq, messageWaitDeclarationKey_eq, timerWaitDeclarationKey_eq,
    effectWaitDeclarationKey_eq, nodeId_eq_iff_value_eq, eq_comm]

/-- The runtime Message declarer census is the Message projection of structural wait keys. -/
theorem messageWaitDeclarers_eq_keyFilter (program : Program) (elementId : NodeId) :
    messageWaitDeclarers program elementId =
      program.operations.filter (fun operation =>
        operationDeclaresWaitKey operation (messageWaitDeclarationKey elementId)) := by
  unfold messageWaitDeclarers
  apply List.filter_congr
  intro operation _
  cases operation <;> simp [operationDeclaresWaitKey_eq, operationWaitDeclarationKeys_eq,
    userTaskWaitDeclarationKey_eq, messageWaitDeclarationKey_eq, timerWaitDeclarationKey_eq,
    effectWaitDeclarationKey_eq, nodeId_eq_iff_value_eq, eq_comm]

/-- The runtime User Task declarer census is the User Task projection of structural wait keys. -/
theorem userTaskWaitDeclarers_eq_keyFilter (program : Program) (taskId : TaskDefinitionId) :
    userTaskWaitDeclarers program taskId =
      program.operations.filter (fun operation =>
        operationDeclaresWaitKey operation (userTaskWaitDeclarationKey taskId)) := by
  unfold userTaskWaitDeclarers
  apply List.filter_congr
  intro operation _
  cases operation <;> simp [operationDeclaresWaitKey_eq, operationWaitDeclarationKeys_eq,
    userTaskWaitDeclarationKey_eq, messageWaitDeclarationKey_eq, timerWaitDeclarationKey_eq,
    effectWaitDeclarationKey_eq, taskDefinitionId_eq_iff_value_eq, eq_comm]

/-- The runtime Effect declarer census is the Effect projection of structural wait keys. -/
theorem effectWaitDeclarers_eq_keyFilter (program : Program) (elementId : NodeId) :
    effectWaitDeclarers program elementId =
      program.operations.filter (fun operation =>
        operationDeclaresWaitKey operation (effectWaitDeclarationKey elementId)) := by
  unfold effectWaitDeclarers
  apply List.filter_congr
  intro operation _
  cases operation <;> simp [operationDeclaresWaitKey_eq, operationWaitDeclarationKeys_eq,
    userTaskWaitDeclarationKey_eq, messageWaitDeclarationKey_eq, timerWaitDeclarationKey_eq,
    effectWaitDeclarationKey_eq, nodeId_eq_iff_value_eq, eq_comm]

end BpmnSemantics.SemanticProcess
