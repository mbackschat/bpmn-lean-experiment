import BpmnSemantics.SemanticProcess.InternalCommutationCore

/-! Scope and Call dependencies retain their complete typed identities under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem scope_and_call_activation_domains_are_distinct (element : NodeId) :
    InternalStateAtom.activation .scope element ≠ .activation .call element := by
  simp

theorem parent_absence_precedes_parent_presence (owner parent : ScopeOccurrenceId) :
    stateAtomBefore (.scopeParent owner none) (.scopeParent owner (some parent)) = true := by
  simp [stateAtomBefore, stateAtomRank]

theorem parent_identity_separates_same_child_atoms
    (owner left right : ScopeOccurrenceId)
    (ordered : scopeBefore left right = true) :
    stateAtomBefore (.scopeParent owner (some left))
      (.scopeParent owner (some right)) = true := by
  simp [stateAtomBefore, stateAtomRank, ordered]

theorem call_return_identity_separates_otherwise_equal_associations
    (record : CalledProcessOccurrence) (left right : OperationId)
    (ordered : left.value < right.value) :
    stateAtomBefore (.callAssociation { record with returnOperationId := left })
      (.callAssociation { record with returnOperationId := right }) = true := by
  simp [stateAtomBefore, stateAtomRank, ordered]

end BpmnSemantics.SemanticProcess.InternalCommutation
