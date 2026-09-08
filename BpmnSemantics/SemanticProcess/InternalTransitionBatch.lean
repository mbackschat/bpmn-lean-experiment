import BpmnSemantics.SemanticProcess.InternalPreparedTransition
import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
import BpmnSemantics.SemanticProcess.InternalLocalControlPairPublication

/-! Complete mixed preparations lift to arbitrary finite prefixes and multiplicity-preserving
permutations under the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_transition_pair (program : Program) (state : RuntimeState)
    (left right : PreparedInternalTransition)
    (leftPrepared : left.Prepared program state)
    (rightPrepared : right.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (independent : left.Independent right) :
    right.Prepared program (left.apply state) ∧
      left.Prepared program (right.apply state) ∧
      right.apply (left.apply state) = left.apply (right.apply state) := by
  cases left with
  | arming left =>
      cases right with
      | arming right =>
          exact prepared_arming_pair program state left right leftPrepared rightPrepared
            canonical independent
      | localControl right =>
          have pair := prepared_local_control_arming_pair program state right.operation right
            left rightPrepared leftPrepared canonical
            (localControlStateFootprintsNonInterfering_symm _ _ independent)
          exact ⟨pair.2.1, pair.1, pair.2.2.symm⟩
  | localControl left =>
      cases right with
      | arming right =>
          exact prepared_local_control_arming_pair program state left.operation left right
            leftPrepared rightPrepared canonical independent
      | localControl right =>
          have pair := prepared_local_control_pair_commutes program state left.operation
            right.operation left right leftPrepared rightPrepared canonical independent
          exact ⟨pair.2.1, pair.1, pair.2.2⟩

theorem prepared_transition_control_frame (state : RuntimeState)
    (prepared : PreparedInternalTransition) :
    (prepared.apply state).control = state.control := by
  cases prepared with
  | arming arm =>
      cases arm with
      | ordinary operation patch => exact armingControlRead_frame state patch
      | data contract patch => exact armingControlRead_frame state patch.arm
  | localControl localPrepared => rfl

theorem prepared_transition_preserves (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : prepared.Prepared program state) :
    runtimeStateWellFormed program instanceId (prepared.apply state) = true ∧
      (prepared.apply state).control = .running instanceId ∧
      (projectOpenFlowNodeOccurrences? program (prepared.apply state)).isSome = true := by
  have control := (prepared_transition_control_frame state prepared).trans running
  cases prepared with
  | arming arm =>
      have preserved := prepared_arming_preserves program state arm instanceId
        programValid stateValid openBefore selected
      exact ⟨preserved.1, control, preserved.2⟩
  | localControl localPrepared =>
      refine ⟨prepareInternalLocalControl_preserves_runtimeStateWellFormed program state
        localPrepared.operation localPrepared instanceId programValid stateValid running selected,
        control, ?_⟩
      change (projectOpenFlowNodeOccurrences? program
        (localPrepared.selection.apply state)).isSome = true
      rw [prepareInternalLocalControl_open_occurrences_frame program state
        localPrepared.operation localPrepared instanceId stateValid running selected]
      exact openBefore

theorem prepared_transition_applies (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (selected : prepared.Prepared program state) :
    fire? program prepared.operation state = some (prepared.apply state) ∧
      applyPreparedInternalTransition? program state prepared = some (prepared.apply state) := by
  constructor
  · cases prepared with
    | arming arm => exact (prepared_arming_applies program state arm snapshots selected).1
    | localControl localPrepared =>
        exact prepareInternalLocalControl_refines program state localPrepared.operation
          localPrepared snapshots selected
  · simp [applyPreparedInternalTransition?, snapshots, selected]

def PreparedTransitionList (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) : Prop :=
  ∀ member ∈ prepared, member.Prepared program state

theorem prepared_transition_tail (program : Program) (state : RuntimeState)
    (head : PreparedInternalTransition) (tail : List PreparedInternalTransition)
    (selected : PreparedTransitionList program state (head :: tail))
    (canonical : canonicalCollectionOrder state = true)
    (independent : (head :: tail).Pairwise PreparedInternalTransition.Independent) :
    PreparedTransitionList program (head.apply state) tail := by
  intro member present
  exact (prepared_transition_pair program state head member (selected head (by simp))
    (selected member (by simp [present])) canonical
    ((List.pairwise_cons.mp independent).1 member present)).1

/-- Each recursive step derives validity, running identity, projectability, and the complete
remaining preparations from its predecessor; no successor fact is supplied by the caller. -/
theorem prepared_transition_batch_preserves (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedTransitionList program state prepared)
    (independent : prepared.Pairwise PreparedInternalTransition.Independent) :
    runtimeStateWellFormed program instanceId (applyInternalTransitionBatch state prepared) = true ∧
      (applyInternalTransitionBatch state prepared).control = .running instanceId ∧
      (projectOpenFlowNodeOccurrences? program
        (applyInternalTransitionBatch state prepared)).isSome = true := by
  induction prepared generalizing state with
  | nil => exact ⟨stateValid, running, openBefore⟩
  | cons head tail ih =>
      have valid := prepared_transition_preserves program state head instanceId programValid
        stateValid running openBefore (selected head (by simp))
      exact ih (head.apply state) valid.1 valid.2.1 valid.2.2
        (prepared_transition_tail program state head tail selected
          (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
          independent)
        (List.pairwise_cons.mp independent).2

theorem prepared_transition_batch_frame (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (query : PreparedInternalTransition)
    (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedTransitionList program state prepared)
    (queryPrepared : query.Prepared program state)
    (independent : prepared.Pairwise PreparedInternalTransition.Independent)
    (separated : ∀ member ∈ prepared, member.Independent query) :
    query.Prepared program (applyInternalTransitionBatch state prepared) := by
  induction prepared generalizing state with
  | nil => exact queryPrepared
  | cons head tail ih =>
      have canonical := runtimeStateWellFormed_canonicalCollectionOrder program instanceId state
        stateValid
      have valid := prepared_transition_preserves program state head instanceId programValid
        stateValid running openBefore (selected head (by simp))
      have frame := (prepared_transition_pair program state head query (selected head (by simp))
        queryPrepared canonical (separated head (by simp))).1
      exact ih (head.apply state) valid.1 valid.2.1 valid.2.2
        (prepared_transition_tail program state head tail selected canonical independent) frame
        (List.pairwise_cons.mp independent).2
        (fun member present => separated member (by simp [present]))

/-- List permutation preserves multiplicity, and each adjacent swap uses the actual predecessor's
canonical state. This covers arbitrary finite mixed lists without a bound on their length. -/
theorem prepared_transition_batch_perm (program : Program) (state : RuntimeState)
    (left right : List PreparedInternalTransition) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedTransitionList program state left)
    (independent : left.Pairwise PreparedInternalTransition.Independent)
    (permutation : left.Perm right) :
    applyInternalTransitionBatch state left = applyInternalTransitionBatch state right := by
  induction permutation generalizing state with
  | nil => rfl
  | cons head permutation ih =>
      have valid := prepared_transition_preserves program state head instanceId programValid
        stateValid running openBefore (selected head (by simp))
      exact ih (head.apply state) valid.1 valid.2.1 valid.2.2
        (prepared_transition_tail program state head _ selected
          (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
          independent)
        (List.pairwise_cons.mp independent).2
  | swap first second tail =>
      have pair := prepared_transition_pair program state second first
        (selected second (by simp)) (selected first (by simp))
        (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
        ((List.pairwise_cons.mp independent).1 first (by simp))
      simp only [applyInternalTransitionBatch, List.foldl_cons]
      rw [pair.2.2]
  | trans first second ihFirst ihSecond =>
      exact (ihFirst state stateValid running openBefore selected independent).trans
        (ihSecond state stateValid running openBefore
          (fun member present => selected member (first.mem_iff.mpr present))
          (independent.perm first PreparedInternalTransition.independent_symm))

theorem prepared_transition_batch_perm_preserves (program : Program) (state : RuntimeState)
    (left right : List PreparedInternalTransition) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (selected : PreparedTransitionList program state left)
    (independent : left.Pairwise PreparedInternalTransition.Independent)
    (permutation : left.Perm right) :
    applyInternalTransitionBatch state left = applyInternalTransitionBatch state right ∧
      runtimeStateWellFormed program instanceId (applyInternalTransitionBatch state right) = true ∧
      (applyInternalTransitionBatch state right).control = .running instanceId ∧
      (projectOpenFlowNodeOccurrences? program
        (applyInternalTransitionBatch state right)).isSome = true := by
  have same := prepared_transition_batch_perm program state left right instanceId programValid
    stateValid running openBefore selected independent permutation
  refine ⟨same, ?_⟩
  rw [← same]
  exact prepared_transition_batch_preserves program state left instanceId programValid
    stateValid running openBefore selected independent

def runPreparedTransitionBatch? (program : Program) (state : RuntimeState) :
    List PreparedInternalTransition → Option RuntimeState
  | [] => some state
  | head :: tail => do
      let next ← applyPreparedInternalTransition? program state head
      runPreparedTransitionBatch? program next tail

def fireInternalTransitionBatch? (program : Program) (state : RuntimeState) :
    List SemanticOperation → Option RuntimeState
  | [] => some state
  | head :: tail => do
      let next ← fire? program head state
      fireInternalTransitionBatch? program next tail

/-- The real evaluator and checked prepared fold both succeed at every derived prefix. Snapshot
exclusion is needed for these execution paths, not for the raw-state permutation law. -/
theorem prepared_transition_batch_applies (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (instanceId : SemanticId)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (selected : PreparedTransitionList program state prepared)
    (independent : prepared.Pairwise PreparedInternalTransition.Independent) :
    runPreparedTransitionBatch? program state prepared =
        some (applyInternalTransitionBatch state prepared) ∧
      fireInternalTransitionBatch? program state
        (prepared.map PreparedInternalTransition.operation) =
        some (applyInternalTransitionBatch state prepared) := by
  induction prepared generalizing state with
  | nil => exact ⟨rfl, rfl⟩
  | cons head tail ih =>
      have applied := prepared_transition_applies program state head snapshots (selected head (by simp))
      have valid := prepared_transition_preserves program state head instanceId programValid
        stateValid running openBefore (selected head (by simp))
      have rest := ih (head.apply state) valid.1 valid.2.1 valid.2.2
        (prepared_transition_tail program state head tail selected
          (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state stateValid)
          independent)
        (List.pairwise_cons.mp independent).2
      simpa only [runPreparedTransitionBatch?, fireInternalTransitionBatch?, List.map_cons,
        applied.1, applied.2, Bind.bind, Option.bind, applyInternalTransitionBatch, List.foldl_cons]
        using rest

end BpmnSemantics.SemanticProcess.InternalCommutation
