module

public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! # FlowNodeOccurrenceLifecycle laws

The laws that proofs consume, apart from the definitions in [`FlowNodeOccurrenceLifecycle`](FlowNodeOccurrenceLifecycle.lean): a proof edit here rebuilds no module that imports those definitions with `import all` to reduce their bodies ([hidden-edit fanout](../../docs/LEAN-BUILD-MODULARITY-SPEC.md#contract)).
-/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem mem_insertBy (before : α → α → Bool) (value inserted : α) (values : List α) : value ∈ insertBy before inserted values ↔ value = inserted ∨ value ∈ values := by
  induction values with
  | nil => simp [insertBy]
  | cons head tail ih =>
      simp only [insertBy]
      split <;> simp_all [or_left_comm]

private theorem mem_lifecycleSortBy (before : α → α → Bool) (value : α) (values : List α) : value ∈ sortBy before values ↔ value ∈ values := by
  induction values with
  | nil => simp [sortBy]
  | cons head tail ih => simp [sortBy, mem_insertBy, ih]

theorem mem_sortFlowNodeOccurrenceStarts (value : UnnumberedFlowNodeOccurrenceStart) (values : List UnnumberedFlowNodeOccurrenceStart) : value ∈ sortFlowNodeOccurrenceStarts values ↔ value ∈ values := by
  exact mem_lifecycleSortBy startBefore value values

theorem sortFlowNodeOccurrenceEnds_perm (values : List UnnumberedFlowNodeOccurrenceEnd) :
    (sortFlowNodeOccurrenceEnds values).Perm values :=
  sortBy_perm (fun left right : UnnumberedFlowNodeOccurrenceEnd => flowNodeOccurrenceAnchorBefore left.anchor right.anchor) values

theorem mem_sortFlowNodeOccurrenceEnds (value : UnnumberedFlowNodeOccurrenceEnd) (values : List UnnumberedFlowNodeOccurrenceEnd) : value ∈ sortFlowNodeOccurrenceEnds values ↔ value ∈ values := by
  exact mem_lifecycleSortBy (fun left right => flowNodeOccurrenceAnchorBefore left.anchor right.anchor) value values

theorem mem_removeEndedFlowNodeOccurrences (occurrence : OpenSemanticFlowNodeOccurrence)
    (available : List OpenSemanticFlowNodeOccurrence)
    (ended : List UnnumberedFlowNodeOccurrenceEnd) :
    occurrence ∈ removeEndedFlowNodeOccurrences available ended ↔
      occurrence ∈ available ∧ !(ended.map (·.anchor)).contains occurrence.anchor = true := by
  simp [removeEndedFlowNodeOccurrences]

end BpmnSemantics.SemanticProcess
