import BpmnSemantics.Experiments.CheckedSourceFrontier

/-! # Two-token checked-source frontiers

This module owns order-independent facts about enabled checked-source transitions at two distinct Sequence Flow tokens aimed at two distinct checked nodes, plus the generic two-anchor `filterMap` isolation law used by that account. It adds no runtime state, observation, or selector.
-/

namespace BpmnSemantics.Experiments.CheckedSourceParallelFrontier

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.Experiments.CheckedSourceAdmission
open BpmnSemantics.Experiments.CheckedSourceFrontier
open BpmnSemantics.Experiments.CheckedSourceSemantics

/-- The executable distinctness predicate yields `List.Nodup`. -/
theorem allDistinct_nodup {α} [DecidableEq α] :
    ∀ items : List α, allDistinct items = true → items.Nodup
  | [], _ => List.nodup_nil
  | item :: rest, distinct => by
      simp only [allDistinct, Bool.and_eq_true, Bool.not_eq_true'] at distinct
      exact List.nodup_cons.mpr
        ⟨by simpa using distinct.1, allDistinct_nodup rest distinct.2⟩

/-- If every differently keyed member yields `none`, `filterMap` isolates two distinct-key anchors up to order. -/
theorem filterMap_isolated_pair {α β γ} [DecidableEq α] [DecidableEq γ]
    (key : α → γ) (predicate : α → Option β) (anchorA anchorB : α)
    (items : List α) (memberA : anchorA ∈ items) (memberB : anchorB ∈ items)
    (keysDiffer : key anchorA ≠ key anchorB)
    (distinct : allDistinct (items.map key) = true)
    (miss : ∀ item ∈ items, key item ≠ key anchorA → key item ≠ key anchorB →
      predicate item = none) :
    (items.filterMap predicate).Perm
      ((predicate anchorA).toList ++ (predicate anchorB).toList) := by
  have anchorsDiffer : anchorA ≠ anchorB := fun equal =>
    keysDiffer (congrArg key equal)
  have rotate : items.Perm
      (anchorA :: anchorB :: (items.erase anchorA).erase anchorB) :=
    (List.perm_cons_erase memberA).trans (List.Perm.cons _
      (List.perm_cons_erase
        ((List.mem_erase_of_ne (Ne.symm anchorsDiffer)).mpr memberB)))
  have keysNodup :=
    ((rotate.map key).nodup_iff.mp (allDistinct_nodup _ distinct))
  simp only [List.map_cons, List.nodup_cons, List.mem_cons, List.mem_map] at keysNodup
  have restEmpty :
      ((items.erase anchorA).erase anchorB).filterMap predicate = [] := by
    refine List.filterMap_eq_nil_iff.mpr fun item member => ?_
    refine miss item (List.mem_of_mem_erase (List.mem_of_mem_erase member)) ?_ ?_
    · exact fun keyEqual => keysNodup.1 (Or.inr ⟨item, member, keyEqual⟩)
    · exact fun keyEqual => keysNodup.2.1 ⟨item, member, keyEqual⟩
  refine (rotate.filterMap predicate).trans ?_
  cases resultA : predicate anchorA <;> cases resultB : predicate anchorB <;>
    simp [resultA, resultB, restEmpty]

/-- Distinct target nodes force distinct Sequence Flow identifiers on a well-formed graph.

This law is deliberately unreferenced. It exists to audit one hypothesis decision: `flowA.id ≠ flowB.id` must not be added as a premise of `enabledTransitionsAtTwoTokens`, because the statement below derives it from that theorem's own well-formedness, Flow-membership, target, and distinct-node hypotheses. Nothing consumes it, so it does not itself prevent a future edit from re-adding that redundant premise. -/
theorem flowIdsDifferAtDistinctTargets (source : CheckedProcess)
    (flowA flowB : CheckedSequenceFlow) (nodeA nodeB : CheckedNode)
    (wellFormed : sourceGraphWellFormed source = true)
    (flowAMember : flowA ∈ source.sequenceFlows)
    (flowBMember : flowB ∈ source.sequenceFlows)
    (nodeAIsTarget : nodeA.id = flowA.targetId)
    (nodeBIsTarget : nodeB.id = flowB.targetId)
    (distinctNodes : nodeA.id ≠ nodeB.id) :
    flowA.id ≠ flowB.id := by
  have facts := sourceGraphFacts source wellFormed
  intro identical
  have same : flowA = flowB :=
    key_injective_on_members (·.id) source.sequenceFlows facts.flowIdsDistinct
      flowA flowAMember flowB flowBMember identical
  exact distinctNodes (by rw [nodeAIsTarget, nodeBIsTarget, same])

/-- At a frontier of exactly two tokens aimed at two distinct checked nodes, the enabled-transition list is a permutation of the two targeted nodes' contributions. Neither token storage order nor `source.nodes` order enters the statement, and either contribution may be `none`. -/
theorem enabledTransitionsAtTwoTokens (source : CheckedProcess)
    (state : SourceRuntimeState)
    (flowA flowB : CheckedSequenceFlow) (nodeA nodeB : CheckedNode)
    (wellFormed : sourceGraphWellFormed source = true)
    (flowAMember : flowA ∈ source.sequenceFlows)
    (flowBMember : flowB ∈ source.sequenceFlows)
    (nodeAMember : nodeA ∈ source.nodes)
    (nodeBMember : nodeB ∈ source.nodes)
    (nodeAIsTarget : nodeA.id = flowA.targetId)
    (nodeBIsTarget : nodeB.id = flowB.targetId)
    (distinctNodes : nodeA.id ≠ nodeB.id)
    (twoTokens : state.tokens.Perm [flowA.id, flowB.id])
    (notPending : state.initiationPending = false) :
    (enabledTransitions source state).Perm
      (((fireNode? source nodeA state).map
          fun successor => (nodeA, successor)).toList ++
        ((fireNode? source nodeB state).map
          fun successor => (nodeB, successor)).toList) := by
  have facts := sourceGraphFacts source wellFormed
  have perm : state.tokens.Perm ([flowA, flowB].map (·.id)) := by
    simpa using twoTokens
  have miss : ∀ candidate ∈ source.nodes, candidate.id ≠ nodeA.id →
      candidate.id ≠ nodeB.id →
      (fun candidate => (fireNode? source candidate state).map
        fun successor => (candidate, successor)) candidate = none := by
    intro candidate candidateMember differsA differsB
    show ((fireNode? source candidate state).map
      fun successor => (candidate, successor)) = none
    refine (nodeDisabled source state candidate
      (facts.arityValid candidate candidateMember) ?_ notPending) ▸ rfl
    refine incomingUntokened source state [flowA, flowB] candidate.id
      facts.flowIdsDistinct ?_ ?_ perm
    · intro flow member
      rcases List.mem_cons.mp member with rfl | member
      · exact flowAMember
      · rcases List.mem_cons.mp member with rfl | member
        · exact flowBMember
        · cases member
    · intro flow member
      rcases List.mem_cons.mp member with rfl | member
      · exact fun equal => differsA (by rw [nodeAIsTarget]; exact equal)
      · rcases List.mem_cons.mp member with rfl | member
        · exact fun equal => differsB (by rw [nodeBIsTarget]; exact equal)
        · cases member
  rw [enabledTransitions]
  exact filterMap_isolated_pair (·.id) _ nodeA nodeB source.nodes nodeAMember
    nodeBMember distinctNodes facts.nodeIdsDistinct miss

end BpmnSemantics.Experiments.CheckedSourceParallelFrontier
