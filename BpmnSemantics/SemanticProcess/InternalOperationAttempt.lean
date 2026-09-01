import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot

/-! # Refusable internal operation attempts

The closed attempt result and snapshot-successor validator are shared by the internal transition
dispatcher and its lifecycle proofs. Keeping the validator beside the result type prevents the
dispatcher from accumulating proof-facing infrastructure.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

structure AppliedInternalOperation where
  operation : SemanticOperation
  successor : RuntimeState
  deriving Repr, DecidableEq

inductive InternalOperationAttempt where
  | disabled (operation : SemanticOperation)
  | applied (step : AppliedInternalOperation)
  | refused (operation : SemanticOperation)
      (reason : CompensationParentContextRefusal)
  deriving Repr, DecidableEq

def InternalOperationAttempt.operation : InternalOperationAttempt → SemanticOperation
  | .disabled operation | .refused operation _ => operation
  | .applied step => step.operation

/-- Validate one snapshot-aware successor before it becomes an applied internal operation. -/
def applyValidSnapshotSuccessor (program : Program)
    (operation : SemanticOperation) (successor : RuntimeState) :
    InternalOperationAttempt :=
  if compensationEventSubProcessSnapshotStateValid program successor then
    .applied { operation, successor }
  else
    .refused operation .invalidState

/-- An applied snapshot-aware successor has passed the complete aggregate-state invariant. -/
theorem applyValidSnapshotSuccessor_applied_stateValid
    (program : Program) (operation : SemanticOperation) (successor : RuntimeState)
    (step : AppliedInternalOperation)
    (applied : applyValidSnapshotSuccessor program operation successor = .applied step) :
    compensationEventSubProcessSnapshotStateValid program step.successor = true := by
  grind [applyValidSnapshotSuccessor]

theorem applyValidSnapshotSuccessor_applied_shape
    (program : Program) (operation : SemanticOperation) (successor : RuntimeState)
    (step : AppliedInternalOperation)
    (applied : applyValidSnapshotSuccessor program operation successor = .applied step) :
    step.operation = operation ∧ step.successor = successor := by
  grind [applyValidSnapshotSuccessor]

end BpmnSemantics.SemanticProcess
