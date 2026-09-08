import BpmnSemantics.SemanticProcess.InternalPreparedArming
import BpmnSemantics.SemanticProcess.InternalDataArmingAcceptedPublication

/-! Pair laws lift to arbitrary prefixes and permutations without assuming successor invariants. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_arming_pair (program : Program) (state : RuntimeState)
    (left right : PreparedInternalArming)
    (leftPrepared : left.Prepared program state)
    (rightPrepared : right.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (independent : left.Independent right) :
    right.Prepared program (left.apply state) ∧
      left.Prepared program (right.apply state) ∧
      right.apply (left.apply state) = left.apply (right.apply state) := by
  cases left with
  | ordinary leftOperation leftPatch =>
      cases right with
      | ordinary rightOperation rightPatch =>
          exact ⟨prepared_patch_frame program state leftOperation rightOperation leftPatch rightPatch
              leftPrepared rightPrepared independent.1,
            prepared_patch_frame program state rightOperation leftOperation rightPatch leftPatch
              rightPrepared leftPrepared independent.2,
            applyInternalArmingPatches_commute state leftPatch rightPatch canonical independent.1⟩
      | data contract data =>
          have pair := prepared_data_ordinary_pair_commutes program state contract data
            leftOperation leftPatch rightPrepared leftPrepared canonical independent.2
          exact ⟨pair.1, pair.2.1, pair.2.2.symm⟩
  | data leftContract leftPatch =>
      cases right with
      | ordinary operation patch =>
          have pair := prepared_data_ordinary_pair_commutes program state leftContract leftPatch
            operation patch leftPrepared rightPrepared canonical independent.1
          exact ⟨pair.2.1, pair.1, pair.2.2⟩
      | data rightContract rightPatch =>
          exact prepared_data_pair_commutes program state leftContract rightContract leftPatch
            rightPatch leftPrepared rightPrepared canonical independent.1

theorem prepared_arming_preserves (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : prepared.Prepared program state) :
    runtimeStateWellFormed program instanceId (prepared.apply state) = true ∧
      (projectOpenFlowNodeOccurrences? program (prepared.apply state)).isSome = true := by
  cases prepared with
  | ordinary operation patch =>
      exact prepared_arm_preserves_runtime_and_open_set program state operation patch instanceId
        programValid stateValid openBefore selected
  | data contract patch =>
      exact prepared_data_arm_preserves_runtime_and_open_set program state contract patch instanceId
        programValid stateValid openBefore selected

def PreparedArmingList (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalArming) : Prop :=
  ∀ member ∈ prepared, member.Prepared program state

theorem prepared_arming_tail (program : Program) (state : RuntimeState)
    (head : PreparedInternalArming) (tail : List PreparedInternalArming)
    (selected : PreparedArmingList program state (head :: tail))
    (canonical : canonicalCollectionOrder state = true)
    (independent : (head :: tail).Pairwise PreparedInternalArming.Independent) :
    PreparedArmingList program (head.apply state) tail := by
  intro member present
  exact (prepared_arming_pair program state head member (selected head (by simp))
    (selected member (by simp [present])) canonical
    ((List.pairwise_cons.mp independent).1 member present)).1

/-- Every prefix invariant is derived from the original preparations and all-pairs separation. -/
theorem prepared_arming_batch_preserves (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalArming) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedArmingList program state prepared)
    (independent : prepared.Pairwise PreparedInternalArming.Independent) :
    runtimeStateWellFormed program instanceId (applyInternalArmingBatch state prepared) = true ∧
      (projectOpenFlowNodeOccurrences? program
        (applyInternalArmingBatch state prepared)).isSome = true := by
  induction prepared generalizing state with
  | nil => exact ⟨stateValid, openBefore⟩
  | cons head tail ih =>
      have valid := prepared_arming_preserves program state head instanceId programValid
        stateValid openBefore (selected head (by simp))
      exact ih (head.apply state) valid.1 valid.2
        (prepared_arming_tail program state head tail selected
          (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
          independent)
        (List.pairwise_cons.mp independent).2

theorem prepared_arming_batch_frame (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalArming) (query : PreparedInternalArming)
    (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedArmingList program state prepared)
    (queryPrepared : query.Prepared program state)
    (independent : prepared.Pairwise PreparedInternalArming.Independent)
    (separated : ∀ member ∈ prepared, member.Independent query) :
    query.Prepared program (applyInternalArmingBatch state prepared) := by
  induction prepared generalizing state with
  | nil => exact queryPrepared
  | cons head tail ih =>
      have canonical := runtimeStateWellFormed_canonicalCollectionOrder program instanceId state
        stateValid
      have valid := prepared_arming_preserves program state head instanceId programValid
        stateValid openBefore (selected head (by simp))
      have frame := (prepared_arming_pair program state head query (selected head (by simp))
        queryPrepared canonical (separated head (by simp))).1
      exact ih (head.apply state) valid.1 valid.2
        (prepared_arming_tail program state head tail selected canonical independent) frame
        (List.pairwise_cons.mp independent).2
        (fun member present => separated member (by simp [present]))

/-- List permutation preserves multiplicity; adjacent swaps use the invariant at their predecessor. -/
theorem prepared_arming_batch_perm (program : Program) (state : RuntimeState)
    (left right : List PreparedInternalArming) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedArmingList program state left)
    (independent : left.Pairwise PreparedInternalArming.Independent)
    (permutation : left.Perm right) :
    applyInternalArmingBatch state left = applyInternalArmingBatch state right := by
  induction permutation generalizing state with
  | nil => rfl
  | cons head permutation ih =>
      have valid := prepared_arming_preserves program state head instanceId programValid
        stateValid openBefore (selected head (by simp))
      exact ih (head.apply state) valid.1 valid.2
        (prepared_arming_tail program state head _ selected
          (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
          independent)
        (List.pairwise_cons.mp independent).2
  | swap first second tail =>
      have pair := prepared_arming_pair program state second first
        (selected second (by simp)) (selected first (by simp))
        (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
        ((List.pairwise_cons.mp independent).1 first (by simp))
      simp only [applyInternalArmingBatch, List.foldl_cons]
      rw [pair.2.2]
  | trans first second ihFirst ihSecond =>
      exact (ihFirst state stateValid openBefore selected independent).trans
        (ihSecond state stateValid openBefore
          (fun member present => selected member (first.mem_iff.mpr present))
          (independent.perm first PreparedInternalArming.independent_symm))

end BpmnSemantics.SemanticProcess.InternalCommutation
